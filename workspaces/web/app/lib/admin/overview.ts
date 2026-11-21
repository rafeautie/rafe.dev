import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';
import { stats } from '~/lib/stats/store.server';
import { zoneOffset } from '~/lib/stats/zone';
import { PHOTOS_DIR, PHOTOS_MANIFEST, WRITING_DIR } from './config';
import { readFields, splitPost } from './frontmatter';
import { gitHub } from './github.server';
import { requireToken } from './session.server';

// What /admin's overview shows of each area: a few numbers and what to pick
// up next, never the whole list. Each area is its own server function, so the
// page asks for them side by side and one that fails leaves the others shown.

const DAY = 24 * 60 * 60 * 1000;
// how many drafts the overview offers to pick back up
const DRAFTS_SHOWN = 3;
// a draft's last edit costs a call to GitHub each, so only the newest are read
const DRAFTS_READ = 10;

// Today as a count of days since 1970, in Rafe's own calendar, from where his
// request comes from (as /admin/stats reckons days).
function today(now = Date.now()) {
	const cf = (getRequest() as { cf?: IncomingRequestCfProperties }).cf;
	const offset = zoneOffset(cf?.timezone ?? 'UTC', now);
	return { day: Math.floor((now + offset) / DAY), offset };
}

export type DraftSummary = { slug: string; title: string; edited: string };

export const getWritingSummary = createServerFn({ method: 'GET' }).handler(async () => {
	const github = gitHub(await requireToken());
	const { files } = await github.contentTree(await github.head());
	const pattern = new RegExp(`^${WRITING_DIR}/([^/]+)/index\\.md$`);
	const posts = await Promise.all(
		[...files].flatMap(([path, sha]) => {
			const match = path.match(pattern);
			if (!match) return [];
			return [
				github.blobText(sha).then((source) => ({
					slug: match[1],
					...readFields(splitPost(source).yaml)
				}))
			];
		})
	);
	const published = posts
		.filter((post) => !post.draft && post.date)
		.sort((a, b) => b.date.localeCompare(a.date));
	const drafts = posts
		.filter((post) => post.draft)
		.sort((a, b) => b.date.localeCompare(a.date))
		.slice(0, DRAFTS_READ);
	// a draft's own date is often empty, so the one to pick up is the one last
	// worked on, from the commits to its folder
	const edited = await Promise.all(
		drafts.map(async (draft): Promise<DraftSummary> => {
			const [last] = await github.history(`${WRITING_DIR}/${draft.slug}`, 1);
			return { slug: draft.slug, title: draft.title || draft.slug, edited: last?.date ?? '' };
		})
	);
	return {
		published: published.length,
		drafts: posts.length - published.length,
		latest: published[0]
			? {
					slug: published[0].slug,
					title: published[0].title,
					date: published[0].date,
					daysAgo: Math.max(0, today().day - Math.floor(Date.parse(published[0].date) / DAY))
				}
			: null,
		recentDrafts: edited.sort((a, b) => b.edited.localeCompare(a.edited)).slice(0, DRAFTS_SHOWN)
	};
});

// /photos shows them in the manifest's order, so its first few are what a
// visitor sees first.
const PHOTOS_SHOWN = 4;

export const getPhotosSummary = createServerFn({ method: 'GET' }).handler(async () => {
	const github = gitHub(await requireToken());
	const head = await github.head();
	const [{ files }, [last]] = await Promise.all([
		github.contentTree(head),
		github.history(PHOTOS_DIR, 1)
	]);
	const sha = files.get(PHOTOS_MANIFEST);
	// edited by hand too, so read loosely: a photo here only needs its file
	const listed: unknown = sha ? JSON.parse(await github.blobText(sha)) : [];
	const photos = (Array.isArray(listed) ? listed : []).flatMap((item) => {
		const { file, alt } = (item ?? {}) as Record<string, unknown>;
		return typeof file === 'string' ? [{ file, alt: typeof alt === 'string' ? alt : '' }] : [];
	});
	return {
		count: photos.length,
		// a photo with no alt text says nothing to someone who cannot see it
		missingAlt: photos.filter((photo) => !photo.alt.trim()).length,
		first: photos.slice(0, PHOTOS_SHOWN),
		ref: head,
		changed: last ? { date: last.date, message: last.message } : null
	};
});

export const getVisitsSummary = createServerFn({ method: 'GET' }).handler(async () => {
	await requireToken();
	const db = await stats();
	const now = Date.now();
	const { day: current, offset } = today(now);
	// this week is today and the six days before it; the week before, for the trend
	const week = (current - 6) * DAY - offset;
	const before = (current - 13) * DAY - offset;
	const visitor = 'coalesce(visitor, session)';

	const [totals, previous, days, pages, here] = await db.batch([
		db
			.prepare(
				`SELECT count(DISTINCT ${visitor}) AS visitors, count(*) AS views FROM views WHERE at >= ?`
			)
			.bind(week),
		db
			.prepare(`SELECT count(DISTINCT ${visitor}) AS visitors FROM views WHERE at >= ? AND at < ?`)
			.bind(before, week),
		db
			.prepare(
				`SELECT CAST((at + ?) / ? AS INTEGER) AS day, count(DISTINCT ${visitor}) AS visitors
				FROM views WHERE at >= ? GROUP BY day`
			)
			.bind(offset, DAY, week),
		db
			.prepare(
				`SELECT path, count(DISTINCT ${visitor}) AS visitors FROM views WHERE at >= ?
				GROUP BY path ORDER BY visitors DESC, count(*) DESC LIMIT 3`
			)
			.bind(week),
		// anyone whose page was still open and reporting in the last five minutes
		db
			.prepare(`SELECT count(DISTINCT ${visitor}) AS visitors FROM views WHERE seen >= ?`)
			.bind(now - 5 * 60 * 1000)
	]);
	const first = <T>(result: D1Result) => result.results[0] as T;
	const perDay = new Map(
		(days.results as { day: number; visitors: number }[]).map((row) => [row.day, row.visitors])
	);
	return {
		visitors: first<{ visitors: number }>(totals).visitors,
		views: first<{ views: number }>(totals).views,
		previous: first<{ visitors: number }>(previous).visitors,
		here: first<{ visitors: number }>(here).visitors,
		// oldest first; `at` is midnight of that day, read as UTC
		days: Array.from({ length: 7 }, (_, index) => {
			const day = current - 6 + index;
			return { at: day * DAY, visitors: perDay.get(day) ?? 0 };
		}),
		pages: pages.results as { path: string; visitors: number }[]
	};
});

export const getRaceSummary = createServerFn({ method: 'GET' }).handler(async () => {
	await requireToken();
	const view = await env.RACE_ROOM.getByName('race').adminView('');
	const { loop, history } = view;
	const week = Date.now() - 7 * DAY;
	return {
		round: loop.round,
		phase: loop.phase,
		paused: loop.paused,
		endsAt: loop.endsAt,
		now: loop.now,
		watching: loop.viewers,
		// the room lists at most 100, most recently seen first
		players: view.players.length,
		playersThisWeek: view.players.filter((player) => player.seen >= week).length,
		run: history.totals.run,
		net: history.totals.net,
		// the house's take, race by race, oldest first
		recent: history.races
			.slice(0, 20)
			.reverse()
			.map((race) => ({ round: race.round, net: race.net, voided: race.voided }))
	};
});
