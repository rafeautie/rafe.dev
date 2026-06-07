import { applyAction, createGame, ownsCar } from '../engine/engine';
import { isComplete } from '../engine/season';
import { toPublicState } from '../engine/projection';
import type {
	Action,
	ClientMessage,
	GameState,
	Phase,
	ProjectionDOState,
	RaceEvent
} from '../engine/types';
import { assignLiveries, liveryTeams } from '../engine/liveries';

const MAX_PLAYERS = 6;
const MAX_NAME_LEN = 20;
const MAX_LOG = 50;
// Reap a game's persisted state once it has gone this long without any activity,
// so abandoned lobbies and finished seasons don't accumulate in storage forever.
const IDLE_TTL_MS = 24 * 60 * 60 * 1000;
// Log broadcast fan-out cost on 1-in-PERF_SAMPLE broadcasts.
const PERF_SAMPLE = 20;
const SUITS = ['gears', 'fuel', 'pistons', 'steering-wheels', 'shift-gates', 'belt'] as const;

interface PlayerEntry {
	id: string;
	name: string;
	isHost: boolean;
	connected: boolean;
}

interface WsAttachment {
	playerId: string;
	playerName: string;
}

// DOState is stored in Durable Object storage. It satisfies ProjectionDOState
// so it can be passed directly to toPublicState.
interface DOState extends ProjectionDOState {
	// The room name this DO is addressed by. Persisted so every log line — including
	// those from hibernation-woken handlers that never saw the upgrade URL — can be
	// filtered to a single game. Not projected: the client already knows it.
	gameId?: string;
	players: PlayerEntry[];
	phase: Phase;
	gameState?: GameState;
	log: RaceEvent[];
	carLiveries: Record<number, number>;
}

function emptyState(): DOState {
	return { players: [], phase: 'lobby', log: [], carLiveries: {} };
}

function appendLog(log: RaceEvent[], events: RaceEvent[]): RaceEvent[] {
	return [...log, ...events].slice(-MAX_LOG);
}

export class TheRaceGame implements DurableObject {
	// Cached for log correlation; populated from the upgrade URL or persisted state.
	private gameId?: string;
	// Counts broadcasts to drive the 1-in-N perf sampler.
	private broadcastSeq = 0;

	constructor(private readonly ctx: DurableObjectState) {}

	// One structured, single-line JSON log per event so Workers Logs can be
	// filtered by `gameId` and queried by `event`. gameId is stamped automatically.
	private log(
		level: 'info' | 'warn' | 'error',
		event: string,
		fields: Record<string, unknown> = {}
	): void {
		const line = JSON.stringify({ event, gameId: this.gameId, ...fields });
		if (level === 'error') console.error(line);
		else if (level === 'warn') console.warn(line);
		else console.log(line);
	}

	private async getState(): Promise<DOState> {
		const s = (await this.ctx.storage.get<DOState>('state')) ?? emptyState();
		if (!s.log) s.log = [];
		if (!s.carLiveries) s.carLiveries = {};
		this.gameId ??= s.gameId;
		return s;
	}

	private async setState(state: DOState): Promise<void> {
		await this.ctx.storage.put('state', state);
		// Every mutation is "activity"; refresh the idle reaper from one place.
		await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
	}

	// Events are the public "what just happened" payload for the action that
	// triggered this broadcast (e.g. a resolved challenge). They're transient —
	// only the broadcast carries them; nothing is persisted — so a client
	// choreographs the transition without it being baked into the state snapshot.
	private broadcast(state: DOState, events: RaceEvent[] = []): void {
		let recipients = 0;
		let bytes = 0;
		for (const ws of this.ctx.getWebSockets()) {
			const att = ws.deserializeAttachment() as WsAttachment | null;
			const viewer = att?.playerId;
			const payload = JSON.stringify({
				type: 'STATE_UPDATE',
				state: toPublicState(state, viewer),
				...(events.length > 0 && { events })
			});
			ws.send(payload);
			recipients++;
			bytes += payload.length;
		}
		// Fan-out re-projects and re-serialises per socket — the one cost that scales
		// with player count yet is invisible to invocation traces. Sampled (1-in-N by
		// broadcast count, not time/random) so it surfaces without flooding the log.
		if (recipients > 0 && this.broadcastSeq++ % PERF_SAMPLE === 0) {
			this.log('info', 'broadcast', { recipients, bytes });
		}
	}

	private send(ws: WebSocket, msg: object): void {
		ws.send(JSON.stringify(msg));
	}

