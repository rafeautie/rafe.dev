import { env } from 'cloudflare:workers';
import { createFileRoute } from '@tanstack/react-router';
import { adminSession, markSignedIn, redirectTo } from '~/lib/admin/session.server';

// A form post from the overview's "sign out".
export const Route = createFileRoute('/admin/logout')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const url = new URL(request.url);
				const origin = request.headers.get('origin');
				if (origin && origin !== url.origin) return new Response('Wrong origin', { status: 403 });
				const session = await adminSession();
				const { token } = session.data;
				await session.clear();
				markSignedIn(false);
				// end the token at GitHub too, so a copy of the cookie stops working
				if (token) {
					await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
						method: 'DELETE',
						headers: {
							authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
							accept: 'application/vnd.github+json',
							'user-agent': 'rafe.dev-admin'
						},
						body: JSON.stringify({ access_token: token })
					}).catch(() => undefined);
				}
				return redirectTo(new URL('/admin', url).href, 303);
			}
		}
	}
});
