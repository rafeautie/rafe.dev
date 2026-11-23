import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { DEBT_CAP, pays, SEED, START, type Pools } from './betting';
import { unpack } from './recording';
import { BETTING_MS, type FromRoom, type RoomState, type ToRoom } from './room';
import { ROSTER } from './roster';
import { DEFAULT_SETTINGS } from './settings';

type Stub = ReturnType<typeof env.RACE_ROOM.getByName>;
type Sent<T extends FromRoom['type']> = Extract<FromRoom, { type: T }>;

// opening a race runs it over a few times to seed the pools
const SLOW = { timeout: 60_000 };

/** A room that opens its races quickly: five practice runs to seed the pools, not thirty. */
async function quick(name: string) {
	const room = env.RACE_ROOM.getByName(name);
	await room.adminSaveSettings({ ...DEFAULT_SETTINGS, trials: 5 });
	return room;
}

/** Connects to a room as a page would, and collects what it is sent. */
async function watch(room: Stub, key?: string) {
	const response = await room.fetch('https://rafe.dev/race/socket', {
		headers: { Upgrade: 'websocket', ...(key && { 'x-player': key }) }
	});
	const socket = response.webSocket!;
	const got: FromRoom[] = [];
	const recordings: Uint8Array[] = [];
	socket.accept();
	socket.addEventListener('message', ({ data }) => {
		if (typeof data === 'string') got.push(JSON.parse(data));
		else recordings.push(new Uint8Array(data));
	});
	const all = <T extends FromRoom['type']>(type: T) =>
		got.filter((message): message is Sent<T> => message.type === type);
	return {
		socket,
		recordings,
		all,
		states: () => all('state').map((message) => message.state),
		/** The latest message of a kind. */
		last: <T extends FromRoom['type']>(type: T) => all(type).at(-1)!,
		/** Sends a message and waits for the room to answer it, one way or the other. */
		async ask(message: ToRoom) {
			const before = all('you').length + all('no').length;
			socket.send(JSON.stringify(message));
			await vi.waitFor(() => expect(all('you').length + all('no').length).toBe(before + 1));
			return got.filter((m) => m.type === 'you' || m.type === 'no').at(-1)!;
		}
	};
}

const stored = (room: Stub) =>
	runInDurableObject(room, (_, { storage }) => storage.kv.get<RoomState>('state'));

/** Lets the current phase's time run out, without ringing the alarm that ends it. */
const expire = (room: Stub) =>
	runInDurableObject(room, (_, { storage }) => {
		storage.kv.put('state', { ...storage.kv.get<RoomState>('state')!, endsAt: 0 });
	});

/** Lets the current phase's time run out and rings the alarm that ends it. */
async function ring(room: Stub) {
	await expire(room);
	expect(await runDurableObjectAlarm(room)).toBe(true);
}

