import { createFileRoute } from '@tanstack/react-router';
import { env } from 'cloudflare:workers';
import { adminSession, redirectTo } from '~/lib/admin/session.server';

// Step one of signing in: off to GitHub, carrying a random state that the
// /admin/auth checks, so a sign-in cannot be started by another site.
export const Route = createFileRoute('/admin/login')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const state = crypto.randomUUID();
				const session = await adminSession();
				await session.update({ state });
				const authorize = new URL('https://github.com/login/oauth/authorize');
				authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
				authorize.searchParams.set('redirect_uri', new URL('/admin/auth', request.url).href);
				authorize.searchParams.set('state', state);
				return redirectTo(authorize.href, 302);
			}
		}
	}
});
