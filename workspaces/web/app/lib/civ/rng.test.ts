import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
	it('repeats from the same seed', () => {
		const a = new Rng(42);
		const b = new Rng(42);
		for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
	});

	it('picks up where a saved state left off', () => {
		const a = new Rng(7);
		a.next();
		const b = new Rng(a.state());
		for (let i = 0; i < 20; i++) expect(b.next()).toBe(a.next());
	});

	it('stays in range', () => {
		const rng = new Rng(1);
		for (let i = 0; i < 1000; i++) {
			const n = rng.int(3, 5);
			expect(n).toBeGreaterThanOrEqual(3);
			expect(n).toBeLessThanOrEqual(5);
		}
	});
});
