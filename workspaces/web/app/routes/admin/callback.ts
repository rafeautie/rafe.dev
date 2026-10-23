import { createFileRoute } from '@tanstack/react-router';
import { env } from 'cloudflare:workers';
import { ADMIN_GITHUB_ID } from '~/lib/admin/config';
import { adminSession, redirectTo } from '~/lib/admin/session.server';

// Step two: GitHub sends the browser back with a one-time code. The code is
// swapped for a token, and the token kept only if it belongs to Rafe.
export const Route = createFileRoute('/admin/callback')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const session = await adminSession();
				const back = (search = '') => redirectTo(new URL(`/admin${search}`, url).href, 302);

				const code = url.searchParams.get('code');
				const state = url.searchParams.get('state');
				if (!code || !state || state !== session.data.state) {
					await session.clear();
					return back('?signin=failed');
				}

				const exchange = await fetch('https://github.com/login/oauth/access_token', {
					method: 'POST',
					headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
					body: JSON.stringify({
						client_id: env.GITHUB_CLIENT_ID,
						client_secret: env.GITHUB_CLIENT_SECRET,
						code,
						redirect_uri: new URL('/admin/callback', url).href
					})
				});
				const { access_token: token } = (await exchange.json()) as { access_token?: string };
				if (!token) {
					await session.clear();
					return back('?signin=failed');
				}

				const user = await fetch('https://api.github.com/user', {
					headers: {
						Accept: 'application/vnd.github+json',
						Authorization: `Bearer ${token}`,
						'User-Agent': 'rafe.dev-admin'
					}
				});
				const { id, login, avatar_url } = (await user.json()) as {
					id?: number;
					login?: string;
					avatar_url?: string;
				};
				if (id !== ADMIN_GITHUB_ID || !login) {
					await session.clear();
					return back('?signin=denied');
				}

				await session.update({ token, userId: id, login, avatarUrl: avatar_url, state: undefined });
				return back();
			}
		}
	}
});
