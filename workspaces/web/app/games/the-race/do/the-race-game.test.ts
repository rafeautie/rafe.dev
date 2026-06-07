import { env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import type { TheRaceGame } from './the-race-game';

// ─── State types ─────────────────────────────────────────────────────────────

interface DOState {
	players: Array<{ id: string; name: string; isHost: boolean; connected: boolean }>;
	phase: string;
}

interface FullDOState {
	players: Array<{ id: string; name: string; isHost: boolean; connected: boolean }>;
	phase: string;
	carLiveries?: Record<number, number>;
	gameState?: {
		cars: Array<{
			id: number;
			position: number;
			hand: Array<{ id: string; kind: string; value?: number }>;
			deck: unknown[];
		}>;
		players: Array<{ id: string; carIds: number[] }>;
		pendingThisRound: number[];
		season?: { totalRaces: number; races: Array<{ results: unknown[] }> };
		pendingChallenge?: {
			challengerCarId: number;
			defenderCarId: number;
			challengerCards?: unknown[];
			defenderCards?: unknown[];
		};
	};
	// The persisted event log (RaceEvents). Challenge resolution lands here as a
	// challengeResolved event (ADR 0003) — it is no longer mirrored into gameState.
	log: Array<{
		type: string;
		carId?: number;
		challengerCarId?: number;
		defenderCarId?: number;
		outcome?: string;
	}>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wsHeaders() {
	return { Upgrade: 'websocket', Connection: 'Upgrade' };
}

function wsUrl(playerId: string, playerName: string) {
	return `http://do/?playerId=${encodeURIComponent(playerId)}&playerName=${encodeURIComponent(playerName)}`;
}

async function getState(stub: DurableObjectStub): Promise<DOState> {
	return runInDurableObject(stub, async (_instance: TheRaceGame, state) => {
		return (await state.storage.get<DOState>('state')) ?? { players: [], phase: 'lobby' };
	});
}

async function getFullState(stub: DurableObjectStub): Promise<FullDOState> {
	return runInDurableObject(stub, async (_instance: TheRaceGame, state) => {
		return (
			(await state.storage.get<FullDOState>('state')) ?? { players: [], phase: 'lobby', log: [] }
		);
	});
}

async function sendMessage(stub: DurableObjectStub, playerId: string, msg: object): Promise<void> {
	await runInDurableObject(stub, async (instance: TheRaceGame) => {
		// Inject the message via a fake WS so we're not dependent on the WS pool surviving GC
		const fakeWs = {
			deserializeAttachment: () => ({ playerId, playerName: 'test' }),
			send: () => {},
			close: () => {},
			serializeAttachment: () => {},
			accept: () => {}
		} as unknown as WebSocket;
		await instance.webSocketMessage(fakeWs, JSON.stringify(msg));
	});
}

async function setup2P(stub: DurableObjectStub) {
	await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
	await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });
	await sendMessage(stub, 'p1', { type: 'START_SEASON' });

	const s = await getFullState(stub);
	const p1Cars = s.gameState?.players.find((p) => p.id === 'p1')?.carIds ?? [];
	const p2Cars = s.gameState?.players.find((p) => p.id === 'p2')?.carIds ?? [];

	const firstCardId = (carId: number) => s.gameState!.cars.find((c) => c.id === carId)!.hand[0]!.id;
	for (const carId of p1Cars)
		await sendMessage(stub, 'p1', { type: 'QUALIFY', carId, cardIds: [firstCardId(carId)] });
	for (const carId of p2Cars)
		await sendMessage(stub, 'p2', { type: 'QUALIFY', carId, cardIds: [firstCardId(carId)] });

	return { p1Cars, p2Cars };
}

function ownerOf(carId: number, p1Cars: number[], _p2Cars: number[]): string {
	return p1Cars.includes(carId) ? 'p1' : 'p2';
}

