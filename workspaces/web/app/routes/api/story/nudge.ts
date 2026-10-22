import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/story/nudge')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { sendNudge } = await import('~/story/server/nudge');
				return sendNudge(request);
			}
		}
	}
});
