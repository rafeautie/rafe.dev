import { DurableObject } from 'cloudflare:workers';
import { MARKET_PRESETS, MarketCoordinator } from './market';
import { MarketStateMessage, MarketInitMessage, PlaceOrderMessage, UpdateUsernameMessage } from 'shared';

// Worker
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.url.endsWith('/websocket')) {
			// Expect to receive a WebSocket Upgrade request.
			// If there is one, accept the request and return a WebSocket Response.
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Worker expected Upgrade: websocket', {
					status: 426,
				});
			}

			if (request.method !== 'GET') {
				return new Response('Worker expected GET method', {
					status: 400,
				});
			}

			// Since we are hard coding the Durable Object ID by providing the constant name 'foo',
			// all requests to this Worker will be sent to the same Durable Object instance.
			let stub = env.TraderGameServer.getByName("main");

			return stub.fetch(request);
		}

		return new Response(
			`Supported endpoints:
/websocket: Expects a WebSocket upgrade request`,
			{
				status: 200,
				headers: {
					'Content-Type': 'text/plain',
				},
			}
		);
	},
};

// Durable Object
export class TraderGameServer extends DurableObject {
	sessions: Map<WebSocket, { [key: string]: string }>;
	market: MarketCoordinator;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sessions = new Map();
		this.market = new MarketCoordinator({
			stocks: [
				MARKET_PRESETS.BLUE,
				MARKET_PRESETS.CPTO,
				MARKET_PRESETS.MEME,
			]
		});

		this.ctx.getWebSockets().forEach((ws) => {
			let attachment = ws.deserializeAttachment();
			if (attachment) {
				this.sessions.set(ws, { ...attachment });
			}
		});

		this.ctx.blockConcurrencyWhile(async () => {
			const stored = await this.ctx.storage.get('market_state');
			if (stored) {
				this.market.hydrate(stored);

				const activeIds = new Set<string>();
				this.sessions.forEach((s) => activeIds.add(s.id));
				this.market.prunePlayers(activeIds);
			}
		});

		this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(request: Request): Promise<Response> {
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		const id = crypto.randomUUID();

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ id });
		this.sessions.set(server, { id });
		this.market.addPlayer({
			id,
			username: `Trader_${id.slice(0, 5)}`,
			cash: 1000,
		});

		server.send(JSON.stringify({
			type: 'market_init',
			history: this.market.getHistory(),
			marketState: this.market.getCurrentState(id),
		} satisfies MarketInitMessage));

		const currentAlarm = await this.ctx.storage.getAlarm();

		if ((currentAlarm ?? 0) <= Date.now()) {
			console.log("Alarm Set")
			const activeIds = new Set<string>();
			this.sessions.forEach((s) => activeIds.add(s.id));
			this.market.prunePlayers(activeIds);
			this.ctx.storage.setAlarm(Date.now() + 1000);
		}

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		const session = this.sessions.get(ws)!;
		const parsedMessage: PlaceOrderMessage | UpdateUsernameMessage = JSON.parse(message.toString());

		switch (parsedMessage.type) {
			case 'place_order': {
				const { symbol, quantity, side } = parsedMessage;
				const orderValidity = this.market.placeOrder({
					playerId: session.id,
					symbol,
					quantity,
					side,
				});
				ws.send(JSON.stringify({
					type: 'order_placed', ...orderValidity
				}));
				break;
			}
			case 'update_username': {
				const { username } = parsedMessage;
				this.market.updateUsername(session.id, username);
				break;
			}
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		const { id } = ws.deserializeAttachment()
		this.market.removePlayer(id);
		ws.close(code, reason);
		this.sessions.delete(ws);

		if (this.sessions.size === 0) {
			console.log("Alarm Deleted")
			this.ctx.storage.deleteAlarm()
		}
	}

	async alarm() {
		console.log("Tick at", Date.now())
		const marketState = this.market.tick();
		this.ctx.storage.put('market_state', this.market.serialize());

		this.sessions.forEach((attachment, connectedWs) => {
			connectedWs.send(JSON.stringify({
				type: 'market_update',
				...marketState,
				playerState: this.market.getPlayerState(attachment.id),
				reports: marketState.reports[attachment.id] || [],
			} satisfies MarketStateMessage));
		});

		this.ctx.storage.setAlarm(Date.now() + 1000);
	}
}