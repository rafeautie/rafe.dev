import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { runDailyJob } from './story/server/job';
import { log } from './story/server/log';

// TanStack Start's own entry, plus the cron that writes the daily story
// (crons in wrangler.jsonc).
const fetch = createStartHandler(defaultStreamHandler);

export default {
	fetch,
	async scheduled(controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			runDailyJob(new Date(controller.scheduledTime)).then((outcome) =>
				log(JSON.stringify(outcome))
			)
		);
	}
};