// Put `carId` on the clock: front of the round queue with no pending challenge.
// At race start last place acts first and the front car is forced into a
// challenge, so a solo discard/extend is only reachable once a gap-having car
// (e.g. the leader) actually comes up — this injects that turn directly so the
// transport tests can exercise a legal solo move without playing a full round.
async function forceSoloTurn(stub: DurableObjectStub, carId: number): Promise<void> {
	await runInDurableObject(stub, async (_i: TheRaceGame, s: DurableObjectState) => {
		const stored = (await s.storage.get('state')) as {
			gameState: { pendingThisRound: number[]; pendingChallenge?: unknown };
		};
		const rest = stored.gameState.pendingThisRound.filter((id) => id !== carId);
		stored.gameState.pendingThisRound = [carId, ...rest];
		stored.gameState.pendingChallenge = undefined;
		await s.storage.put('state', stored);
	});
}

// ─── Basic WS ────────────────────────────────────────────────────────────────

describe('TheRaceGame — basic WS', () => {
	it('accepts WebSocket connections and returns 101', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const r = await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });
		expect(r.status).toBe(101);
	});

	it('returns 403 for non-WebSocket requests', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const r = await stub.fetch('http://do/');
		expect(r.status).toBe(403);
	});

	it('returns 400 when playerId is missing', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const r = await stub.fetch('http://do/?playerName=Alice', { headers: wsHeaders() });
		expect(r.status).toBe(400);
	});

	it('returns 400 when playerName is missing', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const r = await stub.fetch('http://do/?playerId=p1', { headers: wsHeaders() });
		expect(r.status).toBe(400);
	});
});

// ─── Lobby ───────────────────────────────────────────────────────────────────

describe('TheRaceGame — lobby state', () => {
	it('adds player to state after join', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });

		const state = await getState(stub);
		expect(state.players).toHaveLength(1);
		expect(state.players[0].name).toBe('Alice');
	});

	it('first player to join becomes host', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });

		const state = await getState(stub);
		expect(state.players[0].isHost).toBe(true);
	});

	it('second player is not host', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });

		const state = await getState(stub);
		const guest = state.players.find((p) => p.id === 'p2');
		expect(guest?.isHost).toBe(false);
	});

	it('reconnecting player (same playerId) does not duplicate', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() }); // reconnect

		const state = await getState(stub);
		expect(state.players).toHaveLength(1);
	});

	it('rejects 7th player with 403', async () => {
		const id = env.THE_RACE_GAME.idFromName('FULL');
		const stub = env.THE_RACE_GAME.get(id);

		for (let i = 1; i <= 6; i++) {
			const r = await stub.fetch(wsUrl(`p${i}`, `Player${i}`), { headers: wsHeaders() });
			expect(r.status).toBe(101);
		}

		const r7 = await stub.fetch(wsUrl('p7', 'Player7'), { headers: wsHeaders() });
		expect(r7.status).toBe(403);
	});

	it('reconnecting player refreshes their name', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p1', 'Alicia'), { headers: wsHeaders() }); // reconnect, renamed

		const state = await getState(stub);
		expect(state.players).toHaveLength(1);
		expect(state.players[0].name).toBe('Alicia');
	});
});

// ─── SET_NAME ──────────────────────────────────────────────────────────────────

describe('TheRaceGame — SET_NAME', () => {
	it('renames the sender in the lobby', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });
		await sendMessage(stub, 'p1', { type: 'SET_NAME', name: 'Bob' });

		const state = await getState(stub);
		expect(state.players.find((p) => p.id === 'p1')?.name).toBe('Bob');
	});

	it('trims and clamps the name to 20 chars', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });
		await sendMessage(stub, 'p1', { type: 'SET_NAME', name: '  ' + 'x'.repeat(30) + '  ' });

		const state = await getState(stub);
		expect(state.players.find((p) => p.id === 'p1')?.name).toBe('x'.repeat(20));
	});

	it('rejects an empty name (keeps the existing one)', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });
		await sendMessage(stub, 'p1', { type: 'SET_NAME', name: '   ' });

		const state = await getState(stub);
		expect(state.players.find((p) => p.id === 'p1')?.name).toBe('Alice');
	});

	it('ignores SET_NAME once the season has started', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await setup2P(stub); // drives through START_SEASON into the race
		await sendMessage(stub, 'p1', { type: 'SET_NAME', name: 'Renamed' });

		const state = await getState(stub);
		expect(state.players.find((p) => p.id === 'p1')?.name).toBe('Host');
	});
});

