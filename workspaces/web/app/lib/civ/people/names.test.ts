import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { personName, placeName, uniqueName, villageName } from './names';

describe('names', () => {
	it('repeat from the same seed and look like names', () => {
		const a = new Rng(5);
		const b = new Rng(5);
		for (let i = 0; i < 20; i++) {
			const name = personName(a);
			expect(name).toBe(personName(b));
			expect(name).toMatch(/^[A-Z][a-z]+$/);
		}
	});

	it('are not repeated within a band', () => {
		const rng = new Rng(9);
		const taken = new Set<string>();
		for (let i = 0; i < 60; i++) {
			const name = uniqueName(rng, taken);
			expect(taken.has(name)).toBe(false);
			taken.add(name);
		}
	});

	it('name villages and places', () => {
		const rng = new Rng(2);
		expect(villageName(rng).length).toBeGreaterThan(3);
		expect(placeName(rng)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
	});
});
