import handler from '@tanstack/react-start/server-entry';
import { env } from 'cloudflare:workers';
import { LOBBY_PATH, isLobbyCode } from '~/lib/zombies/signal';

// The Durable Object behind /zombies lobbies has to be exported from the
// Worker's entry, so the site has its own entry rather than TanStack Start's
// default one. Everything but a lobby connection goes to the app as before.
export { ZombiesLobby } from '~/lib/zombies/lobby.server';

export default {
	async fetch(request: Request) {
		const url = new URL(request.url);
		if (url.pathname.startsWith(LOBBY_PATH)) {
			const code = url.pathname.slice(LOBBY_PATH.length);
			if (!isLobbyCode(code) || request.headers.get('upgrade') !== 'websocket') {
				return new Response('not a lobby', { status: 400 });
			}
			// each connection can hand out TURN credentials, so one address
			// cannot open many
			const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
			if (!(await env.LOBBY_LIMIT.limit({ key: address })).success) {
				return new Response('slow down', { status: 429 });
			}
			const lobby = env.ZOMBIES_LOBBY.get(env.ZOMBIES_LOBBY.idFromName(code));
			return lobby.fetch(request);
		}
		return handler.fetch(request);
	}
};