// ─── START_SEASON / QUALIFY ────────────────────────────────────────────────────

describe('TheRaceGame — START_SEASON via webSocketMessage', () => {
	it('transitions to qualifying when host sends START_SEASON', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });

		await sendMessage(stub, 'p1', { type: 'START_SEASON' });

		const state = await getState(stub);
		expect(state.phase).toBe('qualifying');
	});

	it('rejects START_SEASON from non-host (phase stays lobby)', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });

		await sendMessage(stub, 'p2', { type: 'START_SEASON' });

		const state = await getState(stub);
		expect(state.phase).toBe('lobby');
	});

	it('rejects late join after game started', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		// setup2P drives the game through START_SEASON + QUALIFY → race phase
		await setup2P(stub);

		const r3 = await stub.fetch(wsUrl('p3', 'Latecomer'), { headers: wsHeaders() });
		expect(r3.status).toBe(403);
	});

	it('transitions phase to race after all cars send QUALIFY', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		await setup2P(stub);

		const finalState = await getState(stub);
		expect(finalState.phase).toBe('race');
	});

	it('rejects QUALIFY for a car that does not belong to the player', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });
		await sendMessage(stub, 'p1', { type: 'START_SEASON' });

		await sendMessage(stub, 'p2', { type: 'QUALIFY', carId: 999, cardIds: [] });

		const state = await getState(stub);
		expect(state.phase).toBe('qualifying');
	});
});

// ─── Race phase ───────────────────────────────────────────────────────────────

