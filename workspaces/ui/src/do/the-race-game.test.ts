import { env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import type { TheRaceGame } from './the-race-game';

interface DOState {
	players: Array<{ id: string; name: string; isHost: boolean }>;
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
});