	// Log a refused connection and return the matching response in one step.
	private reject(message: string, status: number, fields: Record<string, unknown> = {}): Response {
		this.log('warn', 'connect_rejected', { reason: message, status, ...fields });
		return new Response(message, { status });
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		// The DO is addressed by an opaque id, so the only place to recover the
		// room name is the upgrade path (/ws/games/the-race/:gameId).
		this.gameId ??= url.pathname.split('/').pop() || undefined;

		if (request.headers.get('Upgrade') !== 'websocket') {
			return this.reject('Expected WebSocket', 403);
		}

		const playerId = url.searchParams.get('playerId');
		const playerName = url.searchParams.get('playerName');

		if (!playerId || !playerName) {
			return this.reject('Missing playerId or playerName', 400);
		}

		const state = await this.getState();
		state.gameId ??= this.gameId;

		if (state.phase !== 'lobby') {
			const existing = state.players.find((p) => p.id === playerId);
			if (!existing) {
				return this.reject('Game already started', 403, { playerId });
			}
		} else if (
			state.players.length >= MAX_PLAYERS &&
			!state.players.find((p) => p.id === playerId)
		) {
			return this.reject('Lobby full', 403, { playerId });
		}

		const { 0: client, 1: server } = new WebSocketPair();
		server.serializeAttachment({ playerId, playerName } satisfies WsAttachment);
		this.ctx.acceptWebSocket(server);

		const existing = state.players.find((p) => p.id === playerId);
		if (!existing) {
			const isHost = state.players.length === 0;
			state.players.push({ id: playerId, name: playerName, isHost, connected: true });
			// host:true marks the join that created the game (vs. later joiners).
			this.log('info', 'player_joined', { playerId, host: isHost, players: state.players.length });
		} else {
			existing.connected = true;
			// Refresh the name from the handshake so a player who renamed themselves
			// (and persisted it to localStorage) keeps it across a reconnect.
			existing.name = playerName;
		}
		await this.setState(state);
		this.broadcast(state);

		return new Response(null, { status: 101, webSocket: client });
	}