describe('the race room', () => {
	it('opens betting for the first to arrive, and tells the next the same', SLOW, async () => {
		const room = await quick('arriving');
		const before = Date.now();
		const first = await watch(room);
		await vi.waitFor(() => expect(first.states()).toHaveLength(1));
		const [state] = first.states();
		expect(state).toMatchObject({ round: 1, phase: 'betting', result: null });
		// as many cars as the settings ask for, each from the roster and none twice
		expect(state.grid).toHaveLength(DEFAULT_SETTINGS.count);
		expect(new Set(state.grid).size).toBe(state.grid.length);
		for (const car of state.grid) expect(ROSTER.map((entry) => entry.id)).toContain(car);
		expect(state.conditions).toHaveLength(state.grid.length);
		expect(state.endsAt).toBeGreaterThanOrEqual(before + BETTING_MS);
		expect(await runInDurableObject(room, (_, { storage }) => storage.getAlarm())).toBe(
			state.endsAt
		);
		// every pool is seeded before anyone bets
		const { pools } = first.last('state');
		expect(Object.keys(pools.exacta)).toHaveLength(30);
		for (const pool of Object.values(pools)) {
			expect(Object.values(pool).reduce((sum, chips) => sum + chips, 0)).toBeCloseTo(SEED);
		}

		const second = await watch(room);
		await vi.waitFor(() => expect(second.states()).toEqual([state]));
		expect(first.states()).toHaveLength(1);
	});

	it(
		'runs the race when betting closes, for those watching and those who come late',
		SLOW,
		async () => {
			const room = await quick('racing');
			const early = await watch(room);
			await ring(room);
			await vi.waitFor(() => expect(early.recordings).toHaveLength(1));
			const state = early.states()[1];
			const recording = unpack(early.recordings[0]);
			expect(state).toMatchObject({ round: 1, phase: 'racing', result: null });
			expect(recording.grid).toEqual(state.grid);
			expect(recording.track).toBe(state.settings.track);
			// the phase lasts exactly as long as the recording does
			expect(state.endsAt - state.startsAt).toBeCloseTo(
				((recording.frames - 1) / recording.rate) * 1000
			);

			const late = await watch(room);
			await vi.waitFor(() => expect(late.recordings).toHaveLength(1));
			expect(late.states()).toEqual([state]);
			expect(late.recordings[0]).toEqual(early.recordings[0]);
		}
	);

	it('ignores an alarm that comes before the phase is over', SLOW, async () => {
		const room = await quick('early alarm');
		const viewer = await watch(room);
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(1));
		expect(await runDurableObjectAlarm(room)).toBe(true);
		expect(await stored(room)).toEqual(viewer.states()[0]);
		// and still means to end the phase when it is
		expect(await runInDurableObject(room, (_, { storage }) => storage.getAlarm())).toBe(
			viewer.states()[0].endsAt
		);
	});

	it('puts up the result, then goes round again while someone is watching', SLOW, async () => {
		const room = await quick('cycle');
		const viewer = await watch(room);
		await ring(room);
		await ring(room);
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(3));
		const done = viewer.states()[2];
		expect(done).toMatchObject({ round: 1, phase: 'results' });
		expect([...done.result!.order].sort()).toEqual([...done.grid].sort());

		await ring(room);
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(4));
		expect(viewer.states()[3]).toMatchObject({
			round: 2,
			phase: 'betting',
			result: null,
			startsAt: 0
		});
		// a page arriving now is not sent the last race
		const next = await watch(room);
		await vi.waitFor(() => expect(next.states()).toHaveLength(1));
		expect(next.recordings).toHaveLength(0);
	});

	it(
		'stops after the result when nobody is left, and starts again for the next to arrive',
		SLOW,
		async () => {
			const room = await quick('emptying');
			const viewer = await watch(room);
			await ring(room);
			viewer.socket.close(1000, 'gone');
			await vi.waitFor(async () =>
				expect(await runInDurableObject(room, (_, state) => state.getWebSockets())).toHaveLength(0)
			);
			// the race it had started still runs to its result
			await ring(room);
			expect(await stored(room)).toMatchObject({ round: 1, phase: 'results' });
			await ring(room);
			expect(await stored(room)).toMatchObject({ round: 1, phase: 'idle' });
			expect(await runDurableObjectAlarm(room)).toBe(false);

			const back = await watch(room);
			await vi.waitFor(() => expect(back.states()).toHaveLength(1));
			expect(back.states()[0]).toMatchObject({ round: 2, phase: 'betting' });
		}
	);

	it('tells a page the time, and ignores anything else it is sent', SLOW, async () => {
		const room = await quick('time');
		const viewer = await watch(room);
		viewer.socket.send('not json');
		viewer.socket.send(JSON.stringify({ type: 'sync' }));
		viewer.socket.send(new Uint8Array(4));
		const before = Date.now();
		viewer.socket.send(JSON.stringify({ type: 'sync', sent: 123 }));
		await vi.waitFor(() => expect(viewer.all('sync')).toHaveLength(1));
		expect(viewer.last('sync').sent).toBe(123);
		expect(viewer.last('sync').now).toBeGreaterThanOrEqual(before);
	});
});

