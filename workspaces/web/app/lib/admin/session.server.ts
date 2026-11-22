import { env } from 'cloudflare:workers';
import { deleteCookie, getCookie, getRequest, setCookie } from '@tanstack/react-start/server';
import { getIronSession } from 'iron-session';
import { ADMIN_GITHUB_ID, SIGNED_IN_COOKIE } from './config';
import { EIGHT_HOURS, sessionOptions, type AdminSession } from './session';

// iron-session seals it with SESSION_SECRET (see sessionOptions) and reads and
// writes it through TanStack Start's cookie helpers. Change the session's
// fields, then save() to send the cookie or destroy() to remove it, before the
// response is returned.
export function adminSession() {
	return getIronSession<AdminSession>(
		{
			read: (name) => getCookie(name),
			write: (name, value, options) => setCookie(name, value, options)
		},
		sessionOptions(env.SESSION_SECRET)
	);
}

// The public pages' hint (SIGNED_IN_COOKIE), set and cleared with the session.
export function markSignedIn(signedIn: boolean) {
	if (Boolean(getCookie(SIGNED_IN_COOKIE)) === signedIn) return;
	const options = { secure: true, sameSite: 'lax', path: '/' } as const;
	if (signedIn) setCookie(SIGNED_IN_COOKIE, '1', { ...options, maxAge: EIGHT_HOURS });
	else deleteCookie(SIGNED_IN_COOKIE, options);
}

export class NotSignedIn extends Error {
	constructor() {
		super('Not signed in');
	}
}

// Who is signed in, or null. Only Rafe's account ever gets a session, but the
// id is checked again here in case that ever changes.
export async function currentAdmin() {
	const session = await adminSession();
	const { token, userId, login, avatarUrl } = session;
	if (!token || userId !== ADMIN_GITHUB_ID || !login) return null;
	return { token, login, avatarUrl: avatarUrl ?? '' };
}

// For every admin action: the GitHub token, or an error. Changes also have to
// come from this site, on top of the cookie's SameSite=Lax.
export async function requireToken() {
	const request = getRequest();
	if (request.method !== 'GET') {
		const origin = request.headers.get('origin');
		if (origin && origin !== new URL(request.url).origin) throw new Error('Wrong origin');
	}
	const admin = await currentAdmin();
	if (!admin) throw new NotSignedIn();
	return admin.token;
}

// A redirect whose headers stay writable, so the session cookie set while
// handling the request can be added to it. Response.redirect's are frozen.
export function redirectTo(location: string, status: 301 | 302 | 303 = 302) {
	return new Response(null, { status, headers: { Location: location } });
}
