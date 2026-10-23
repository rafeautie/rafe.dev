import { createFileRoute } from '@tanstack/react-router';
import { adminSession, redirectTo } from '~/lib/admin/session.server';

// A form post from the overview's "sign out".
export const Route = createFileRoute('/admin/logout')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const url = new URL(request.url);
				const origin = request.headers.get('origin');
				if (origin && origin !== url.origin) return new Response('Wrong origin', { status: 403 });
				const session = await adminSession();
				await session.clear();
				return redirectTo(new URL('/admin', url).href, 303);
			}
		}
	}
});