describe('TheRaceGame — race phase', () => {
	it('car can discard a card (hand shrinks by 1)', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const { p1Cars, p2Cars } = await setup2P(stub);

		// Only a car with a free space directly ahead may discard. At race start the
		// grid is consecutive, so the leader (highest position) is the one car that
		// can take a solo turn — every other car must challenge the car ahead.
		const before = await getFullState(stub);
		const leader = before.gameState!.cars.reduce((a, b) => (a.position > b.position ? a : b));
		const handSizeBefore = leader.hand.length;

		await forceSoloTurn(stub, leader.id);
		await sendMessage(stub, ownerOf(leader.id, p1Cars, p2Cars), {
			type: 'DISCARD',
			carId: leader.id,
			cardId: leader.hand[0]!.id
		});

		const after = await getFullState(stub);
		const handSizeAfter = after.gameState!.cars.find((c) => c.id === leader.id)!.hand.length;
		expect(handSizeAfter).toBe(handSizeBefore - 1);
	});

	it('leader can extend into the empty gap ahead (position + 1)', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const { p1Cars, p2Cars } = await setup2P(stub);

		// In 2P mode: 4 cars at positions 0–3. Leader (pos 3) always has pos 4 free.
		const state = await getFullState(stub);
		const leader = state.gameState!.cars.reduce((a, b) => (a.position > b.position ? a : b));

		// Give the leader a known value-1 extend card so the test doesn't depend on the
		// random deal containing one. Values 1–2 are regular extend cards; the leader
		// restriction applies only to the value-3 Drafting card.
		const extendCard = { id: 'test:extend-1', kind: 'regular', value: 1, suit: 'gears' };
		await runInDurableObject(stub, async (_i: TheRaceGame, s: DurableObjectState) => {
			const stored = (await s.storage.get('state')) as {
				gameState: { cars: Array<{ id: number; hand: unknown[] }> };
			};
			const car = stored.gameState.cars.find((c) => c.id === leader.id)!;
			car.hand = [extendCard, ...car.hand];
			await s.storage.put('state', stored);
		});

		await forceSoloTurn(stub, leader.id);
		await sendMessage(stub, ownerOf(leader.id, p1Cars, p2Cars), {
			type: 'EXTEND',
			carId: leader.id,
			cardId: extendCard.id
		});

		const after = await getFullState(stub);
		const newPos = after.gameState!.cars.find((c) => c.id === leader.id)!.position;
		expect(newPos).toBe(leader.position + 1);
	});

	it('COMMIT_CHALLENGE_CARDS resolves: appends a challengeResolved event to the log', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const { p1Cars, p2Cars } = await setup2P(stub);

		// After race start, engine auto-declares the first challenge
		const state = await getFullState(stub);
		const { challengerCarId, defenderCarId } = state.gameState!.pendingChallenge!;

		await sendMessage(stub, ownerOf(challengerCarId, p1Cars, p2Cars), {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: challengerCarId,
			cardIds: [state.gameState!.cars.find((c) => c.id === challengerCarId)!.hand[0]!.id]
		});
		await sendMessage(stub, ownerOf(defenderCarId, p1Cars, p2Cars), {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: defenderCarId,
			cardIds: [state.gameState!.cars.find((c) => c.id === defenderCarId)!.hand[0]!.id]
		});

		// The engine emits the resolution as an event (ADR 0003); the DO appends it to
		// the persisted log and broadcasts it. It is not mirrored back into gameState.
		const after = await getFullState(stub);
		const resolved = after.log.find((e) => e.type === 'challengeResolved');
		expect(resolved).toBeDefined();
		expect(resolved!.challengerCarId).toBe(challengerCarId);
		expect(resolved!.defenderCarId).toBe(defenderCarId);
		expect(after.phase).toBe('race');
	});

	it('appends each action event to the persisted log without dropping history', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const { p1Cars, p2Cars } = await setup2P(stub);

		const state = await getFullState(stub);
		const { challengerCarId, defenderCarId } = state.gameState!.pendingChallenge!;

		await sendMessage(stub, ownerOf(challengerCarId, p1Cars, p2Cars), {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: challengerCarId,
			cardIds: [state.gameState!.cars.find((c) => c.id === challengerCarId)!.hand[0]!.id]
		});
		await sendMessage(stub, ownerOf(defenderCarId, p1Cars, p2Cars), {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: defenderCarId,
			cardIds: [state.gameState!.cars.find((c) => c.id === defenderCarId)!.hand[0]!.id]
		});

		const afterResolve = await getFullState(stub);
		expect(afterResolve.log.some((e) => e.type === 'challengeResolved')).toBe(true);

		// A subsequent discard appends its own event; earlier history stays in the log.
		// Discard with the leader, the one car guaranteed a free space ahead (other
		// cars must challenge the car directly ahead and so cannot discard).
		const leader = afterResolve.gameState!.cars.reduce((a, b) => (a.position > b.position ? a : b));
		await forceSoloTurn(stub, leader.id);
		await sendMessage(stub, ownerOf(leader.id, p1Cars, p2Cars), {
			type: 'DISCARD',
			carId: leader.id,
			cardId: leader.hand[0]!.id
		});

		const final = await getFullState(stub);
		expect(final.log.some((e) => e.type === 'discarded')).toBe(true);
		expect(final.log.some((e) => e.type === 'challengeResolved')).toBe(true);
	});

	it('NEW_SEASON resets to lobby and clears the season and liveries', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		await setup2P(stub);

		// Inject a finished-Race state directly so we don't play a full game.
		const raceState = await getFullState(stub);
		await runInDurableObject(stub, async (_inst: TheRaceGame, s: DurableObjectState) => {
			await s.storage.put('state', {
				...raceState,
				phase: 'results',
				carLiveries: { 0: 0, 1: 1, 2: 2, 3: 3 },
				gameState: { ...raceState.gameState, phase: 'results' }
			});
		});

		await sendMessage(stub, 'p1', { type: 'NEW_SEASON' });

		const after = await getFullState(stub);
		expect(after.phase).toBe('lobby');
		expect(after.carLiveries).toEqual({});
		expect(after.log).toHaveLength(0);
		expect(after.gameState?.season?.races).toHaveLength(0);
	});
});

