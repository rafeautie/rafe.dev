import { env } from 'cloudflare:workers';
import { getRequest, useSession } from '@tanstack/react-start/server';
import { ADMIN_GITHUB_ID } from './config';

// The sign-in lives in one encrypted, HTTP-only cookie: GitHub's token for this
// GitHub App and who it belongs to. The browser holds it but cannot read it,
// page scripts cannot touch it, and it lapses after 8 hours, when the token
// itself expires.
export type AdminSession = {
	token?: string;
	userId?: number;
	login?: string;
	avatarUrl?: string;
	// the OAuth state, between /admin/login and /admin/auth
	state?: string;
};

const EIGHT_HOURS = 8 * 60 * 60;

export function adminSession() {
	// TanStack's server-side session helper, not a React hook
	// eslint-disable-next-line react-hooks/rules-of-hooks
	return useSession<AdminSession>({
		name: 'rafe-admin',
		password: env.SESSION_SECRET,
		maxAge: EIGHT_HOURS,
		// only ever the cookie, never a request header
		sessionHeader: false,
		cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' }
	});
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
	const { token, userId, login, avatarUrl } = session.data;
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
