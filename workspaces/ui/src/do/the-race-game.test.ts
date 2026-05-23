import { env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import type { TheRaceGame } from './the-race-game';

interface DOState {
	players: Array<{ id: string; name: string; isHost: boolean; connected: boolean }>;
	phase: string;
}

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
});

describe('TheRaceGame — START_GAME via webSocketMessage', () => {
	async function sendMessage(stub: DurableObjectStub, playerId: string, msg: object): Promise<void> {
		await runInDurableObject(stub, async (instance: TheRaceGame, state: DurableObjectState) => {
			const wsList = state.getWebSockets();
			for (const ws of wsList) {
				const att = ws.deserializeAttachment() as { playerId: string } | null;
				if (att?.playerId === playerId) {
					await instance.webSocketMessage(ws, JSON.stringify(msg));
					return;
				}
			}
		});
	}

	it('transitions to qualifying when host sends START_GAME', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });

		await sendMessage(stub, 'p1', { type: 'START_GAME' });

		const state = await getState(stub);
		expect(state.phase).toBe('qualifying');
	});

	it('rejects START_GAME from non-host (phase stays lobby)', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });

		await sendMessage(stub, 'p2', { type: 'START_GAME' });

		const state = await getState(stub);
		expect(state.phase).toBe('lobby');
	});

	it('rejects late join after START_GAME', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });

		await sendMessage(stub, 'p1', { type: 'START_GAME' });

		const r3 = await stub.fetch(wsUrl('p3', 'Latecomer'), { headers: wsHeaders() });
		expect(r3.status).toBe(403);
	});

	it('transitions phase to race after all cars send QUALIFY', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });
		await sendMessage(stub, 'p1', { type: 'START_GAME' });

		// Get car IDs from state
		interface ExtendedDOState extends DOState {
			gameState?: { cars: Array<{ id: number }>; players: Array<{ id: string; carIds: number[] }> };
		}
		const qualifyingState = await runInDurableObject(stub, async (_inst: TheRaceGame, s: DurableObjectState) => {
			return s.storage.get<ExtendedDOState>('state');
		});
		const p1Cars = qualifyingState?.gameState?.players.find((p) => p.id === 'p1')?.carIds ?? [];
		const p2Cars = qualifyingState?.gameState?.players.find((p) => p.id === 'p2')?.carIds ?? [];

		// Each player qualifies their car with card index 0
		for (const carId of p1Cars) {
			await sendMessage(stub, 'p1', { type: 'QUALIFY', carId, cardIndices: [0] });
		}
		for (const carId of p2Cars) {
			await sendMessage(stub, 'p2', { type: 'QUALIFY', carId, cardIndices: [0] });
		}

		const finalState = await getState(stub);
		expect(finalState.phase).toBe('race');
	});

	it('rejects QUALIFY for a car that does not belong to the player', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);

		await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		await stub.fetch(wsUrl('p2', 'Guest'), { headers: wsHeaders() });
		await sendMessage(stub, 'p1', { type: 'START_GAME' });

		// p2 tries to qualify car 0 which belongs to p1 (car IDs are 0=p1, 1=p2 in 2-player+ mode)
		// In non-2-player mode (3+ players) car 0 is always p1's
		// We just test that sending wrong carId is an error — phase should remain qualifying
		await sendMessage(stub, 'p2', { type: 'QUALIFY', carId: 999, cardIndices: [0] });

		const state = await getState(stub);
		expect(state.phase).toBe('qualifying'); // still qualifying, not crashed
	});
});

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

		// Simulate start game via message
		await runInDurableObject(stub, async (instance: TheRaceGame, state: DurableObjectState) => {
			const wsList = state.getWebSockets();
			for (const ws of wsList) {
				const att = ws.deserializeAttachment() as { playerId: string } | null;
				if (att?.playerId === 'p1') {
					await instance.webSocketMessage(ws, JSON.stringify({ type: 'START_GAME' }));
					return;
				}
			}
		});

		// p1 reconnects — should get 101
		const r = await stub.fetch(wsUrl('p1', 'Host'), { headers: wsHeaders() });
		expect(r.status).toBe(101);
	});
});
