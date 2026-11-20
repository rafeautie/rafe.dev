import { DurableObject } from 'cloudflare:workers';
import {
	cleanName,
	DEBT_CAP,
	MARKETS,
	MAX_BETS,
	outcomes,
	pays,
	seed as seedPool,
	START,
	type Market,
	type Pools,
	type Result
} from './betting';
import { createReplay, pack, record, type Recording } from './recording';
import {
	BETTING_MS,
	LEAD_MS,
	RESULTS_MS,
	type Bet,
	type FromRoom,
	type RoomState,
	type Standing,
	type ToRoom
} from './room';
import { drawConditions, inCondition, ROSTER } from './roster';
import { drawGrid, random, rank } from './sim';

// The one room everybody at /race is in. It runs the cycle (betting, the
// race, the result, and round again) on an alarm, keeps a socket open to
// every page watching, and is the bank: it holds every player's chips and
// takes and pays every bet. When betting closes it runs the whole race at
// once, keeps the recording, and sends it out; pages only play it back, each
// at the moment the room's clock says, so they all see the same thing.
//
// Between alarms the room is put to sleep and forgets everything in memory,
// so all it knows is in storage. The cycle is in three keys: 'state' (a
// RoomState), and for a race that has started, 'recording' (its bytes) and
// 'result'. The money is in the tables made in the constructor.

const IDLE: RoomState = {
	round: 0,
	phase: 'idle',
	endsAt: 0,
	grid: [],
	conditions: [],
	startsAt: 0,
	result: null
};

/** Practice runs of each race, to judge how likely every outcome is before seeding the pools. */
const TRIALS = 30;

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** What a recorded race came to, for the betting. */
function resultOf(recording: Recording): Result {
	const replay = createReplay(recording, ROSTER);
	replay.seek(replay.duration);
	const out = recording.events.find((event) => event.kind === 'retire');
	const lapped = replay.cars.filter((car) => car.bestLap).sort((a, b) => a.bestLap - b.bestLap);
	return {
		order: rank(replay.cars).map((car) => car.entry.id),
		firstOut: out ? recording.grid[out.car] : null,
		fastest: lapped[0]?.entry.id ?? null
	};
}

type PlayerRow = Standing & { banned: number };

