import { DurableObject } from 'cloudflare:workers';
import { MAX_PLAYERS, type SignalDown, type SignalUp } from './signal';

type Attachment = { id: string; role: 'host' | 'join'; name: string; since: number };

// A joiner closes its socket once connected to the host, so one still open
// after this long is stuck or idle, and only holds a place in the lobby.
const JOIN_TIMEOUT = 30_000;
const TURN_TIMEOUT = 3000;

// Free STUN from Cloudflare, enough for most home networks. When the Worker
// has a Cloudflare Realtime TURN key (TURN_KEY_ID and TURN_KEY_API_TOKEN), each
// player also gets short-lived TURN credentials, which relay traffic for the
// networks that cannot connect directly.
const STUN: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const TURN_TTL_SECONDS = 6 * 60 * 60;

async function iceServers(env: Env): Promise<RTCIceServer[]> {
	// optional secrets, so either may be missing
	const { TURN_KEY_ID, TURN_KEY_API_TOKEN } = env as Partial<Env>;
	if (!TURN_KEY_ID || !TURN_KEY_API_TOKEN) return STUN;
	try {
		const response = await fetch(
			`https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate-ice-servers`,
			{
				method: 'POST',
				headers: {
					authorization: `Bearer ${TURN_KEY_API_TOKEN}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
				signal: AbortSignal.timeout(TURN_TIMEOUT)
			}
		);
		if (!response.ok) return STUN;
		const body = (await response.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
		const turn = body.iceServers ? [body.iceServers].flat() : [];
		return [...STUN, ...turn];
	} catch {
		return STUN;
	}
}

function send(ws: WebSocket, message: SignalDown) {
	try {
		ws.send(JSON.stringify(message));
	} catch {
		// already closed
	}
}

// One lobby, named by its code. It only introduces players and passes their
// WebRTC setup messages along; the game itself runs in the host's browser.
// Sockets use the hibernation API, so an idle lobby costs nothing, and who is
// who lives on each socket rather than in memory.
export class ZombiesLobby extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const role = url.searchParams.get('role') === 'host' ? 'host' : 'join';
		const name = (url.searchParams.get('name') ?? '').trim().slice(0, 16) || 'player';
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);

		for (const s of this.ctx.getWebSockets()) {
			const who = this.attachment(s);
			if (who?.role === 'join' && Date.now() - who.since > JOIN_TIMEOUT) this.left(s);
		}
		// fetched first, so nothing below can change while it is awaited
		const ice = await iceServers(this.env);
		const host = this.host();
		const refuse = (reason: 'no-lobby' | 'taken' | 'full') => {
			send(server, { type: 'refused', reason });
			server.close(4000, reason);
		};
		if (role === 'host' && host) refuse('taken');
		else if (role === 'join' && !host) refuse('no-lobby');
		else if (
			role === 'join' &&
			this.ctx.getWebSockets().filter((s) => this.attachment(s)).length >= MAX_PLAYERS
		)
			refuse('full');
		else {
			const id = crypto.randomUUID().slice(0, 8);
			server.serializeAttachment({ id, role, name, since: Date.now() } satisfies Attachment);
			send(server, {
				type: 'welcome',
				id,
				hostId: role === 'host' ? id : this.attachment(host!)!.id,
				iceServers: ice
			});
			if (role === 'join') send(host!, { type: 'peer-joined', id, name });
		}
		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		const from = this.attachment(ws);
		if (!from || typeof raw !== 'string' || raw.length > 64_000) return;
		let message: SignalUp;
		try {
			message = JSON.parse(raw);
		} catch {
			return;
		}
		if (message.type !== 'signal') return;
		const target = this.ctx.getWebSockets().find((s) => this.attachment(s)?.id === message.to);
		// players only ever talk to the host, and the host to players
		if (!target || (from.role === 'join') === (this.attachment(target)?.role === 'join')) return;
		send(target, { type: 'signal', from: from.id, data: message.data });
	}

	webSocketClose(ws: WebSocket) {
		this.left(ws);
	}

	webSocketError(ws: WebSocket) {
		this.left(ws);
	}

	private left(ws: WebSocket) {
		const who = this.attachment(ws);
		if (!who) return;
		// so it is not found again while it finishes closing
		ws.serializeAttachment(null);
		for (const other of this.ctx.getWebSockets()) {
			if (other === ws) continue;
			if (who.role === 'host') {
				send(other, { type: 'host-left' });
				other.close(4001, 'host left');
			} else if (this.attachment(other)?.role === 'host') {
				send(other, { type: 'peer-left', id: who.id });
			}
		}
		try {
			ws.close(1000, 'bye');
		} catch {
			// already closed
		}
	}

	private host(): WebSocket | undefined {
		return this.ctx.getWebSockets().find((s) => this.attachment(s)?.role === 'host');
	}

	private attachment(ws: WebSocket): Attachment | null {
		return ws.deserializeAttachment() as Attachment | null;
	}
}
