import { describe, it, expect } from 'vitest';
import { resolveChallenge, buildStartingGrid, computeScores } from './rules';
import type { Car } from './types';

// A car carrying only the fields computeScores reads (id + position); the rest are
// filled to satisfy the Car shape.
function makeCar(id: number, position: number): Car {
	return {
		id,
		position,
		hand: [],
		deck: [],
		discard: [],
		overtakes: 0,
		defensesHeld: 0,
		gridPosition: position
	};
}

// ─── resolveChallenge ────────────────────────────────────────────────────────

describe('resolveChallenge', () => {
	it('challenger wins when their card is higher', () => {
		const result = resolveChallenge(
			{ id: 'gears:8', kind: 'regular', value: 8, suit: 'gears' },
			{ id: 'gears:5', kind: 'regular', value: 5, suit: 'gears' }
		);
		expect(result).toBe('challenger');
	});

	it('defender wins when their card is higher', () => {
		const result = resolveChallenge(
			{ id: 'gears:4', kind: 'regular', value: 4, suit: 'gears' },
			{ id: 'gears:9', kind: 'regular', value: 9, suit: 'gears' }
		);
		expect(result).toBe('defender');
	});

	it('ties when both cards are equal', () => {
		const result = resolveChallenge(
			{ id: 'gears:6', kind: 'regular', value: 6, suit: 'gears' },
			{ id: 'gears:6', kind: 'regular', value: 6, suit: 'gears' }
		);
		expect(result).toBe('tie');
	});

	it('applies challenger modifier (Redline bonus)', () => {
		// challenger plays 5 + Redline (5+2=7) vs defender 6 → challenger wins
		const result = resolveChallenge(
			{ id: 'gears:5', kind: 'regular', value: 5, suit: 'gears' },
			{ id: 'gears:6', kind: 'regular', value: 6, suit: 'gears' },
			2
		);
		expect(result).toBe('challenger');
	});

	it('applies defender modifier (Redline bonus)', () => {
		// challenger 8 vs defender 7 + Redline (7+2=9) → defender wins
		const result = resolveChallenge(
			{ id: 'gears:8', kind: 'regular', value: 8, suit: 'gears' },
			{ id: 'gears:7', kind: 'regular', value: 7, suit: 'gears' },
			0,
			2
		);
		expect(result).toBe('defender');
	});
});

// ─── buildStartingGrid ───────────────────────────────────────────────────────

describe('buildStartingGrid', () => {
	it('returns consecutive positions 0..N-1 for N cars', () => {
		expect(buildStartingGrid(6)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('works for 1 car', () => {
		expect(buildStartingGrid(1)).toEqual([0]);
	});
});

// ─── computeScores ───────────────────────────────────────────────────────────

describe('computeScores', () => {
	it('awards 9/6/4/3/2/1 points for positions 1–6', () => {
		const cars = [
			makeCar(0, 5), // 1st place (highest position)
			makeCar(1, 4),
			makeCar(2, 3),
			makeCar(3, 2),
			makeCar(4, 1),
			makeCar(5, 0) // 6th place (lowest position)
		];
		const scores = computeScores(cars);
		expect(scores.find((s) => s.carId === 0)?.points).toBe(9);
		expect(scores.find((s) => s.carId === 1)?.points).toBe(6);
		expect(scores.find((s) => s.carId === 2)?.points).toBe(4);
		expect(scores.find((s) => s.carId === 3)?.points).toBe(3);
		expect(scores.find((s) => s.carId === 4)?.points).toBe(2);
		expect(scores.find((s) => s.carId === 5)?.points).toBe(1);
	});

	it('scores car in 1st as rank 1', () => {
		const cars = [makeCar(0, 10), makeCar(1, 5)];
		const scores = computeScores(cars);
		expect(scores.find((s) => s.carId === 0)?.rank).toBe(1);
		expect(scores.find((s) => s.carId === 1)?.rank).toBe(2);
	});
});
