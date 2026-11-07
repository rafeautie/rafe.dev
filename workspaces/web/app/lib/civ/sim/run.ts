// Run a world without a page, for tests and for tuning the numbers.

import { DAYS_PER_YEAR, TICKS_PER_YEAR } from '../config';
import type { World } from '../types';
import type { Rng } from '../rng';
import { dayOf, isAlive } from '../people/village';
import { step } from './tick';
import { createWorld } from './world';

export type RunStats = {
	// living people at the end of each year (index 0 is the start)
	population: number[];
	births: number;
	deaths: number;
	deathsByCause: Record<string, number>;
	// the year each piece of know-how was first known to anyone
	discoveries: Record<string, number>;
	peak: number;
	arrivals: number;
};

export type Run = { world: World; rng: Rng; stats: RunStats };

export function livingCount(world: World): number {
	return world.people.filter(isAlive).length;
}

export function runYears(seed: number, years: number): Run {
	const { world, rng } = createWorld(seed);
	const changes = new Set<number>();
	const stats: RunStats = {
		population: [livingCount(world)],
		births: 0,
		deaths: 0,
		deathsByCause: {},
		discoveries: {},
		peak: livingCount(world),
		arrivals: 0
	};
	const total = years * TICKS_PER_YEAR;
	for (let t = 0; t < total; t++) {
		step(world, rng, changes);
		changes.clear();
		if (world.tick % 4 !== 0) continue;
		// once a day, note what is newly known
		const year = Math.floor(dayOf(world) / DAYS_PER_YEAR);
		for (const p of world.people) {
			if (!isAlive(p)) continue;
			for (const k of Object.keys(p.knowledge)) {
				if (stats.discoveries[k] === undefined) stats.discoveries[k] = year;
			}
		}
		if (world.tick % TICKS_PER_YEAR === 0) {
			const alive = livingCount(world);
			stats.population.push(alive);
			stats.peak = Math.max(stats.peak, alive);
		}
	}
	for (const p of world.people) {
		if (p.died !== undefined) {
			stats.deaths++;
			stats.deathsByCause[p.cause ?? 'unknown'] =
				(stats.deathsByCause[p.cause ?? 'unknown'] ?? 0) + 1;
		}
	}
	stats.births = world.chronicle.filter((e) => e.kind === 'birth').length;
	stats.arrivals = world.chronicle.filter((e) => e.kind === 'arrival').length - 1;
	return { world, rng, stats };
}
