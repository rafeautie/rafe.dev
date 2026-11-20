import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { DEBT_CAP, pays, SEED, START, type Pools } from './betting';
import { unpack } from './recording';
import { BETTING_MS, type FromRoom, type RoomState, type ToRoom } from './room';
import { ROSTER } from './roster';

type Stub = ReturnType<typeof env.RACE_ROOM.getByName>;
type Sent<T extends FromRoom['type']> = Extract<FromRoom, { type: T }>;

// opening a race runs it thirty times over to seed the pools
const SLOW = { timeout: 60_000 };

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
		const room = env.RACE_ROOM.getByName('arriving');
		const before = Date.now();
		const first = await watch(room);
		await vi.waitFor(() => expect(first.states()).toHaveLength(1));
		const [state] = first.states();
		expect(state).toMatchObject({ round: 1, phase: 'betting', result: null });
		expect([...state.grid].sort()).toEqual(ROSTER.map((entry) => entry.id).sort());
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
			const room = env.RACE_ROOM.getByName('racing');
			const early = await watch(room);
			await ring(room);
			await vi.waitFor(() => expect(early.recordings).toHaveLength(1));
			const state = early.states()[1];
			const recording = unpack(early.recordings[0]);
			expect(state).toMatchObject({ round: 1, phase: 'racing', result: null });
			expect(recording.grid).toEqual(state.grid);
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
		const room = env.RACE_ROOM.getByName('early alarm');
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
		const room = env.RACE_ROOM.getByName('cycle');
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
			const room = env.RACE_ROOM.getByName('emptying');
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
		const room = env.RACE_ROOM.getByName('time');
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
		const room = env.RACE_ROOM.getByName('players');
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

	it('takes a bet, moves the odds, and tells everyone', SLOW, async () => {
		const room = env.RACE_ROOM.getByName('placing');
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
		const room = env.RACE_ROOM.getByName('closing');
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
		const room = env.RACE_ROOM.getByName('debt');
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
		const room = env.RACE_ROOM.getByName('paying');
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
		const room = env.RACE_ROOM.getByName('calling off');
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
		const room = env.RACE_ROOM.getByName('bankruptcy');
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
