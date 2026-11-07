import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createNoise2D, fbm, ridged } from './noise';

describe('noise', () => {
	it('repeats from the same seed and differs between seeds', () => {
		const a = createNoise2D(new Rng(1));
		const b = createNoise2D(new Rng(1));
		const c = createNoise2D(new Rng(2));
		let differs = 0;
		for (let i = 0; i < 50; i++) {
			expect(a(i * 0.37, i * 0.11)).toBe(b(i * 0.37, i * 0.11));
			if (a(i * 0.37, i * 0.11) !== c(i * 0.37, i * 0.11)) differs++;
		}
		expect(differs).toBeGreaterThan(40);
	});

	it('stays in range and varies smoothly', () => {
		const noise = createNoise2D(new Rng(3));
		let min = Infinity;
		let max = -Infinity;
		for (let x = 0; x < 100; x++) {
			for (let y = 0; y < 100; y++) {
				const v = noise(x * 0.13, y * 0.13);
				min = Math.min(min, v);
				max = Math.max(max, v);
				expect(Math.abs(v - noise(x * 0.13 + 0.01, y * 0.13))).toBeLessThan(0.1);
			}
		}
		expect(min).toBeGreaterThan(-1.1);
		expect(max).toBeLessThan(1.1);
		expect(max - min).toBeGreaterThan(1);
	});

	it('keeps fractal and ridged noise in range', () => {
		const noise = createNoise2D(new Rng(4));
		for (let i = 0; i < 500; i++) {
			const f = fbm(noise, i * 0.071, i * 0.043, 5);
			expect(Math.abs(f)).toBeLessThan(1.1);
			const r = ridged(noise, i * 0.071, i * 0.043, 4);
			expect(r).toBeGreaterThanOrEqual(0);
			expect(r).toBeLessThanOrEqual(1);
		}
	});
});