describe('the betting', () => {
	it('knows a player by their cookie, and lets them choose a name', SLOW, async () => {
		const room = await quick('players');
		const first = await watch(room, 'secret-of-the-first');
		await vi.waitFor(() => expect(first.all('you')).toHaveLength(1));
		const { you } = first.last('you');
		expect(you).toMatchObject({ name: `Guest ${you.id}`, balance: START, bankruptcies: 0 });

		expect(await first.ask({ type: 'name', name: ' Rafe ' })).toMatchObject({
			you: { name: 'Rafe' }
		});
		expect(await first.ask({ type: 'name', name: 'x' })).toMatchObject({ type: 'no' });
		await vi.waitFor(() => expect(first.last('board').board).toEqual([{ ...you, name: 'Rafe' }]));

		// the same cookie is the same player; another is somebody else
		const again = await watch(room, 'secret-of-the-first');
		const other = await watch(room, 'secret-of-the-second');
		await vi.waitFor(() => expect(again.all('you')).toHaveLength(1));
		await vi.waitFor(() => expect(other.all('you')).toHaveLength(1));
		expect(again.last('you').you).toEqual({ ...you, name: 'Rafe' });
		expect(other.last('you').you.id).not.toBe(you.id);
		// and nobody's secret is ever sent out
		expect(JSON.stringify(other.all('board'))).not.toContain('secret');
	});

	it('puts only the players watching now on the board', SLOW, async () => {
		const room = await quick('watching');
		const stayer = await watch(room, 'secret-of-the-stayer');
		const leaver = await watch(room, 'secret-of-the-leaver');
		await vi.waitFor(() => expect(stayer.all('you')).toHaveLength(1));
		await vi.waitFor(() => expect(leaver.all('you')).toHaveLength(1));
		const stays = stayer.last('you').you.id;
		const leaves = leaver.last('you').you.id;
		const onBoard = () => stayer.last('board').board.map((player) => player.id);
		// the one already there is told when somebody arrives
		await vi.waitFor(() => expect(onBoard().sort()).toEqual([stays, leaves].sort()));

		// a second page of theirs closing leaves them on it
		const tab = await watch(room, 'secret-of-the-leaver');
		await vi.waitFor(() => expect(tab.all('board')).toHaveLength(1));
		const told = stayer.all('board').length;
		tab.socket.close(1000, 'gone');
		await vi.waitFor(async () =>
			expect(await runInDurableObject(room, (_, state) => state.getWebSockets())).toHaveLength(2)
		);
		expect(stayer.all('board')).toHaveLength(told);

		// their last one closing takes them off, and somebody only watching is never on it
		await watch(room);
		leaver.socket.close(1000, 'gone');
		await vi.waitFor(() => expect(onBoard()).toEqual([stays]));
	});

	it('takes a bet, moves the odds, and tells everyone', SLOW, async () => {
		const room = await quick('placing');
		const punter = await watch(room, 'secret-of-the-punter');
		const onlooker = await watch(room);
		await vi.waitFor(() => expect(punter.all('state')).toHaveLength(1));
		const { state, pools } = punter.last('state');
		const car = state.grid[0];

		const answer = await punter.ask({ type: 'bet', market: 'win', outcome: car, stake: 100 });
		expect(answer).toMatchObject({
			you: { balance: START - 100 },
			bets: [{ market: 'win', outcome: car, stake: 100, payout: null }]
		});
		await vi.waitFor(() => expect(onlooker.all('bet')).toHaveLength(1));
		expect(onlooker.last('bet')).toMatchObject({ market: 'win', outcome: car, stake: 100 });
		expect(onlooker.last('bet').pool).toBeCloseTo(pools.win[car] + 100);
		// someone arriving now sees the pool with the bet in it
		const late = await watch(room);
		await vi.waitFor(() => expect(late.all('state')).toHaveLength(1));
		expect(late.last('state').pools.win[car]).toBeCloseTo(pools.win[car] + 100);

		for (const bad of [
			{ market: 'win', outcome: 'nobody', stake: 10 },
			{ market: 'tombola', outcome: car, stake: 10 },
			{ market: 'win', outcome: car, stake: 0 },
			{ market: 'win', outcome: car, stake: 1.5 },
			{ market: 'win', outcome: car, stake: -50 }
		]) {
			expect(await punter.ask({ type: 'bet', ...bad } as ToRoom)).toMatchObject({ type: 'no' });
		}
		// someone only watching cannot bet at all
		onlooker.socket.send(JSON.stringify({ type: 'bet', market: 'win', outcome: car, stake: 5 }));
		expect(await punter.ask({ type: 'name', name: 'Punter' })).toMatchObject({
			you: { balance: START - 100 }
		});
		expect(onlooker.all('bet')).toHaveLength(1);
	});

	it('refuses a bet once betting has closed', SLOW, async () => {
		const room = await quick('closing');
		const punter = await watch(room, 'secret-of-the-latecomer');
		await vi.waitFor(() => expect(punter.all('state')).toHaveLength(1));
		const car = punter.last('state').state.grid[0];
		const bet: ToRoom = { type: 'bet', market: 'win', outcome: car, stake: 100 };

		// time is up, though the alarm that closes betting has yet to ring
		await expire(room);
		expect(await punter.ask(bet)).toEqual({ type: 'no', reason: 'Betting is closed' });
		expect(await runDurableObjectAlarm(room)).toBe(true);
		expect(await punter.ask(bet)).toEqual({ type: 'no', reason: 'Betting is closed' });
		await ring(room);
		expect(await punter.ask(bet)).toEqual({ type: 'no', reason: 'Betting is closed' });
		expect(punter.last('you').you.balance).toBe(START);
	});

	it('lets a player run into debt, but only so far', SLOW, async () => {
		const room = await quick('debt');
		const punter = await watch(room, 'secret-of-the-borrower');
		await vi.waitFor(() => expect(punter.all('state')).toHaveLength(1));
		const car = punter.last('state').state.grid[0];
		const stake = (chips: number): ToRoom => ({
			type: 'bet',
			market: 'win',
			outcome: car,
			stake: chips
		});

		expect(await punter.ask(stake(START + 500))).toMatchObject({ you: { balance: -500 } });
		expect(await punter.ask(stake(DEBT_CAP - 499))).toMatchObject({ type: 'no' });
		expect(await punter.ask(stake(DEBT_CAP - 500))).toMatchObject({ you: { balance: -DEBT_CAP } });
		expect(await punter.ask(stake(1))).toMatchObject({ type: 'no' });
	});

	it('pays the winners out of the pool when the race is over', SLOW, async () => {
		const room = await quick('paying');
		const punter = await watch(room, 'secret-of-the-backer');
		await vi.waitFor(() => expect(punter.all('state')).toHaveLength(1));
		const { grid } = punter.last('state').state;
		// ten chips on every car to win, and on the race being clean and not
		for (const car of grid) {
			await punter.ask({ type: 'bet', market: 'win', outcome: car, stake: 10 });
		}
		await punter.ask({ type: 'bet', market: 'clean', outcome: 'yes', stake: 10 });
		await punter.ask({ type: 'bet', market: 'clean', outcome: 'no', stake: 10 });
		expect(punter.last('you').you.balance).toBe(START - 80);

		await ring(room);
		// nothing is paid while the race is still being shown
		await vi.waitFor(() => expect(punter.states()).toHaveLength(2));
		expect(punter.last('you').you.balance).toBe(START - 80);
		await ring(room);
		await vi.waitFor(() => expect(punter.states()).toHaveLength(3));
		const { state, pools } = punter.last('state');
		const result = state.result!;
		await vi.waitFor(() => expect(punter.last('you').bets.every((bet) => bet.payout !== null)));

		const { you, bets } = punter.last('you');
		const due = (pool: Pools[keyof Pools], market: 'win' | 'clean', outcome: string) =>
			Math.floor(10 * pays(pool, market, outcome, result));
		for (const bet of bets) {
			expect(bet.payout).toBe(due(pools[bet.market], bet.market as 'win', bet.outcome));
		}
		// one car won and one of yes and no was right; the rest are lost
		expect(bets.filter((bet) => bet.payout).map((bet) => bet.outcome)).toEqual([
			result.order[0],
			result.firstOut ? 'no' : 'yes'
		]);
		expect(you.balance).toBe(START - 80 + bets.reduce((sum, bet) => sum + bet.payout!, 0));
		expect(bets.find((bet) => bet.outcome === result.order[0])!.payout).toBe(
			Math.floor((10 * (SEED + 60)) / pools.win[result.order[0]])
		);
		expect(punter.last('board').board[0]).toEqual(you);
	});

	it('hands every bet back when a race is called off', SLOW, async () => {
		const room = await quick('calling off');
		const punter = await watch(room, 'secret-of-the-unlucky');
		await vi.waitFor(() => expect(punter.all('state')).toHaveLength(1));
		const car = punter.last('state').state.grid[0];
		await punter.ask({ type: 'bet', market: 'win', outcome: car, stake: 250 });
		await punter.ask({ type: 'bet', market: 'lap', outcome: car, stake: 50 });
		// the race cannot be run: one of its cars has gone missing
		await runInDurableObject(room, (_, { storage }) => {
			const state = storage.kv.get<RoomState>('state')!;
			storage.kv.put('state', { ...state, endsAt: 0, grid: ['nobody', ...state.grid.slice(1)] });
		});
		expect(await runDurableObjectAlarm(room)).toBe(true);
		await vi.waitFor(() => expect(punter.states()).toHaveLength(2));
		expect(punter.states()[1]).toMatchObject({ round: 2, phase: 'betting' });
		await vi.waitFor(() => expect(punter.last('you').you.balance).toBe(START));
	});

	it('lets a player in debt go bankrupt, on the record', SLOW, async () => {
		const room = await quick('bankruptcy');
		const punter = await watch(room, 'secret-of-the-broke');
		await vi.waitFor(() => expect(punter.all('state')).toHaveLength(1));
		const { id } = punter.last('you').you;
		expect(await punter.ask({ type: 'bankrupt' })).toMatchObject({ type: 'no' });

		const car = punter.last('state').state.grid[0];
		await punter.ask({ type: 'bet', market: 'win', outcome: car, stake: 10 });
		await runInDurableObject(room, (_, { storage }) => {
			storage.sql.exec('UPDATE players SET balance = -700 WHERE id = ?', id);
		});
		// not while a bet is still riding
		expect(await punter.ask({ type: 'bankrupt' })).toMatchObject({ type: 'no' });
		await runInDurableObject(room, (_, { storage }) => {
			storage.sql.exec('UPDATE bets SET payout = 0 WHERE player = ?', id);
		});
		expect(await punter.ask({ type: 'bankrupt' })).toMatchObject({
			you: { balance: START, bankruptcies: 1 }
		});
		const written = await runInDurableObject(room, (_, { storage }) =>
			storage.sql.exec('SELECT player, kind, amount FROM adjustments').toArray()
		);
		expect(written).toEqual([{ player: id, kind: 'bankruptcy', amount: START + 700 }]);
		await vi.waitFor(() =>
			expect(punter.last('board').board[0]).toMatchObject({ id, bankruptcies: 1 })
		);
	});
});

