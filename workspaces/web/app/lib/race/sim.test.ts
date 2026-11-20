import { describe, expect, it } from 'vitest';
import { ROSTER } from './roster';
import { createRace, drawGrid, LAPS, LIGHTS } from './sim';
import { HALF_CORRIDOR, TRACK, lateral, nearest } from './track';

function run(seed: number) {
	const race = createRace(seed, drawGrid(seed, ROSTER));
	// more steps than the longest race is allowed to last
	for (let step = 0; step < 60 * 130 && !race.done; step++) {
		race.step();
		race.events.length = 0;
	}
	return race;
}

describe('the track', () => {
	const { n, x, y } = TRACK;

	it('keeps its stretches far enough apart that each has its own walls', () => {
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				// neighbours along the lap are close by nature
				if (Math.min(j - i, n - j + i) * TRACK.step < 4 * HALF_CORRIDOR) continue;
				expect(Math.hypot(x[i] - x[j], y[i] - y[j])).toBeGreaterThan(2 * HALF_CORRIDOR);
			}
		}
	});

	it('bends gently enough that the inside wall does not fold over itself', () => {
		for (let i = 0; i < n; i++) {
			const a = (i + n - 3) % n;
			const b = (i + 3) % n;
			const cross = (x[i] - x[a]) * (y[b] - y[a]) - (y[i] - y[a]) * (x[b] - x[a]);
			const sides =
				Math.hypot(x[i] - x[a], y[i] - y[a]) *
				Math.hypot(x[b] - x[i], y[b] - y[i]) *
				Math.hypot(x[b] - x[a], y[b] - y[a]);
			expect(sides / Math.abs(2 * cross)).toBeGreaterThan(HALF_CORRIDOR);
		}
	});
});

describe('a race', () => {
	it('runs the same way from the same seed', () => {
		const [first, second] = [run(7), run(7)];
		expect(second.time).toBe(first.time);
		expect(second.order().map((car) => [car.entry.id, car.finishTime, car.progress])).toEqual(
			first.order().map((car) => [car.entry.id, car.finishTime, car.progress])
		);
	});

	it(
		'reaches a result every time over 100 seeds, and every car wins some',
		{ timeout: 120_000 },
		() => {
			const wins = new Map<string, number>();
			for (let seed = 1; seed <= 100; seed++) {
				const race = run(seed);
				expect(race.done).toBe(true);
				// ended by the cars finishing, not by the clock running out
				expect(race.time).toBeLessThan(LIGHTS + 100);
				const [winner] = race.order();
				expect(winner.finishTime).toBeGreaterThan(0);
				expect(winner.laps).toBe(LAPS);
				for (const car of race.cars) {
					// nothing blew up, and nothing got through a wall
					expect(Number.isFinite(car.x + car.y + car.angle)).toBe(true);
					const across = lateral(car.x, car.y, nearest(car.x, car.y));
					expect(Math.abs(across)).toBeLessThan(HALF_CORRIDOR + 0.5);
				}
				wins.set(winner.entry.id, (wins.get(winner.entry.id) ?? 0) + 1);
			}
			for (const entry of ROSTER) expect(wins.get(entry.id) ?? 0).toBeGreaterThan(0);
		}
	);
});
