import tanstackStart from '@tanstack/react-start/server-entry';

export { TheRaceGame } from './do/the-race-game';

const WS_GAME_PATTERN = /^\/ws\/games\/the-race\/([^/]+)$/;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const wsMatch = WS_GAME_PATTERN.exec(url.pathname);

		if (wsMatch && request.headers.get('Upgrade') === 'websocket') {
			const gameId = wsMatch[1]!;
			const id = env.THE_RACE_GAME.idFromName(gameId);
			const stub = env.THE_RACE_GAME.get(id);
			return stub.fetch(request);
		}

		return tanstackStart.fetch(request, env, ctx);
	},
};
