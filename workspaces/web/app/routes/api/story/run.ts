import { createFileRoute } from '@tanstack/react-router';

// Runs the daily job now, whatever the time, for a day that ran late or for
// testing: curl -X POST -H "Authorization: Bearer $STORY_ADMIN_TOKEN"
// https://rafe.dev/api/story/run. It waits for the chapter, a few minutes.
export const Route = createFileRoute('/api/story/run')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { authorized, runDailyJob } = await import('~/story/server/job');
				if (!(await authorized(request))) return new Response('Unauthorized', { status: 401 });
				try {
					return Response.json(await runDailyJob(new Date(), { force: true }));
				} catch (error) {
					return Response.json({ error: String(error) }, { status: 500 });
				}
			}
		}
	}
});
