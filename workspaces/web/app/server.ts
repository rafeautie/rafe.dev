import handler from '@tanstack/react-start/server-entry';

// The Worker. Nearly every request is the site itself, which TanStack Start
// answers. The exception is /race/socket: a page at /race opening its
// WebSocket to the race room, which has to be handed to the room before the
// site's own routing sees it.

export { RaceRoom } from '~/lib/race/room.server';

async function joinRace(request: Request, env: Env) {
	if (request.headers.get('upgrade') !== 'websocket') {
		return new Response('Expected a WebSocket', { status: 426 });
	}
	// only this site's own pages may connect
	if (request.headers.get('origin') !== new URL(request.url).origin) {
		return new Response(null, { status: 403 });
	}
	// every connection wakes the room, so one address only gets so many
	const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
	if (!(await env.RACE_LIMIT.limit({ key: address })).success) {
		return new Response(null, { status: 429 });
	}
	// Who this is: a secret kept in a cookie, made up the first time they
	// come. The room knows a player by it and nothing else.
	const cookie = /(?:^|;\s*)race=([\w-]{20,64})/.exec(request.headers.get('cookie') ?? '');
	const key = cookie?.[1] ?? crypto.randomUUID();
	const headers = new Headers(request.headers);
	headers.set('x-player', key);
	const response = await env.RACE_ROOM.getByName('race').fetch(new Request(request, { headers }));
	if (cookie || !response.webSocket) return response;
	return new Response(null, {
		status: 101,
		webSocket: response.webSocket,
		headers: {
			'set-cookie': `race=${key}; Path=/race; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
		}
	});
}

export default {
	fetch(request, env, ctx) {
		if (new URL(request.url).pathname === '/race/socket') return joinRace(request, env);
		return (handler.fetch as ExportedHandlerFetchHandler<Env>)(request, env, ctx);
	}
} satisfies ExportedHandler<Env>;