describe('the admin', () => {
	it(
		'renames a player and resets their chips on the record, and tells their pages',
		SLOW,
		async () => {
			const room = await quick('admin players');
			const punter = await watch(room, 'secret-of-the-renamed');
			await vi.waitFor(() => expect(punter.all('you')).toHaveLength(1));
			const { id } = punter.last('you').you;
			const car = punter.last('state').state.grid[0];
			await punter.ask({ type: 'bet', market: 'win', outcome: car, stake: 300 });

			expect(await room.adminRename(id, 'x')).toMatch(/^Names are/);
			expect(await room.adminRename(id + 100, 'Nobody')).toBe('No such player');
			expect(await room.adminRename(id, ' Renamed   One ')).toBeNull();
			await vi.waitFor(() => expect(punter.last('you').you.name).toBe('Renamed One'));
			expect(punter.last('board').board[0].name).toBe('Renamed One');

			expect(await room.adminReset(id)).toBeNull();
			await vi.waitFor(() => expect(punter.last('you').you.balance).toBe(START));
			const written = await runInDurableObject(room, (_, { storage }) =>
				storage.sql.exec('SELECT player, kind, amount FROM adjustments').toArray()
			);
			expect(written).toEqual([{ player: id, kind: 'admin_reset', amount: 300 }]);

			expect((await room.adminView('renamed')).players).toEqual([
				{
					id,
					name: 'Renamed One',
					balance: START,
					bankruptcies: 0,
					banned: false,
					seen: expect.any(Number),
					bets: 1
				}
			]);
			expect((await room.adminView('somebody else')).players).toEqual([]);
			// whoever has the game open is listed apart, whatever is searched for, until they go
			expect((await room.adminView('somebody else')).live).toMatchObject([
				{ id, name: 'Renamed One' }
			]);
			// a player's secret stays in the room
			expect(JSON.stringify(await room.adminView(''))).not.toContain('secret');
			punter.socket.close(1000, 'gone');
			await vi.waitFor(async () => expect((await room.adminView('')).live).toEqual([]));
		}
	);

	it(
		'bans a player: their riding bets come back out of the pool, and they cannot bet',
		SLOW,
		async () => {
			const room = await quick('admin ban');
			const punter = await watch(room, 'secret-of-the-banned');
			const other = await watch(room, 'secret-of-the-other');
			await vi.waitFor(() => expect(punter.all('you')).toHaveLength(1));
			await vi.waitFor(() => expect(other.all('you')).toHaveLength(1));
			const { id } = punter.last('you').you;
			const { state, pools } = punter.last('state');
			const car = state.grid[0];
			const bet = (stake: number): ToRoom => ({ type: 'bet', market: 'win', outcome: car, stake });
			await punter.ask(bet(200));
			await other.ask(bet(50));

			expect(await room.adminBan(id, true)).toBeNull();
			await vi.waitFor(() =>
				expect(punter.last('you')).toMatchObject({ you: { balance: START }, bets: [] })
			);
			// everyone is told the pool without the bet, and the board without them
			await vi.waitFor(() =>
				expect(other.last('state').pools.win[car]).toBeCloseTo(pools.win[car] + 50)
			);
			expect(other.last('board').board.map((player) => player.id)).not.toContain(id);
			expect((await room.adminView('')).players.find((player) => player.id === id)).toMatchObject({
				banned: true,
				bets: 0
			});
			expect(await punter.ask(bet(10))).toEqual({ type: 'no', reason: 'This player cannot bet' });

			expect(await room.adminBan(id, false)).toBeNull();
			expect(await punter.ask(bet(10))).toMatchObject({ you: { balance: START - 10 } });
		}
	);

	it('pauses once the race under way has its result, and goes on when resumed', SLOW, async () => {
		const room = await quick('admin pause');
		const viewer = await watch(room, 'secret-of-the-patient');
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(1));
		expect(await room.adminPause(true)).toBeNull();
		const { loop } = await room.adminView('');
		expect(loop).toMatchObject({
			round: 1,
			phase: 'betting',
			paused: true,
			viewers: 1,
			players: 1
		});
		// betting began one betting phase before it ends, for the page's progress bar
		expect(loop.endsAt - loop.since).toBe(DEFAULT_SETTINGS.bettingSeconds * 1000);
		expect(loop.grid.map((car) => car.car)).toEqual(viewer.states()[0].grid);
		expect(loop.grid[0]).toMatchObject({
			condition: viewer.states()[0].conditions[0],
			speed: expect.any(Number)
		});
		expect(loop.pools.find((pool) => pool.market === 'win')).toMatchObject({ staked: 0 });
		expect(loop.pools.find((pool) => pool.market === 'win')!.total).toBeCloseTo(SEED);

		await ring(room);
		await ring(room);
		expect(await stored(room)).toMatchObject({ round: 1, phase: 'results' });
		await ring(room);
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(4));
		expect(viewer.states()[3]).toMatchObject({ round: 1, phase: 'idle' });
		expect(await runDurableObjectAlarm(room)).toBe(false);
		// someone arriving finds it waiting, with no race to see
		const late = await watch(room);
		await vi.waitFor(() => expect(late.states()).toHaveLength(1));
		expect(late.states()[0]).toMatchObject({ round: 1, phase: 'idle' });
		expect(late.recordings).toHaveLength(0);

		expect(await room.adminPause(false)).toBeNull();
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(5));
		expect(viewer.states()[4]).toMatchObject({ round: 2, phase: 'betting' });
		expect((await room.adminView('')).loop.paused).toBe(false);
	});

	it('voids the race on, hands its bets back, and moves on', SLOW, async () => {
		const room = await quick('admin void');
		const punter = await watch(room, 'secret-of-the-refunded');
		await vi.waitFor(() => expect(punter.all('you')).toHaveLength(1));
		const bet = (): ToRoom => ({
			type: 'bet',
			market: 'win',
			outcome: punter.last('state').state.grid[0],
			stake: 100
		});
		// while it is being bet on
		await punter.ask(bet());
		expect(await room.adminVoid()).toBeNull();
		await vi.waitFor(() =>
			expect(punter.states().at(-1)).toMatchObject({ round: 2, phase: 'betting' })
		);
		await vi.waitFor(() => expect(punter.last('you').you.balance).toBe(START));
		// and while it is being run
		await punter.ask(bet());
		await ring(room);
		expect(await room.adminVoid()).toBeNull();
		await vi.waitFor(() =>
			expect(punter.states().at(-1)).toMatchObject({ round: 3, phase: 'betting' })
		);
		await vi.waitFor(() => expect(punter.last('you').you.balance).toBe(START));

		const { races } = (await room.adminView('')).history;
		expect(races.map(({ round, voided, staked, paid }) => [round, voided, staked, paid])).toEqual([
			[2, true, 100, 100],
			[1, true, 100, 100]
		]);
		// the one that was run has its result; the other never had one
		expect(races[0].order).toHaveLength(DEFAULT_SETTINGS.count);
		expect(races[1].grid).toEqual([]);

		await ring(room);
		await ring(room);
		expect(await room.adminVoid()).toBe('This race is over and paid out');
	});

	it(
		'throws a caution in the race being run: the same race until then, another after',
		SLOW,
		async () => {
			const room = await quick('admin caution');
			const viewer = await watch(room);
			await vi.waitFor(() => expect(viewer.states()).toHaveLength(1));
			expect(await room.adminCaution()).toBe('No race is running');
			await ring(room);
			await vi.waitFor(() => expect(viewer.recordings).toHaveLength(1));
			// the cars are still on the grid
			expect(await room.adminCaution()).toBe('The race has not started');

			// two and a half seconds in, the lights just out: nothing has happened yet
			await runInDurableObject(room, (_, { storage }) => {
				const state = storage.kv.get<RoomState>('state')!;
				const startsAt = Date.now() - 2500;
				const endsAt = state.endsAt - state.startsAt + startsAt;
				storage.kv.put('state', { ...state, startsAt, endsAt });
			});
			expect((await room.adminView('')).loop.flag).toBe('green');
			expect(await room.adminCaution()).toBeNull();
			await vi.waitFor(() => expect(viewer.recordings).toHaveLength(2));
			const [before, after] = viewer.recordings.map(unpack);
			const thrown = after.events.find((event) => event.kind === 'caution')!;
			expect(thrown).toMatchObject({ by: 'control', car: -1 });
			// a second after it was asked for
			expect(thrown.time).toBeGreaterThan(3.4);
			expect(thrown.time).toBeLessThan(4.5);
			// The cars at each moment up to it, in both. A recording has the trucks
			// in every moment too only if one went out, which need not be so of both.
			const cars = (recording: typeof after, frames: number) => {
				const moment = recording.poses.length / recording.frames;
				return Array.from({ length: frames }, (_, frame) =>
					recording.poses.subarray(frame * moment, frame * moment + recording.grid.length * 10)
				);
			};
			const until = Math.floor(thrown.time * after.rate);
			expect(cars(after, until)).toEqual(cars(before, until));
			expect(cars(after, after.frames)).not.toEqual(cars(before, before.frames));
			// the phase lasts as long as the race now does, and late arrivals get this one
			const state = viewer.states().at(-1)!;
			expect(state.phase).toBe('racing');
			expect(state.endsAt - state.startsAt).toBeCloseTo(((after.frames - 1) / after.rate) * 1000);
			const late = await watch(room);
			await vi.waitFor(() => expect(late.recordings).toHaveLength(1));
			expect(late.recordings[0]).toEqual(viewer.recordings[1]);
			expect(await room.adminCaution()).toBe('A caution is already out');

			// and it is settled as the race everyone saw
			await ring(room);
			await vi.waitFor(() => expect(viewer.states().at(-1)!.phase).toBe('results'));
			const { races } = (await room.adminView('')).history;
			expect(races[0].order).toEqual(viewer.states().at(-1)!.result!.order);
			expect(races[0].order).toHaveLength(DEFAULT_SETTINGS.count);
			expect(await room.adminCaution()).toBe('No race is running');
		}
	);

	it('refuses settings that will not do', async () => {
		const room = env.RACE_ROOM.getByName('admin bad settings');
		const vixen = DEFAULT_SETTINGS.cars.vixen;
		for (const bad of [
			{ ...DEFAULT_SETTINGS, track: 'figure-eight' },
			{ ...DEFAULT_SETTINGS, track: 'toString' },
			{ ...DEFAULT_SETTINGS, count: 2 },
			{ ...DEFAULT_SETTINGS, count: ROSTER.length + 1 },
			{ ...DEFAULT_SETTINGS, count: 4.5 },
			{ ...DEFAULT_SETTINGS, trials: 4 },
			{ ...DEFAULT_SETTINGS, trials: 61 },
			{ ...DEFAULT_SETTINGS, start: 10.5 },
			{ ...DEFAULT_SETTINGS, bettingSeconds: '45' },
			{ ...DEFAULT_SETTINGS, debtCap: -1 },
			{ ...DEFAULT_SETTINGS, cars: { ...DEFAULT_SETTINGS.cars, vixen: { ...vixen, speed: 1.2 } } },
			{ ...DEFAULT_SETTINGS, cars: { ...DEFAULT_SETTINGS.cars, vixen: { ...vixen, grip: NaN } } },
			{ ...DEFAULT_SETTINGS, cars: { vixen } },
			null,
			'fast'
		]) {
			expect(await room.adminSaveSettings(bad)).toEqual(expect.any(String));
		}
		expect((await room.adminView('')).settings).toEqual({
			settings: DEFAULT_SETTINGS,
			tuned: false
		});
	});

	it('applies new settings from the next race, and goes back to the defaults', SLOW, async () => {
		const room = await quick('admin tuning');
		const viewer = await watch(room, 'secret-of-the-early');
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(1));
		const tuned = {
			...DEFAULT_SETTINGS,
			track: 'monza' as const,
			count: 3,
			cars: {
				...DEFAULT_SETTINGS.cars,
				vixen: { speed: 0.1, grip: 0.2, aggression: 0.3, reliability: 0.4, crew: 0.5 }
			},
			seed: 600,
			start: 400,
			debtCap: 50,
			bettingSeconds: 20,
			trials: 5
		};
		expect(await room.adminSaveSettings(tuned)).toBeNull();
		expect((await room.adminView('')).settings).toEqual({ settings: tuned, tuned: true });

		// the race on keeps its rules: somebody new now gets the old stake
		const during = await watch(room, 'secret-of-the-meanwhile');
		await vi.waitFor(() => expect(during.all('you')).toHaveLength(1));
		expect(during.last('you').you.balance).toBe(START);
		expect(viewer.states()[0].settings).toEqual({ ...DEFAULT_SETTINGS, trials: 5 });

		await ring(room);
		await ring(room);
		const before = Date.now();
		await ring(room);
		await vi.waitFor(() => expect(viewer.states()).toHaveLength(4));
		const next = viewer.states()[3];
		// pages are sent the tuned track, stats and money rules with the race
		expect(next).toMatchObject({ round: 2, phase: 'betting', settings: tuned });
		// three cars, and the markets are theirs: three to win, six pairs for the first two
		expect(next.grid).toHaveLength(3);
		expect(next.conditions).toHaveLength(3);
		const { pools } = viewer.last('state');
		expect(Object.keys(pools.win).sort()).toEqual([...next.grid].sort());
		expect(Object.keys(pools.exacta)).toHaveLength(6);
		expect(next.endsAt).toBeGreaterThanOrEqual(before + 20_000);
		expect(next.endsAt).toBeLessThanOrEqual(Date.now() + 20_000);
		for (const pool of Object.values(viewer.last('state').pools)) {
			expect(Object.values(pool).reduce((sum, chips) => sum + chips, 0)).toBeCloseTo(600);
		}
		// whichever three were drawn, each has the stats tuned for it
		for (const car of (await room.adminView('')).loop.grid) {
			expect(car).toMatchObject((tuned.cars as Record<string, object>)[car.car]);
		}

		const late = await watch(room, 'secret-of-the-newcomer');
		await vi.waitFor(() => expect(late.all('you')).toHaveLength(1));
		expect(late.last('you').you.balance).toBe(400);
		const stake = (chips: number): ToRoom => ({
			type: 'bet',
			market: 'win',
			outcome: next.grid[0],
			stake: chips
		});
		expect(await late.ask(stake(451))).toEqual({
			type: 'no',
			reason: 'Your credit runs out at -50'
		});
		expect(await late.ask(stake(450))).toMatchObject({ you: { balance: -50 } });

		expect(await room.adminResetSettings()).toBeNull();
		expect((await room.adminView('')).settings).toEqual({
			settings: DEFAULT_SETTINGS,
			tuned: false
		});
		// until the next race opens, this one's stand
		expect((await stored(room))!.settings).toEqual(tuned);
	});

	it(
		'keeps the books: stakes less payouts is the house net, and every race run has one winner',
		SLOW,
		async () => {
			const room = await quick('admin books');
			const punter = await watch(room, 'secret-of-the-bookish');
			await vi.waitFor(() => expect(punter.all('you')).toHaveLength(1));
			const { id } = punter.last('you').you;
			const { grid } = punter.last('state').state;
			for (const car of grid) {
				await punter.ask({ type: 'bet', market: 'win', outcome: car, stake: 10 });
			}
			await punter.ask({ type: 'bet', market: 'clean', outcome: 'yes', stake: 20 });
			await ring(room);
			// a race being shown is kept off the page until it has been
			expect((await room.adminView('')).history).toMatchObject({ races: [], cars: [] });
			await ring(room);
			await vi.waitFor(() => expect(punter.states().at(-1)!.phase).toBe('results'));
			const first = punter.states().at(-1)!.result!;
			await vi.waitFor(() =>
				expect(punter.last('you').bets.every((bet) => bet.payout !== null)).toBe(true)
			);
			const won = punter.last('you').bets.reduce((sum, bet) => sum + bet.payout!, 0);
			expect(await room.adminReset(id)).toBeNull();
			const reset = START - (START - 80 + won);
			// round 2 is called off with a bet on it, round 3 runs with none
			await ring(room);
			await vi.waitFor(() => expect(punter.states().at(-1)!.round).toBe(2));
			// on a car that is in round 2's field, which need not have any of round 1's in it
			const again = punter.states().at(-1)!.grid[0];
			await punter.ask({ type: 'bet', market: 'win', outcome: again, stake: 30 });
			expect(await room.adminVoid()).toBeNull();
			await ring(room);
			await ring(room);
			expect(await stored(room)).toMatchObject({ round: 3, phase: 'results' });

			const { races, totals, cars } = (await room.adminView('')).history;
			expect(races.map((race) => [race.round, race.voided, race.staked, race.paid])).toEqual([
				[3, false, 0, 0],
				[2, true, 30, 30],
				[1, false, 80, won]
			]);
			expect(races[2]).toMatchObject({
				order: first.order,
				firstOut: first.firstOut,
				fastest: first.fastest,
				net: 80 - won
			});
			expect(races[2].grid.map((car) => car.car)).toEqual(grid);
			expect(totals).toEqual({
				run: 2,
				staked: 110,
				paid: 30 + won,
				net: 80 - won,
				bankruptcies: 0,
				resets: reset
			});
			expect(races.reduce((sum, race) => sum + race.net, 0)).toBe(totals.net);
			// each race draws its field from the roster, so between them they may have run any of it
			expect(cars.length).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.count);
			expect(cars.length).toBeLessThanOrEqual(ROSTER.length);
			const sum = (key: 'wins' | 'podiums' | 'starts') =>
				cars.reduce((total, car) => total + car[key], 0);
			expect(sum('wins')).toBe(totals.run);
			expect(sum('podiums')).toBe(3 * totals.run);
			expect(sum('starts')).toBe(DEFAULT_SETTINGS.count * totals.run);
			for (const car of cars) {
				expect(car.winRate).toBeCloseTo(car.wins / car.starts);
				expect(car.fair).toBeCloseTo(1 / DEFAULT_SETTINGS.count);
				expect(car.averagePlace).toBeGreaterThanOrEqual(1);
			}
			expect(cars.find((car) => car.car === first.order[0])!.wins).toBeGreaterThanOrEqual(1);
		}
	);
});
