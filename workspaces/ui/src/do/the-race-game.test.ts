import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('TheRaceGame', () => {
	it('accepts WebSocket connections and returns 101', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const response = await stub.fetch('http://do/connect', {
			headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
		});
		expect(response.status).toBe(101);
	});

	it('returns 403 for non-WebSocket requests', async () => {
		const id = env.THE_RACE_GAME.newUniqueId();
		const stub = env.THE_RACE_GAME.get(id);
		const response = await stub.fetch('http://do/connect');
		expect(response.status).toBe(403);
	});
});
