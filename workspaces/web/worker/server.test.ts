import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('server routing', () => {
	it('returns non-501 for regular page routes (delegates to TanStack Start)', async () => {
		const response = await SELF.fetch('https://rafe.dev/');
		expect(response.status).not.toBe(501);
	});
});