// ─── Season loop (ADVANCE_RACE / NEW_SEASON) ──────────────────────────────────

describe('TheRaceGame — Season loop', () => {
	const oneRace = {
		results: [
			{ carId: 0, rank: 1, points: 9, gridPosition: 3, overtakes: 0, defensesHeld: 0 },
			{ carId: 1, rank: 2, points: 6, gridPosition: 2, overtakes: 0, defensesHeld: 0 },
			{ carId: 2, rank: 3, points: 4, gridPosition: 1, overtakes: 0, defensesHeld: 0 },
			{ carId: 3, rank: 4, points: 3, gridPosition: 0, overtakes: 0, defensesHeld: 0 }
		]
	};

	// Force a finished-Race state with a fixed livery map and a given Season history.
	async function seedResults(stub: DurableObjectStub, races: object[]) {
		const base = await getFullState(stub);
		await runInDurableObject(stub, async (_i: TheRaceGame, s: DurableObjectState) => {
			await s.storage.put('state', {
				...base,
				phase: 'results',
				carLiveries: { 0: 0, 1: 1, 2: 2, 3: 3 },
				gameState: { ...base.gameState, phase: 'results', season: { totalRaces: 7, races } }
			});
		});
	}

	it('ADVANCE_RACE deals the next Race, carrying the Season and keeping liveries', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		await setup2P(stub);
		await seedResults(stub, [oneRace]);

		await sendMessage(stub, 'p1', { type: 'ADVANCE_RACE' });

		const after = await getFullState(stub);
		expect(after.phase).toBe('qualifying');
		expect(after.carLiveries).toEqual({ 0: 0, 1: 1, 2: 2, 3: 3 }); // fixed for the Season
		expect(after.gameState?.season?.races).toHaveLength(1); // prior Race carried forward
	});

	it('ADVANCE_RACE from a non-host is rejected', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		await setup2P(stub);
		await seedResults(stub, [oneRace]);

		await sendMessage(stub, 'p2', { type: 'ADVANCE_RACE' });
		expect((await getFullState(stub)).phase).toBe('results');
	});

	it('ADVANCE_RACE is rejected once the Season is complete', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		await setup2P(stub);
		await seedResults(
			stub,
			Array.from({ length: 7 }, () => oneRace)
		);

		await sendMessage(stub, 'p1', { type: 'ADVANCE_RACE' });
		expect((await getFullState(stub)).phase).toBe('results');
	});
});

// ─── Reconnection ─────────────────────────────────────────────────────────────

describe('TheRaceGame — reconnection (issue #14)', () => {
	it('player connected=true after joining', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });

		const state = await getState(stub);
		expect(state.players[0]?.connected).toBe(true);
	});

	it('reconnecting player with same id does not duplicate, stays connected', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p1', 'Alice'), { headers: wsHeaders() }); // reconnect

		const state = await getState(stub);
		expect(state.players).toHaveLength(1);
		expect(state.players[0]?.connected).toBe(true);
	});

	it('existing player can reconnect after game started', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });

		await runInDurableObject(stub, async (instance: TheRaceGame, state: DurableObjectState) => {
			const wsList = state.getWebSockets();
			for (const ws of wsList) {
				const att = ws.deserializeAttachment() as { playerId: string } | null;
				if (att?.playerId === 'p1') {
					await instance.webSocketMessage(ws, JSON.stringify({ type: 'START_SEASON' }));
					return;
				}
			}
		});

		const r = await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		expect(r.status).toBe(101);
	});
});
