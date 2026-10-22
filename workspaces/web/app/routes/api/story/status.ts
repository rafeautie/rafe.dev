import { createFileRoute } from '@tanstack/react-router';

// What the pending page polls: the countdown's state, the nudge count, and
// whether this reader has already nudged.
export const Route = createFileRoute('/api/story/status')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { storyStatus } = await import('~/story/server/nudge');
				return Response.json(await storyStatus(request), {
					headers: { 'Cache-Control': 'no-store' }
				});
			}
		}
	}
});