	// The shared command pipe for the four car actions: check phase + ownership,
	// apply, persist, broadcast. The engine validates move legality (and throws on a
	// bad move) and emits the events — the DO only authorizes and transports.
	private async applyCommand(
		ws: WebSocket,
		state: DOState,
		playerId: string,
		action: Extract<Action, { carId: number }>,
		requiredPhase: Phase
	): Promise<void> {
		if (!state.gameState || state.phase !== requiredPhase) {
			this.send(ws, { type: 'ERROR', message: `Not in ${requiredPhase} phase` });
			return;
		}
		if (!ownsCar(state.gameState, playerId, action.carId)) {
			this.send(ws, { type: 'ERROR', message: 'Not your car' });
			return;
		}
		try {
			const { state: next, events } = applyAction(state.gameState, action);
			state.gameState = next;
			state.phase = next.phase;
			state.log = appendLog(state.log, events);
			await this.setState(state);
			this.broadcast(state, events);
			// A race only ever resolves through this pipe — the single place to
			// observe race/season completion for usage.
			if (next.phase === 'results') {
				this.log('info', 'race_completed', {
					raceNumber: next.season.races.length,
					seasonComplete: isComplete(next.season)
				});
			}
		} catch (err) {
			// Covers both expected illegal moves and genuine engine bugs — without
			// this they were indistinguishable and equally invisible after deploy.
			this.log('warn', 'action_rejected', {
				playerId,
				action: action.type,
				carId: action.carId,
				phase: state.phase,
				message: err instanceof Error ? err.message : String(err)
			});
			this.send(ws, {
				type: 'ERROR',
				message: err instanceof Error ? err.message : 'Unknown error'
			});
		}
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const att = ws.deserializeAttachment() as WsAttachment | null;
		if (!att) return;

		let parsed: ClientMessage;
		try {
			parsed = JSON.parse(
				typeof message === 'string' ? message : new TextDecoder().decode(message)
			);
		} catch {
			this.log('warn', 'invalid_json', { playerId: att.playerId });
			this.send(ws, { type: 'ERROR', message: 'Invalid JSON' });
			return;
		}

		const state = await this.getState();
		const player = state.players.find((p) => p.id === att.playerId);
		if (!player) return;

		switch (parsed.type) {
			case 'START_SEASON': {
				if (!player.isHost) {
					this.send(ws, { type: 'ERROR', message: 'Only the host can start the season' });
					return;
				}
				if (state.phase !== 'lobby') {
					this.send(ws, { type: 'ERROR', message: 'Season already started' });
					return;
				}

				const teamMode = state.players.length === 2;
				const carsPerPlayer = teamMode ? 2 : 1;
				const shuffledSuits = [...SUITS].sort(() => Math.random() - 0.5);

				// createGame builds cars with dealt hands and engine players.
				const initState = createGame(
					state.players.map((p) => ({ id: p.id, isHost: p.isHost })),
					{ suits: shuffledSuits, carsPerPlayer }
				);

				// Assign one whole F1 team per player (teammates share a livery, told
				// apart only by the tertiary cockpit-camera colour). The DO supplies the
				// non-determinism — a shuffled team list — and assignLiveries does the
				// pure player×car pairing.
				const teams = liveryTeams().sort(() => Math.random() - 0.5);
				state.carLiveries = assignLiveries(teams, initState.cars.length, carsPerPlayer);

				const { state: after, events } = applyAction(initState, { type: 'START_GAME' });
				state.gameState = after;
				state.phase = after.phase;
				state.log = appendLog(state.log, events);
				await this.setState(state);
				this.broadcast(state, events);
				this.log('info', 'season_started', { players: state.players.length, teamMode });
				break;
			}

			// The four car actions share one pipe (phase + ownership, then apply).
			// The required phase is the only thing that differs.
			case 'QUALIFY':
				await this.applyCommand(ws, state, att.playerId, parsed, 'qualifying');
				break;

			case 'DISCARD':
			case 'EXTEND':
			case 'COMMIT_CHALLENGE_CARDS':
				await this.applyCommand(ws, state, att.playerId, parsed, 'race');
				break;

			// Deal the next Race of the Season: carry the accrued Season forward and
			// keep the liveries fixed for the whole Season; only the deck is fresh.
			case 'ADVANCE_RACE': {
				if (!player.isHost) {
					this.send(ws, { type: 'ERROR', message: 'Only the host can start the next race' });
					return;
				}
				if (state.phase !== 'results' || !state.gameState) {
					this.send(ws, { type: 'ERROR', message: 'No finished race to advance from' });
					return;
				}
				if (isComplete(state.gameState.season)) {
					this.send(ws, { type: 'ERROR', message: 'Season complete' });
					return;
				}

				const teamMode = state.players.length === 2;
				const carsPerPlayer = teamMode ? 2 : 1;
				const shuffledSuits = [...SUITS].sort(() => Math.random() - 0.5);

				const initState = createGame(
					state.players.map((p) => ({ id: p.id, isHost: p.isHost })),
					{ suits: shuffledSuits, carsPerPlayer, season: state.gameState.season }
				);
				const { state: after, events } = applyAction(initState, { type: 'START_GAME' });
				state.gameState = after;
				state.phase = after.phase;
				state.log = appendLog([], events);
				await this.setState(state);
				this.broadcast(state, events);
				break;
			}

			// End the Season: reset to the lobby, clearing the Season and its liveries.
			case 'NEW_SEASON': {
				if (!player.isHost) {
					this.send(ws, { type: 'ERROR', message: 'Only the host can start a new season' });
					return;
				}
				if (!state.gameState) return;
				const { state: next } = applyAction(state.gameState, { type: 'PLAY_AGAIN' });
				state.gameState = next;
				state.phase = 'lobby';
				state.carLiveries = {};
				state.log = [];
				await this.setState(state);
				this.broadcast(state);
				break;
			}

			// Rename the sender. Lobby-only: once a Season is underway the name is
			// pinned to liveries and the log, so changing it would be confusing.
			case 'SET_NAME': {
				if (state.phase !== 'lobby') {
					this.send(ws, { type: 'ERROR', message: 'Can only rename in the lobby' });
					return;
				}
				const clean = parsed.name.trim().slice(0, MAX_NAME_LEN);
				if (!clean) {
					this.send(ws, { type: 'ERROR', message: 'Name cannot be empty' });
					return;
				}
				player.name = clean;
				await this.setState(state);
				this.broadcast(state);
				break;
			}
		}
	}

	async webSocketClose(
		_ws: WebSocket,
		_code: number,
		_reason: string,
		_wasClean: boolean
	): Promise<void> {
		const att = _ws.deserializeAttachment() as WsAttachment | null;
		if (!att) return;
		const state = await this.getState();
		const player = state.players.find((p) => p.id === att.playerId);
		if (player) {
			player.connected = false;
			await this.setState(state);
			this.broadcast(state);
		}
	}

	// Idle reaper (armed by setState). Only deletes a game that has had no activity
	// for IDLE_TTL_MS *and* has nobody connected — an idle-but-occupied game re-arms.
	async alarm(): Promise<void> {
		if (this.ctx.getWebSockets().length > 0) {
			await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
			return;
		}
		const state = await this.getState();
		this.log('info', 'game_expired', { phase: state.phase, players: state.players.length });
		await this.ctx.storage.deleteAll();
	}

	async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
		const att = _ws.deserializeAttachment() as WsAttachment | null;
		this.log('error', 'websocket_error', {
			playerId: att?.playerId,
			message: _error instanceof Error ? _error.message : String(_error)
		});
	}
}
