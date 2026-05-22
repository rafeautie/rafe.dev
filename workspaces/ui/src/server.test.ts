import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('server routing', () => {
	it('routes WebSocket upgrades at /ws/games/the-race/:gameId to the DO (returns 101)', async () => {
		const response = await SELF.fetch('https://rafe.dev/ws/games/the-race/TEST', {
			headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
		});
		expect(response.status).toBe(101);
	});

	it('returns non-501 for regular page routes (delegates to TanStack Start)', async () => {
		const response = await SELF.fetch('https://rafe.dev/');
		expect(response.status).not.toBe(501);
	});
});
