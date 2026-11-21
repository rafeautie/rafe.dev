import { DurableObject } from 'cloudflare:workers';
import {
	cleanName,
	MARKETS,
	MAX_BETS,
	outcomes,
	pays,
	seed as seedPool,
	type Market,
	type Pools,
	type Result
} from './betting';
import { createReplay, pack, record, unpack, type Recording } from './recording';
import {
	LEAD_MS,
	type Bet,
	type FromRoom,
	type RoomState,
	type Standing,
	type ToRoom
} from './room';
import { drawConditions, inCondition, ROSTER } from './roster';
import { checkSettings, DEFAULT_SETTINGS, tuned, type Settings } from './settings';
import { drawGrid, flown, LIGHTS, neutral, random, rank, type Flag, type RaceEvent } from './sim';
import { getTrack } from './track';

// The one room everybody at /race is in. It runs the cycle (betting, the
// race, the result, and round again) on an alarm, keeps a socket open to
// every page watching, and is the bank: it holds every player's chips and
// takes and pays every bet. When betting closes it runs the whole race at
// once, keeps the recording, and sends it out; pages only play it back, each
// at the moment the room's clock says, so they all see the same thing.
//
// Between alarms the room is put to sleep and forgets everything in memory,
// so all it knows is in storage. The cycle is in four keys: 'state' (a
// RoomState), and for a race that has started, 'recording' (its bytes),
// 'result', 'flags' (when the admin has thrown a caution in it, so it can be
// run again the same) and 'signals' (when each flag flies in it). The money is in the tables made in the constructor. What
// /admin/race has set is in 'settings' (settings.ts) and 'paused'.

