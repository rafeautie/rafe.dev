import { applyAction, createDeck, shuffleDeck } from 'shared';
import type { ClientMessage, GameState, Phase, PublicGameState } from 'shared';

const MAX_PLAYERS = 6;
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs', 'oranges', 'lemons'] as const;

interface PlayerEntry {
	id: string;
	name: string;
	isHost: boolean;
}

interface WsAttachment {
	playerId: string;
	playerName: string;
}

interface DOState {
	players: PlayerEntry[];
	phase: Phase;
	gameState?: GameState;
}

function emptyState(): DOState {
	return { players: [], phase: 'lobby' };
}

function toPublicState(doState: DOState, viewerId?: string): PublicGameState {
	const gs = doState.gameState;
	return {
		phase: doState.phase,
		players: doState.players,
		cars: gs
			? gs.cars.map((c) => ({
					id: c.id,
					position: c.position,
					handSize: c.hand.length,
					hand: gs.players.find((p) => p.carIds.includes(c.id) && p.id === viewerId)
						? c.hand
						: undefined,
				}))
			: [],
		pendingThisRound: gs?.pendingThisRound ?? [],
		endAfterRound: gs?.endAfterRound ?? false,
		pendingChallenge: gs?.pendingChallenge
			? { challengerCarId: gs.pendingChallenge.challengerCarId, defenderCarId: gs.pendingChallenge.defenderCarId }
			: undefined,
	};
}

export class TheRaceGame implements DurableObject {
	constructor(
		private readonly ctx: DurableObjectState,
		private readonly env: Env,
	) {}

	private async getState(): Promise<DOState> {
		return (await this.ctx.storage.get<DOState>('state')) ?? emptyState();
	}

	private async setState(state: DOState): Promise<void> {
		await this.ctx.storage.put('state', state);
	}

	private broadcast(state: DOState): void {
		for (const ws of this.ctx.getWebSockets()) {
			const att = ws.deserializeAttachment() as WsAttachment | null;
			const viewer = att?.playerId;
			ws.send(JSON.stringify({ type: 'STATE_UPDATE', state: toPublicState(state, viewer) }));
		}
	}

	private send(ws: WebSocket, msg: object): void {
		ws.send(JSON.stringify(msg));
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket', { status: 403 });
		}

		const url = new URL(request.url);
		const playerId = url.searchParams.get('playerId');
		const playerName = url.searchParams.get('playerName');

		if (!playerId || !playerName) {
			return new Response('Missing playerId or playerName', { status: 400 });
		}

		const state = await this.getState();

		if (state.phase !== 'lobby') {
			// Allow reconnect for existing players
			const existing = state.players.find((p) => p.id === playerId);
			if (!existing) {
				return new Response('Game already started', { status: 403 });
			}
		} else if (state.players.length >= MAX_PLAYERS && !state.players.find((p) => p.id === playerId)) {
			return new Response('Lobby full', { status: 403 });
		}

		const { 0: client, 1: server } = new WebSocketPair();
		server.serializeAttachment({ playerId, playerName } satisfies WsAttachment);
		this.ctx.acceptWebSocket(server);

		// Upsert player
		const existing = state.players.find((p) => p.id === playerId);
		if (!existing) {
			state.players.push({ id: playerId, name: playerName, isHost: state.players.length === 0 });
		}
		await this.setState(state);
		this.broadcast(state);

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const att = ws.deserializeAttachment() as WsAttachment | null;
		if (!att) return;

		let parsed: ClientMessage;
		try {
			parsed = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
		} catch {
			this.send(ws, { type: 'ERROR', message: 'Invalid JSON' });
			return;
		}

		const state = await this.getState();
		const player = state.players.find((p) => p.id === att.playerId);
		if (!player) return;

		switch (parsed.type) {
			case 'START_GAME': {
				if (!player.isHost) {
					this.send(ws, { type: 'ERROR', message: 'Only the host can start the game' });
					return;
				}
				if (state.phase !== 'lobby') {
					this.send(ws, { type: 'ERROR', message: 'Game already started' });
					return;
				}

				// Create cars (1 per player or 2 if exactly 2 players)
				const twoPlayerMode = state.players.length === 2;
				const carsPerPlayer = twoPlayerMode ? 2 : 1;
				const shuffledSuits = [...SUITS].sort(() => Math.random() - 0.5);

				const cars: GameState['cars'] = [];
				const enginePlayers: GameState['players'] = [];

				state.players.forEach((p, pi) => {
					const carIds: number[] = [];
					for (let c = 0; c < carsPerPlayer; c++) {
						const carId = pi * carsPerPlayer + c;
						const suit = shuffledSuits[carId] ?? 'spades';
						cars.push({ id: carId, position: 0, hand: [], deck: shuffleDeck(createDeck(suit)), discard: [] });
						carIds.push(carId);
					}
					enginePlayers.push({ id: p.id, carIds, isHost: p.isHost });
				});

				const initState: GameState = {
					phase: 'lobby',
					players: enginePlayers,
					cars,
					pendingThisRound: [],
					endAfterRound: false,
					challengeWinsThisTurn: 0,
					qualifyingCards: {},
				};

				const after = applyAction(initState, { type: 'START_GAME' });
				state.gameState = after;
				state.phase = 'qualifying';
				await this.setState(state);
				this.broadcast(state);
				break;
			}

			default: {
				if (!state.gameState) {
					this.send(ws, { type: 'ERROR', message: 'Game not started' });
					return;
				}
				try {
					const next = applyAction(state.gameState, parsed as Parameters<typeof applyAction>[1]);
					state.gameState = next;
					state.phase = next.phase;
					await this.setState(state);
					this.broadcast(state);
				} catch (err) {
					this.send(ws, { type: 'ERROR', message: err instanceof Error ? err.message : 'Unknown error' });
				}
				break;
			}
		}
	}

	async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
		// Player remains in lobby; they can reconnect
	}

	async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {}
}
