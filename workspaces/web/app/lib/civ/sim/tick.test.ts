import { describe, expect, it } from 'vitest';
import { POPULATION_CAP, TICKS_PER_YEAR } from '../config';
import { isAlive } from '../people/village';
import { runYears } from './run';
import { step } from './tick';
import { createWorld } from './world';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const ticks = (
	world: ReturnType<typeof createWorld>['world'],
	rng: ReturnType<typeof createWorld>['rng'],
	n: number
) => {
	const changes = new Set<number>();
	for (let i = 0; i < n; i++) {
		step(world, rng, changes);
		changes.clear();
	}
};

// the people and the chronicle are what a replay must match
const fingerprint = (world: ReturnType<typeof createWorld>['world']) =>
	JSON.stringify({
		people: world.people,
		chronicle: world.chronicle,
		herds: world.herds,
		tick: world.tick
	});

describe('step', () => {
	it('is deterministic: the same seed gives the same world', () => {
		const a = createWorld(7);
		const b = createWorld(7);
		ticks(a.world, a.rng, TICKS_PER_YEAR * 2);
		ticks(b.world, b.rng, TICKS_PER_YEAR * 2);
		expect(fingerprint(a.world)).toBe(fingerprint(b.world));
		const c = createWorld(8);
		ticks(c.world, c.rng, TICKS_PER_YEAR * 2);
		expect(fingerprint(c.world)).not.toBe(fingerprint(a.world));
	});

	it('saves its random state with the world', () => {
		const { world, rng } = createWorld(3);
		ticks(world, rng, 10);
		expect(world.rng).toEqual(rng.state());
	});

	it('advances time and moves people', () => {
		const { world, rng } = createWorld(3);
		const start = world.people.map((p) => [p.x, p.y]);
		ticks(world, rng, 40);
		expect(world.tick).toBe(40);
		expect(world.people.some((p, i) => p.x !== start[i][0] || p.y !== start[i][1])).toBe(true);
	});

	it('brings a new band in after the old one dies out', () => {
		const { world, rng } = createWorld(3);
		const changes = new Set<number>();
		for (const p of world.people) {
			p.health = -1;
		}
		step(world, rng, changes);
		expect(world.people.some(isAlive)).toBe(false);
		ticks(world, rng, TICKS_PER_YEAR);
		expect(world.people.some(isAlive)).toBe(false);
		ticks(world, rng, TICKS_PER_YEAR + 8);
		const living = world.people.filter(isAlive);
		expect(living.length).toBeGreaterThanOrEqual(6);
		expect(living.length).toBeLessThanOrEqual(10);
		expect(world.chronicle.some((e) => e.kind === 'arrival' && /strangers/.test(e.text))).toBe(
			true
		);
		expect(world.villages.length).toBe(2);
		// they start at the edge and walk in
		const far = living.some((p) => {
			const v = world.villages[1];
			return Math.hypot(p.x - v.x, p.y - v.y) > 6;
		});
		expect(far).toBe(true);
		ticks(world, rng, 80);
		expect(world.people.filter(isAlive).length).toBeGreaterThan(0);
	});
});

describe('a band over the years', () => {
	// ten years for all eight seeds, and a little more for discoveries
	const runs = SEEDS.map((seed) => runYears(seed, 17));

	it('survives ten years in most seeds', () => {
		const survived = runs.filter((r) => r.stats.arrivals === 0 && r.stats.population[10] > 0);
		expect(survived.length).toBeGreaterThanOrEqual(6);
	});

	it('makes a first discovery within about seventeen years in most seeds', () => {
		const early = runs.filter((r) => Object.values(r.stats.discoveries).some((y) => y <= 17));
		expect(early.length).toBeGreaterThanOrEqual(6);
		// and the chronicle marks the village firsts as standouts
		const firsts = runs.flatMap((r) => r.world.chronicle.filter((e) => e.kind === 'first'));
		expect(firsts.length).toBeGreaterThan(0);
		expect(firsts.every((e) => e.standout)).toBe(true);
	});
});

describe('thirty years of one seed', () => {
	it('has births and deaths, stays under the cap, and is quick', () => {
		const t = performance.now();
		const { stats, world } = runYears(1, 30);
		const seconds = (performance.now() - t) / 1000;
		expect(stats.births).toBeGreaterThan(0);
		expect(stats.deaths).toBeGreaterThan(0);
		expect(stats.peak).toBeLessThanOrEqual(POPULATION_CAP);
		expect(world.chronicle.some((e) => e.kind === 'pairing')).toBe(true);
		expect(seconds).toBeLessThan(3);
	});
});