const IDLE: RoomState = {
	round: 0,
	phase: 'idle',
	endsAt: 0,
	grid: [],
	conditions: [],
	startsAt: 0,
	result: null,
	settings: DEFAULT_SETTINGS
};

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** From the admin throwing a caution to it coming out, so the race with it in reaches every page first. */
const CAUTION_LEAD_MS = 1_000;

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
		if (state.phase === 'idle' && !this.paused) {
			// the first one in starts the next race, and is told with everyone else
			await this.open(state.round + 1);
		} else {
			this.send(server, this.report(state));
			const recording = this.ctx.storage.kv.get<Uint8Array>('recording');
			if (state.phase !== 'betting' && recording) server.send(recording);
		}
		if (player) this.send(server, this.you(player));
		// a player arriving is on the board now, for everyone
		if (player) this.tell(this.board());
		else this.send(server, this.board());
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
		this.left(socket);
	}

	webSocketError(socket: WebSocket) {
		this.left(socket);
	}

	/** A page gone: if it was its player's last, the board goes out without them. */
	private left(socket: WebSocket) {
		const player: number | null = socket.deserializeAttachment();
		if (player && !this.connected(socket).has(player)) this.tell(this.board(socket));
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
			else if (state.phase === 'results') await this.next(state.round);
		} catch (error) {
			// A phase that fails would be retried a few times and then leave
			// the room stuck for good. Call the race off, hand its bets back,
			// and start the next.
			console.error({ message: 'race room phase failed', phase: state.phase, error });
			this.void(state.round);
			await this.next(state.round);
		}
	}

	// The cycle

	private get state(): RoomState {
		const state = this.ctx.storage.kv.get<RoomState>('state');
		// A state kept from before races carried their settings takes today's;
		// one from before there was a choice of track was raced on the circuit.
		return state
			? {
					...state,
					settings: state.settings
						? { ...state.settings, track: state.settings.track ?? 'circuit' }
						: this.settings
				}
			: { ...IDLE, settings: this.settings };
	}

	/** The admin's settings, or the code's where there are none. */
	private get settings(): Settings {
		const saved = this.ctx.storage.kv.get<Settings>('settings');
		// saved before a setting existed, it is the code's
		return saved
			? { ...DEFAULT_SETTINGS, ...saved, cars: { ...DEFAULT_SETTINGS.cars, ...saved.cars } }
			: DEFAULT_SETTINGS;
	}

	private get paused() {
		return this.ctx.storage.kv.get<boolean>('paused') ?? false;
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
	 * After a race: the next one, or, if nobody is watching or the admin has
	 * paused the races, waiting, which pages show until it opens.
	 */
	private async next(round: number) {
		if (this.ctx.getWebSockets().length && !this.paused) return this.open(round + 1);
		const state: RoomState = { ...IDLE, round, settings: this.settings };
		this.ctx.storage.kv.put('state', state);
		this.ctx.storage.kv.delete('recording');
		await this.ctx.storage.deleteAlarm();
		this.tell(this.report(state));
	}

	/**
	 * Opens betting on a new race: draws the starting order and the cars'
	 * conditions, and seeds every pool by running the race a few times over
	 * to see how it tends to go. The race keeps the settings as they are now.
	 */
	private open(round: number) {
		const settings = this.settings;
		const rand = random(seed());
		const field = drawGrid(seed(), tuned(settings));
		const conditions = drawConditions(rand, field.length);
		const grid = field.map((entry) => entry.id);
		const cars = field.map((entry, slot) => inCondition(entry, conditions[slot]));
		const track = getTrack(settings.track);
		const trials = Array.from({ length: settings.trials }, () =>
			resultOf(record(seed(), cars, track))
		);
		this.ctx.storage.kv.delete('recording');
		for (const market of MARKETS) {
			for (const [outcome, chips] of Object.entries(
				seedPool(market, grid, trials, settings.seed)
			)) {
				this.sql.exec('INSERT INTO pool_seeds VALUES (?, ?, ?, ?)', round, market, outcome, chips);
			}
		}
		return this.move({
			...IDLE,
			round,
			phase: 'betting',
			endsAt: Date.now() + settings.bettingSeconds * 1000,
			grid,
			conditions,
			settings
		});
	}

	/**
	 * Runs a race from its seed, all of it, with a caution thrown at each of
	 * the race times in `flags`, and keeps the recording and how it came out.
	 * Run again with one more flag, it is the same race up to that moment.
	 */
	private run(state: RoomState, raceSeed: number, flags: number[]) {
		const roster = tuned(state.settings);
		const cars = state.grid.map((id, slot) =>
			inCondition(roster.find((entry) => entry.id === id)!, state.conditions[slot])
		);
		const recording = record(raceSeed, cars, getTrack(state.settings.track), flags);
		const result = resultOf(recording);
		const bytes = pack(recording);
		this.ctx.storage.kv.put('recording', bytes);
		this.ctx.storage.kv.put('result', result);
		this.ctx.storage.kv.put('flags', flags);
		// What flew a flag and when, kept apart so the admin page can be told the
		// flag without the whole recording being read. An event flies a flag if
		// the flag after it is the same whichever was flying before.
		this.ctx.storage.kv.put(
			'signals',
			recording.events
				.filter(({ kind }) => flown('green', kind) === flown('yellow', kind))
				.map(({ kind, time }) => ({ kind, time }))
		);
		this.sql.exec('DELETE FROM results WHERE round = ?', state.round);
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
		return { bytes, lasts: ((recording.frames - 1) / recording.rate) * 1000 };
	}

	/** Sends everyone the recording of the race, after the state that says what it is. */
	private show(bytes: Uint8Array) {
		for (const socket of this.ctx.getWebSockets()) {
			try {
				socket.send(bytes);
			} catch {
				// one that is on its way out
			}
		}
	}

	/**
	 * Closes betting and runs the race, all of it, now. Its seed is drawn
	 * here and never leaves the room, so nobody could have run it first.
	 */
	private async start(state: RoomState) {
		const raceSeed = seed();
		const { bytes, lasts } = this.run(state, raceSeed, []);
		const startsAt = Date.now() + LEAD_MS;
		this.sql.exec(
			'INSERT INTO races (round, started, seed) VALUES (?, ?, ?)',
			state.round,
			startsAt,
			raceSeed
		);
		await this.move({ ...state, phase: 'racing', startsAt, endsAt: startsAt + lasts });
		this.show(bytes);
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
		await this.move({
			...state,
			phase: 'results',
			endsAt: Date.now() + state.settings.resultsSeconds * 1000,
			result
		});
		this.settled();
	}

	/**
	 * Calls a race off: every bet on it not yet paid is handed back. One
	 * called off before it ran is put on the record too, with no seed.
	 */
	private void(round: number) {
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(
				`UPDATE players SET balance = balance + stakes.total FROM (
					SELECT player, SUM(stake) AS total FROM bets WHERE round = ? AND payout IS NULL GROUP BY player
				) AS stakes WHERE players.id = stakes.player`,
				round
			);
			this.sql.exec('UPDATE bets SET payout = stake WHERE round = ? AND payout IS NULL', round);
			this.sql.exec(
				`INSERT INTO races (round, started, seed, voided) VALUES (?, ?, 0, 1)
				 ON CONFLICT (round) DO UPDATE SET voided = 1`,
				round,
				Date.now()
			);
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
				this.state.settings.start,
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

	/** The players with a page open, but for one that is closing. */
	private connected(closing?: WebSocket) {
		const players = new Set<number>();
		for (const socket of this.ctx.getWebSockets()) {
			const player: number | null = socket.deserializeAttachment();
			if (player && socket !== closing) players.add(player);
		}
		return players;
	}

	/** The leaderboard: only the players watching now, richest first. */
	private board(closing?: WebSocket): FromRoom {
		const ids = [...this.connected(closing)];
		const board = ids.length
			? this.sql
					.exec<Standing>(
						`SELECT id, name, balance, bankruptcies FROM players
						 WHERE banned = 0 AND id IN (SELECT value FROM json_each(?))
						 ORDER BY balance DESC LIMIT 20`,
						JSON.stringify(ids)
					)
					.toArray()
			: [];
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
		const { debtCap } = state.settings;
		if (player.balance - (stake as number) < -debtCap) return `Your credit runs out at ${-debtCap}`;
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
		const { start } = this.state.settings;
		const { balance } = this.player(id);
		if (balance >= 0) return 'Only a player in debt can go bankrupt';
		const waiting = this.sql
			.exec('SELECT 1 FROM bets WHERE player = ? AND payout IS NULL LIMIT 1', id)
			.toArray();
		if (waiting.length) return 'Wait for your bets on this race to be settled';
		this.ctx.storage.transactionSync(() => {
			this.sql.exec(
				'UPDATE players SET balance = ?, bankruptcies = bankruptcies + 1 WHERE id = ?',
				start,
				id
			);
			this.sql.exec(
				"INSERT INTO adjustments (player, at, kind, amount) VALUES (?, ?, 'bankruptcy', ?)",
				id,
				Date.now(),
				start - balance
			);
		});
		this.tell(this.board());
	}

	// What /admin/race asks of the room. These are called over the Worker's
	// binding (lib/race/admin.ts, which checks the admin is signed in first);
	// no socket message reaches them. Each action returns why not, or null.

	/** Everything the admin page shows, with players whose names contain `search`. */
	adminView(search: string) {
		return {
			loop: this.loopView(),
			players: this.playersView(search),
			live: this.liveView(),
			settings: {
				settings: this.settings,
				tuned: this.ctx.storage.kv.get('settings') !== undefined
			},
			history: this.historyView()
		};
	}

	adminRename(id: number, name: string) {
		const refused = this.missing(id) ?? this.rename(id, name);
		if (refused) return refused;
		this.changed(id);
		return null;
	}

	/** Puts a player back on the starting chips, on the record with the chips it moved. */
	adminReset(id: number) {
		const missing = this.missing(id);
		if (missing) return missing;
		const { start } = this.state.settings;
		this.ctx.storage.transactionSync(() => {
			const { balance } = this.player(id);
			this.sql.exec('UPDATE players SET balance = ? WHERE id = ?', start, id);
			this.sql.exec(
				"INSERT INTO adjustments (player, at, kind, amount) VALUES (?, ?, 'admin_reset', ?)",
				id,
				Date.now(),
				start - balance
			);
		});
		this.changed(id);
		return null;
	}

	/**
	 * Bans a player, or lets them back. A banned player's bets not yet settled
	 * are withdrawn, their stakes handed back and the bets taken out of the
	 * pools, so the race pays out as if they had never bet.
	 */
	adminBan(id: number, banned: boolean) {
		const missing = this.missing(id);
		if (missing) return missing;
		this.ctx.storage.transactionSync(() => {
			this.sql.exec('UPDATE players SET banned = ? WHERE id = ?', Number(banned), id);
			if (!banned) return;
			this.sql.exec(
				`UPDATE players SET balance = balance +
					(SELECT COALESCE(SUM(stake), 0) FROM bets WHERE player = ?1 AND payout IS NULL)
				 WHERE id = ?1`,
				id
			);
			this.sql.exec('DELETE FROM bets WHERE player = ? AND payout IS NULL', id);
		});
		this.changed(id);
		// the pools are smaller now
		const state = this.state;
		if (banned && state.phase !== 'idle') this.tell(this.report(state));
		return null;
	}

	/**
	 * Paused, the race under way runs to its result and then the room waits;
	 * unpaused, the next race opens if anybody is watching.
	 */
	async adminPause(paused: boolean) {
		if (paused) this.ctx.storage.kv.put('paused', true);
		else this.ctx.storage.kv.delete('paused');
		const state = this.state;
		if (!paused && state.phase === 'idle') await this.next(state.round);
		return null;
	}

	/** Calls off the race being bet on or run, and moves on. */
	async adminVoid() {
		const state = this.state;
		if (state.phase === 'idle') return 'No race is on';
		if (state.phase === 'results') return 'This race is over and paid out';
		this.void(state.round);
		await this.next(state.round);
		return null;
	}

	/**
	 * Throws a caution in the race being shown. That race was run to its end
	 * when betting closed, so it is run again from the same seed with the
	 * caution in it, a moment from now: the same race until then, and another
	 * from there on, with whatever result that one comes to. Nobody has seen
	 * the result it replaces, and every bet stands.
	 */
	async adminCaution() {
		const state = this.state;
		const bytes = this.ctx.storage.kv.get<Uint8Array>('recording');
		if (state.phase !== 'racing' || !bytes) return 'No race is running';
		const at = (Date.now() + CAUTION_LEAD_MS - state.startsAt) / 1000;
		if (at <= LIGHTS) return 'The race has not started';
		const shown = createReplay(unpack(bytes), ROSTER);
		shown.seek(at);
		if (neutral(shown.flag)) return 'A caution is already out';
		if (at >= shown.duration || shown.cars.some((car) => car.finishTime)) {
			return 'The race is as good as over';
		}
		const { seed: raceSeed } = this.sql
			.exec<{ seed: number }>('SELECT seed FROM races WHERE round = ?', state.round)
			.one();
		const flags = this.ctx.storage.kv.get<number[]>('flags') ?? [];
		const again = this.run(state, raceSeed, [...flags, at]);
		await this.move({ ...state, endsAt: state.startsAt + again.lasts });
		this.show(again.bytes);
		return null;
	}

	adminSaveSettings(input: unknown) {
		const settings = checkSettings(input);
		if (typeof settings === 'string') return settings;
		this.ctx.storage.kv.put('settings', settings);
		return null;
	}

	adminResetSettings() {
		this.ctx.storage.kv.delete('settings');
		return null;
	}

	private missing(id: number) {
		const found = this.sql.exec('SELECT 1 FROM players WHERE id = ?', id).toArray();
		return found.length ? null : 'No such player';
	}

	/** After the admin has changed a player: tells their pages where they stand, and everyone the board. */
	private changed(id: number) {
		for (const socket of this.ctx.getWebSockets()) {
			if (socket.deserializeAttachment() === id) this.send(socket, this.you(id));
		}
		this.tell(this.board());
	}

	/** The flag flying in the race being shown at this moment, or null when no race is. */
	private flag(state: RoomState): Flag | null {
		if (state.phase !== 'racing') return null;
		const at = (Date.now() - state.startsAt) / 1000;
		const signals = this.ctx.storage.kv.get<Pick<RaceEvent, 'kind' | 'time'>[]>('signals') ?? [];
		return signals
			.filter((signal) => signal.time <= at)
			.reduce<Flag>((flying, signal) => flown(flying, signal.kind), 'green');
	}

	private loopView() {
		const state = this.state;
		const sockets = this.ctx.getWebSockets();
		const pools = this.pools(state);
		const staked = Object.fromEntries(
			this.sql
				.exec<{ market: Market; chips: number }>(
					'SELECT market, SUM(stake) AS chips FROM bets WHERE round = ? GROUP BY market',
					state.round
				)
				.toArray()
				.map(({ market, chips }) => [market, chips])
		);
		return {
			round: state.round,
			phase: state.phase,
			track: state.settings.track,
			// when this phase began, so the page can show how far through it is
			since: {
				idle: state.endsAt,
				betting: state.endsAt - state.settings.bettingSeconds * 1000,
				racing: state.startsAt - LEAD_MS,
				results: state.endsAt - state.settings.resultsSeconds * 1000
			}[state.phase],
			endsAt: state.endsAt,
			now: Date.now(),
			flag: this.flag(state),
			paused: this.paused,
			viewers: sockets.length,
			players: new Set(sockets.map((socket) => socket.deserializeAttachment()).filter(Boolean))
				.size,
			grid: state.grid.map((car, slot) => ({
				car,
				condition: state.conditions[slot],
				...state.settings.cars[car]
			})),
			pools: MARKETS.map((market) => ({
				market,
				total: Object.values(pools[market]).reduce((sum, chips) => sum + chips, 0),
				staked: staked[market] ?? 0
			}))
		};
	}

	/** Players, most recently seen first. Their secret keys stay here. */
	private playersView(search: string) {
		const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
		return this.playerRows("name LIKE ? ESCAPE '\\' ORDER BY seen DESC", like);
	}

	/** The players with the game open now, banned or not, richest first. */
	private liveView() {
		const ids = [...this.connected()];
		if (ids.length === 0) return [];
		return this.playerRows(
			'id IN (SELECT value FROM json_each(?)) ORDER BY balance DESC',
			JSON.stringify(ids)
		);
	}

	/** Up to a hundred players as the admin page lists them: those `where` picks, in its order. */
	private playerRows(where: string, value: string) {
		return this.sql
			.exec<PlayerRow & { seen: number; bets: number }>(
				`SELECT id, name, balance, bankruptcies, banned, seen, COALESCE(placed.n, 0) AS bets
				 FROM players LEFT JOIN (SELECT player, COUNT(*) AS n FROM bets GROUP BY player) AS placed
				 ON placed.player = players.id
				 WHERE ${where} LIMIT 100`,
				value
			)
			.toArray()
			.map((row) => ({ ...row, banned: Boolean(row.banned) }));
	}

	/**
	 * The last 50 races and the house's books, from the bets as they were
	 * settled; a race still being run counts once it is paid. Its result is
	 * left out until it has been shown, so this page is no way to know first.
	 */
	private historyView() {
		const state = this.state;
		const hidden = state.phase === 'racing' ? state.round : -1;
		const races = this.sql
			.exec<{ round: number; started: number; voided: number; staked: number; paid: number }>(
				`SELECT round, started, voided,
					(SELECT COALESCE(SUM(stake), 0) FROM bets WHERE bets.round = races.round AND payout IS NOT NULL) AS staked,
					(SELECT COALESCE(SUM(payout), 0) FROM bets WHERE bets.round = races.round AND payout IS NOT NULL) AS paid
				 FROM races WHERE round != ? ORDER BY round DESC LIMIT 50`,
				hidden
			)
			.toArray();
		const rows = this.sql
			.exec<{
				round: number;
				car: string;
				condition: string;
				place: number;
				first_out: number;
				fastest: number;
			}>(
				'SELECT round, car, condition, place, first_out, fastest FROM results WHERE round >= ? AND round != ? ORDER BY grid',
				races.at(-1)?.round ?? 0,
				hidden
			)
			.toArray();
		const totals = this.sql
			.exec<{
				staked: number;
				paid: number;
			}>(
				'SELECT COALESCE(SUM(stake), 0) AS staked, COALESCE(SUM(payout), 0) AS paid FROM bets WHERE payout IS NOT NULL'
			)
			.one();
		const adjusted = this.sql
			.exec<{ bankruptcies: number; resets: number }>(
				`SELECT COALESCE(SUM(CASE WHEN kind = 'bankruptcy' THEN amount END), 0) AS bankruptcies,
					COALESCE(SUM(CASE WHEN kind = 'admin_reset' THEN amount END), 0) AS resets
				 FROM adjustments`
			)
			.one();
		const cars = this.sql
			.exec<{
				car: string;
				starts: number;
				wins: number;
				podiums: number;
				firstOuts: number;
				fastestLaps: number;
				averagePlace: number;
			}>(
				`SELECT car, COUNT(*) AS starts, SUM(place = 1) AS wins, SUM(place <= 3) AS podiums,
					SUM(first_out) AS firstOuts, SUM(fastest) AS fastestLaps, AVG(place) AS averagePlace
				 FROM results WHERE round != ? GROUP BY car ORDER BY wins DESC, averagePlace`,
				hidden
			)
			.toArray()
			.map((car) => ({ ...car, winRate: car.wins / car.starts }));
		return {
			races: races.map((race) => {
				const run = rows.filter((row) => row.round === race.round);
				return {
					round: race.round,
					started: race.started,
					voided: Boolean(race.voided),
					grid: run.map(({ car, condition }) => ({ car, condition })),
					order: [...run].sort((a, b) => a.place - b.place).map((row) => row.car),
					firstOut: run.find((row) => row.first_out)?.car ?? null,
					fastest: run.find((row) => row.fastest)?.car ?? null,
					staked: race.staked,
					paid: race.paid,
					net: race.staked - race.paid
				};
			}),
			totals: {
				run: this.sql
					.exec<{
						n: number;
					}>('SELECT COUNT(DISTINCT round) AS n FROM results WHERE round != ?', hidden)
					.one().n,
				staked: totals.staked,
				paid: totals.paid,
				net: totals.staked - totals.paid,
				...adjusted
			},
			cars
		};
	}
}
