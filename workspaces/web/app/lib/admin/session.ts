import type { SessionOptions } from 'iron-session';

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

export const EIGHT_HOURS = 8 * 60 * 60;

// How iron-session seals the cookie. Apart from session.server.ts so the tests
// can use it without TanStack Start's request context.
export function sessionOptions(password: string): SessionOptions {
	return {
		cookieName: 'rafe-admin',
		password,
		ttl: EIGHT_HOURS,
		cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' }
	};
}