export class RaceRoom extends DurableObject<Env> {
	private sql: SqlStorage;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		// `key` is the secret in a player's cookie; `id` is what others see
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS players (
				id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
				balance INTEGER NOT NULL, bankruptcies INTEGER NOT NULL DEFAULT 0,
				banned INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS races (
				round INTEGER PRIMARY KEY, started INTEGER NOT NULL, seed INTEGER NOT NULL,
				voided INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE IF NOT EXISTS results (
				round INTEGER NOT NULL, car TEXT NOT NULL, grid INTEGER NOT NULL,
				condition TEXT NOT NULL, place INTEGER NOT NULL, first_out INTEGER NOT NULL,
				fastest INTEGER NOT NULL, PRIMARY KEY (round, car)
			);
			CREATE TABLE IF NOT EXISTS pool_seeds (
				round INTEGER NOT NULL, market TEXT NOT NULL, outcome TEXT NOT NULL,
				chips REAL NOT NULL, PRIMARY KEY (round, market, outcome)
			);
			CREATE TABLE IF NOT EXISTS bets (
				id INTEGER PRIMARY KEY, round INTEGER NOT NULL, player INTEGER NOT NULL,
				market TEXT NOT NULL, outcome TEXT NOT NULL, stake INTEGER NOT NULL, payout INTEGER
			);
			CREATE INDEX IF NOT EXISTS bets_round ON bets (round, player);
			CREATE TABLE IF NOT EXISTS adjustments (
				id INTEGER PRIMARY KEY, player INTEGER NOT NULL, at INTEGER NOT NULL,
				kind TEXT NOT NULL, amount INTEGER NOT NULL
			);
		`);
	}

	/**
	 * Someone arriving to watch. Called by the Worker with their WebSocket
	 * request, and the secret from their cookie in `x-player`; without one
	 * they can watch but not bet.
	 */
	async fetch(request: Request): Promise<Response> {
		const [client, server] = Object.values(new WebSocketPair());
		const key = request.headers.get('x-player');
		const player = key ? this.join(key) : null;
		this.ctx.acceptWebSocket(server);
		// who is on the other end, kept through the room's sleeps
		server.serializeAttachment(player);
		const state = this.state;
		if (state.phase === 'idle') {
			// the first one in starts the next race, and is told with everyone else
			await this.open(state.round + 1);
		} else {
			this.send(server, this.report(state));
			const recording = this.ctx.storage.kv.get<Uint8Array>('recording');
			if (state.phase !== 'betting' && recording) server.send(recording);
		}
		if (player) this.send(server, this.you(player));
		this.send(server, this.board());
		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketMessage(socket: WebSocket, text: string | ArrayBuffer) {
		if (typeof text !== 'string' || text.length > 200) return;
		let message: ToRoom;
		try {
			message = JSON.parse(text);
		} catch {
			return;
		}
		if (message.type === 'sync') {
			// a page asking the time: it sends its own, and learns the room's
			if (typeof message.sent !== 'number') return;
			return this.send(socket, { type: 'sync', sent: message.sent, now: Date.now() });
		}
		const player: number | null = socket.deserializeAttachment();
		if (!player) return;
		const refused =
			message.type === 'name'
				? this.rename(player, message.name)
				: message.type === 'bet'
					? this.bet(player, message.market, message.outcome, message.stake)
					: message.type === 'bankrupt'
						? this.bankrupt(player)
						: 'Not understood';
		if (refused) this.send(socket, { type: 'no', reason: refused });
		else this.send(socket, this.you(player));
	}

	webSocketClose(socket: WebSocket, code: number, reason: string) {
		// answer the close; the codes a browser reports but cannot be sent are left out
		if (code === 1005 || code === 1006 || code === 1015) socket.close();
		else socket.close(code, reason);
	}

	/** The end of a phase. */
	async alarm() {
		const state = this.state;
		// an alarm can be delivered twice; the second must not skip a phase
		if (Date.now() < state.endsAt - 100) {
			await this.ctx.storage.setAlarm(state.endsAt);
			return;
		}
		try {
			if (state.phase === 'betting') await this.start(state);
			else if (state.phase === 'racing') await this.finish(state);
			else if (state.phase === 'results') {
				// the races only run while somebody is here to watch them
				if (this.ctx.getWebSockets().length) await this.open(state.round + 1);
				else this.ctx.storage.kv.put('state', { ...IDLE, round: state.round });
			}
		} catch (error) {
			// A phase that fails would be retried a few times and then leave
			// the room stuck for good. Call the race off, hand its bets back,
			// and start the next.
			console.error({ message: 'race room phase failed', phase: state.phase, error });
			this.void(state.round);
			await this.open(state.round + 1);
		}
	}

	// The cycle

	private get state() {
		return this.ctx.storage.kv.get<RoomState>('state') ?? IDLE;
	}

	private report(state: RoomState): FromRoom {
		return { type: 'state', state, pools: this.pools(state) };
	}

	private send(socket: WebSocket, message: FromRoom) {
		try {
			socket.send(JSON.stringify(message));
		} catch {
			// one that is on its way out
		}
	}

	private tell(message: FromRoom) {
		for (const socket of this.ctx.getWebSockets()) this.send(socket, message);
	}

	/** Enters a phase: remembers it, sets the alarm for its end, and tells everyone. */
	private async move(state: RoomState) {
		this.ctx.storage.kv.put('state', state);
		await this.ctx.storage.setAlarm(state.endsAt);
		this.tell(this.report(state));
	}

	/**
	 * Opens betting on a new race: draws the starting order and the cars'
	 * conditions, and seeds every pool by running the race a few times over
	 * to see how it tends to go.
	 */
	private open(round: number) {
		const rand = random(seed());
		const field = drawGrid(seed(), ROSTER);
		const conditions = drawConditions(rand, field.length);
		const grid = field.map((entry) => entry.id);
		const cars = field.map((entry, slot) => inCondition(entry, conditions[slot]));
		const trials = Array.from({ length: TRIALS }, () => resultOf(record(seed(), cars)));
		this.ctx.storage.kv.delete('recording');
		for (const market of MARKETS) {
			for (const [outcome, chips] of Object.entries(seedPool(market, grid, trials))) {
				this.sql.exec('INSERT INTO pool_seeds VALUES (?, ?, ?, ?)', round, market, outcome, chips);
			}
		}
		return this.move({
			...IDLE,
			round,
			phase: 'betting',
			endsAt: Date.now() + BETTING_MS,
			grid,
			conditions
		});
	}

	/**
	 * Closes betting and runs the race, all of it, now. Its seed is drawn
	 * here and never leaves the room, so nobody could have run it first.
	 */
	private async start(state: RoomState) {
		const cars = state.grid.map((id, slot) =>
			inCondition(ROSTER.find((entry) => entry.id === id)!, state.conditions[slot])
		);
		const raceSeed = seed();
		const recording = record(raceSeed, cars);
		const result = resultOf(recording);
		const bytes = pack(recording);
		this.ctx.storage.kv.put('recording', bytes);
		this.ctx.storage.kv.put('result', result);
		const startsAt = Date.now() + LEAD_MS;
		this.sql.exec(
			'INSERT INTO races (round, started, seed) VALUES (?, ?, ?)',
			state.round,
			startsAt,
			raceSeed
		);
		state.grid.forEach((car, slot) =>
			this.sql.exec(
				'INSERT INTO results VALUES (?, ?, ?, ?, ?, ?, ?)',
				state.round,
				car,
				slot + 1,
				state.conditions[slot],
				result.order.indexOf(car) + 1,
				Number(result.firstOut === car),
				Number(result.fastest === car)
			)
		);
		await this.move({
			...state,
			phase: 'racing',
			startsAt,
			endsAt: startsAt + ((recording.frames - 1) / recording.rate) * 1000
		});
		for (const socket of this.ctx.getWebSockets()) {
			try {
				socket.send(bytes);
			} catch {
				// one that is on its way out
			}
		}
	}

	/** The race has been shown to its end: the result goes up and the bets are paid. */
	private async finish(state: RoomState) {
		const result = this.ctx.storage.kv.get<Result>('result')!;
		const pools = this.pools(state);
		this.ctx.storage.transactionSync(() => {
			const open = this.sql
				.exec<{
					id: number;
					player: number;
					market: Market;
					outcome: string;
					stake: number;
				}>(
					'SELECT id, player, market, outcome, stake FROM bets WHERE round = ? AND payout IS NULL',
					state.round
				)
				.toArray();
			for (const bet of open) {
				const payout = Math.floor(
					bet.stake * pays(pools[bet.market], bet.market, bet.outcome, result)
				);
				this.sql.exec('UPDATE bets SET payout = ? WHERE id = ?', payout, bet.id);
				this.sql.exec('UPDATE players SET balance = balance + ? WHERE id = ?', payout, bet.player);
			}
		});
		await this.move({ ...state, phase: 'results', endsAt: Date.now() + RESULTS_MS, result });
		this.settled();
	}

	/** Calls a race off: every bet on it not yet paid is handed back. */
	private void(round: number) {
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(
				`UPDATE players SET balance = balance + stakes.total FROM (
					SELECT player, SUM(stake) AS total FROM bets WHERE round = ? AND payout IS NULL GROUP BY player
				) AS stakes WHERE players.id = stakes.player`,
				round
			);
			this.sql.exec('UPDATE bets SET payout = stake WHERE round = ? AND payout IS NULL', round);
			this.sql.exec('UPDATE races SET voided = 1 WHERE round = ?', round);
		});
		this.settled();
	}

	/** After money has moved: tells each page where its player stands, and everyone the board. */
	private settled() {
		for (const socket of this.ctx.getWebSockets()) {
			const player: number | null = socket.deserializeAttachment();
			if (player) this.send(socket, this.you(player));
		}
		this.tell(this.board());
	}

	// The money

	/** The chips on every outcome of this race: the house's seed, and every bet. */
	private pools(state: RoomState): Pools {
		const pools = Object.fromEntries(MARKETS.map((market) => [market, {}])) as Pools;
		const rows = this.sql.exec<{ market: Market; outcome: string; chips: number }>(
			`SELECT market, outcome, chips FROM pool_seeds WHERE round = ?1
			 UNION ALL SELECT market, outcome, stake FROM bets WHERE round = ?1`,
			state.round
		);
		for (const { market, outcome, chips } of rows) {
			pools[market][outcome] = (pools[market][outcome] ?? 0) + chips;
		}
		return pools;
	}

	/** Finds the player a cookie's secret belongs to, or takes them on with the opening stake. */
	private join(key: string): number {
		const now = Date.now();
		const known = this.sql
			.exec<{ id: number }>('SELECT id FROM players WHERE key = ?', key)
			.toArray();
		if (known.length) {
			this.sql.exec('UPDATE players SET seen = ? WHERE id = ?', now, known[0].id);
			return known[0].id;
		}
		const { id } = this.sql
			.exec<{
				id: number;
			}>(
				"INSERT INTO players (key, name, balance, seen) VALUES (?, '', ?, ?) RETURNING id",
				key,
				START,
				now
			)
			.one();
		this.sql.exec('UPDATE players SET name = ? WHERE id = ?', `Guest ${id}`, id);
		return id;
	}

	private player(id: number) {
		return this.sql
			.exec<PlayerRow>(
				'SELECT id, name, balance, bankruptcies, banned FROM players WHERE id = ?',
				id
			)
			.one();
	}

	private you(id: number): FromRoom {
		const { banned: _, ...you } = this.player(id);
		const bets = this.sql
			.exec<Bet>(
				'SELECT market, outcome, stake, payout FROM bets WHERE round = ? AND player = ? ORDER BY id',
				this.state.round,
				id
			)
			.toArray();
		return { type: 'you', you, bets };
	}

	private board(): FromRoom {
		const board = this.sql
			.exec<Standing>(
				'SELECT id, name, balance, bankruptcies FROM players WHERE banned = 0 ORDER BY balance DESC LIMIT 20'
			)
			.toArray();
		return { type: 'board', board };
	}

	// What a player can ask for. Each returns why not, or nothing if done.

	private rename(id: number, name: unknown) {
		const clean = typeof name === 'string' ? cleanName(name) : null;
		if (!clean) return 'Names are 2 to 16 letters, numbers or spaces';
		this.sql.exec('UPDATE players SET name = ? WHERE id = ?', clean, id);
		this.tell(this.board());
	}

	private bet(id: number, market: Market, outcome: unknown, stake: unknown) {
		const state = this.state;
		// the alarm that closes betting can run late; the clock is what counts
		if (state.phase !== 'betting' || Date.now() >= state.endsAt) return 'Betting is closed';
		if (!MARKETS.includes(market) || !outcomes(market, state.grid).includes(outcome as string)) {
			return 'No such bet';
		}
		if (!Number.isInteger(stake) || (stake as number) < 1) return 'Stake a whole number of chips';
		const player = this.player(id);
		if (player.banned) return 'This player cannot bet';
		if (player.balance - (stake as number) < -DEBT_CAP)
			return `Your credit runs out at ${-DEBT_CAP}`;
		const placed = this.sql
			.exec<{
				n: number;
			}>('SELECT COUNT(*) AS n FROM bets WHERE round = ? AND player = ?', state.round, id)
			.one().n;
		if (placed >= MAX_BETS) return `No more than ${MAX_BETS} bets a race`;
		this.ctx.storage.transactionSync(() => {
			this.sql.exec('UPDATE players SET balance = balance - ? WHERE id = ?', stake, id);
			this.sql.exec(
				'INSERT INTO bets (round, player, market, outcome, stake) VALUES (?, ?, ?, ?, ?)',
				state.round,
				id,
				market,
				outcome,
				stake
			);
		});
		this.tell({
			type: 'bet',
			name: player.name,
			market,
			outcome: outcome as string,
			stake: stake as number,
			pool: this.pools(state)[market][outcome as string]
		});
		this.tell(this.board());
	}

	/** Wipes a debt and starts the player again on the opening stake, on the record. */
	private bankrupt(id: number) {
		const { balance } = this.player(id);
		if (balance >= 0) return 'Only a player in debt can go bankrupt';
		const waiting = this.sql
			.exec('SELECT 1 FROM bets WHERE player = ? AND payout IS NULL LIMIT 1', id)
			.toArray();
		if (waiting.length) return 'Wait for your bets on this race to be settled';
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(
				'UPDATE players SET balance = ?, bankruptcies = bankruptcies + 1 WHERE id = ?',
				START,
				id
			);
			this.sql.exec(
				"INSERT INTO adjustments (player, at, kind, amount) VALUES (?, ?, 'bankruptcy', ?)",
				id,
				Date.now(),
				START - balance
			);
		});
		this.tell(this.board());
	}
}
