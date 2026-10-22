import { env } from 'cloudflare:workers';
import { LATEST } from '..';
import { cleanNudge, nudgeTarget, pendingState, waiting } from '../nudges';
import { db, getStatus } from './db';

const COOKIE = 'story_nudge';

export type StoryStatus = {
	latest: number;
	// the chapter a nudge sent now goes into
	target: number;
	state: ReturnType<typeof pendingState>;
	detail: string | null;
	// nudges waiting for the target chapter
	count: number;
	// the chapter this reader's nudge went into, while it is not yet out
	nudged: number | null;
	// Turnstile's public key, for the nudge box
	siteKey: string;
};

export async function storyStatus(request: Request): Promise<StoryStatus> {
	const status = await getStatus();
	const target = nudgeTarget(LATEST, status);
	const state = pendingState(LATEST, status);
	const nudged = cookieChapter(request);
	return {
		latest: LATEST,
		target,
		state,
		detail: state ? status!.detail : null,
		count: await countNudges(target),
		nudged: waiting(nudged, LATEST) ? nudged : null,
		siteKey: env.TURNSTILE_SITE_KEY
	};
}

export async function countNudges(chapter: number) {
	const row = await (await db())
		.prepare('SELECT COUNT(*) AS count FROM nudges WHERE chapter = ? AND used = 0')
		.bind(chapter)
		.first<{ count: number }>();
	return row?.count ?? 0;
}

export async function sendNudge(request: Request): Promise<Response> {
	const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
	const { success } = await env.NUDGE_LIMITER.limit({ key: ip });
	if (!success) return problem(429, 'Too many tries. Give it a minute.');

	const body = (await request.json().catch(() => null)) as {
		text?: unknown;
		token?: unknown;
	} | null;
	const text = cleanNudge(body?.text);
	if (!text) return problem(400, 'A nudge is 1 to 200 characters.');
	if (typeof body?.token !== 'string' || !(await human(body.token, ip))) {
		return problem(403, 'Could not check you are human. Try again.');
	}

	const target = nudgeTarget(LATEST, await getStatus());
	if (waiting(cookieChapter(request), LATEST)) return already();

	// One per reader for every chapter not yet out. The visitor is a keyed hash
	// of their address and the chapter, so the table cannot link a reader's
	// nudges across chapters, and nothing holds the address itself.
	const visitors = await Promise.all(
		Array.from({ length: target - LATEST }, (_, i) => visitor(ip, LATEST + 1 + i))
	);
	const database = await db();
	const seen = await database
		.prepare(`SELECT 1 FROM nudges WHERE visitor IN (${visitors.map(() => '?').join(',')}) LIMIT 1`)
		.bind(...visitors)
		.first();
	if (seen) return already();

	try {
		await database
			.prepare('INSERT INTO nudges (chapter, visitor, text, created_at) VALUES (?, ?, ?, ?)')
			.bind(target, visitors.at(-1), text, Date.now())
			.run();
	} catch (error) {
		if (String(error).includes('UNIQUE')) return already();
		throw error;
	}

	return Response.json(
		{ chapter: target, text, count: await countNudges(target) },
		{
			headers: {
				'Set-Cookie': `${COOKIE}=${target}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
			}
		}
	);
}

function already() {
	return problem(409, 'You already nudged this chapter. You can send another once it is out.');
}

function problem(status: number, message: string) {
	return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function cookieChapter(request: Request): number | null {
	const match = request.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)`));
	return match ? Number(match[1]) : null;
}

async function visitor(ip: string, chapter: number) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(env.NUDGE_HASH_KEY),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ip}:${chapter}`));
	return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function human(token: string, ip: string) {
	const form = new FormData();
	form.append('secret', env.TURNSTILE_SECRET_KEY);
	form.append('response', token);
	if (ip !== 'local') form.append('remoteip', ip);
	// If Cloudflare cannot be reached, the reader is asked to try again.
	try {
		const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body: form
		});
		const result = (await response.json()) as { success?: boolean };
		return result.success === true;
	} catch {
		return false;
	}
}
