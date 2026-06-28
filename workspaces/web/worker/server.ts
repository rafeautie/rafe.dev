import tanstackStart from '@tanstack/react-start/server-entry';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return tanstackStart.fetch(request, env, ctx);
	}
};
