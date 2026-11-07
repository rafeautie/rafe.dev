import { describe, expect, it } from 'vitest';
import type { Rng } from '../rng';
import { step } from '../sim/tick';
import { createWorld } from '../sim/world';
import { Deposit } from '../types';
import { maybeStartTrip } from './trips';
import { ageOf, countOf, dist, isAlive } from './village';

// a roll that always comes up
const lucky = { chance: () => true, pick: <T>(xs: T[]) => xs[0] } as unknown as Rng;

function nearest(world: ReturnType<typeof createWorld>['world'], kind: number) {
	const { map } = world;
	const v = world.villages[0];
	let best = Infinity;
	for (let i = 0; i < map.deposit.length; i++) {
		if (map.deposit[i] !== kind) continue;
		best = Math.min(best, dist(v.x, v.y, (i % map.size) + 0.5, Math.floor(i / map.size) + 0.5));
	}
	return best;
}

describe('long trips for ore', () => {
	it('send a metalworker to far tin, who digs it and brings it home', () => {
		const { world, rng } = createWorld(2);
		const camp = world.villages[0];
		expect(nearest(world, Deposit.tin)).toBeGreaterThan(80);
		const p =
			world.people.find((o) => ageOf(world, o) >= 20 && ageOf(world, o) < 40) ?? world.people[0];
		p.knowledge['smelting-copper'] = 1;
		p.traits.bold = 1;
		p.traits.curious = 1;
		// the village has copper ore enough, so it is tin that is wanted
		camp.store.push({ material: 'copper-ore', count: 4 });
		expect(maybeStartTrip(world, lucky, p, camp, 25)).toBe(true);
		expect(p.trip?.material).toBe('tin-ore');
		let farthest = 0;
		const changes = new Set<number>();
		for (let t = 0; t < 4 * 60 * 4 && p.trip; t++) {
			step(world, rng, changes);
			changes.clear();
			farthest = Math.max(farthest, dist(p.x, p.y, camp.x, camp.y));
		}
		expect(isAlive(p)).toBe(true);
		expect(p.trip).toBeUndefined();
		expect(farthest).toBeGreaterThan(60);
		const home = countOf(p.carrying, 'tin-ore') + countOf(camp.store, 'tin-ore');
		expect(home).toBeGreaterThan(0);
	}, 60000);

	it('are not made for ore a day away, nor for tin by people who know no metal', () => {
		const { world } = createWorld(3);
		const camp = world.villages[0];
		const p = world.people[0];
		p.traits.bold = 1;
		p.traits.curious = 1;
		// copper is near here, and nobody has smelted anything yet
		expect(nearest(world, Deposit.copper)).toBeLessThan(30);
		expect(maybeStartTrip(world, lucky, p, camp, 25)).toBe(false);
		expect(p.trip).toBeUndefined();
	});

	it('wait until the village is short of the ore', () => {
		const { world } = createWorld(2);
		const camp = world.villages[0];
		const p = world.people[0];
		p.knowledge['smelting-copper'] = 1;
		camp.store.push({ material: 'tin-ore', count: 3 }, { material: 'copper-ore', count: 4 });
		expect(maybeStartTrip(world, lucky, p, camp, 25)).toBe(false);
	});
});
