import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createWorld } from '../sim/world';
import { choose, urgency } from './choose';
import { ageOf } from './village';
import { ADULT_AGE } from '../config';

function setup() {
	const { world } = createWorld(2);
	const adult = world.people.find((p) => ageOf(world, p) >= ADULT_AGE && ageOf(world, p) < 40);
	if (!adult) throw new Error('no adult');
	const camp = world.villages[0];
	adult.x = camp.x;
	adult.y = camp.y;
	return { world, p: adult, camp, rng: new Rng(4) };
}

describe('urgency', () => {
	it('grows as a need empties', () => {
		expect(urgency(1)).toBe(0);
		expect(urgency(0.5)).toBeGreaterThan(urgency(0.7));
		expect(urgency(0)).toBeCloseTo(1);
	});
});

describe('choose', () => {
	it('sends everyone to sleep at night', () => {
		const { world, p, camp, rng } = setup();
		world.tick = 3;
		p.x = camp.x + 30;
		choose(world, rng, p);
		expect(p.activity.kind).toBe('sleep');
		expect(p.activity.x).toBe(camp.x);
	});

	it('goes to drink when thirsty', () => {
		const { world, p, rng } = setup();
		world.tick = 1;
		p.needs.water = 0.05;
		choose(world, rng, p);
		expect(p.activity.kind).toBe('drink');
	});

	it('eats from the store when hungry at camp', () => {
		const { world, p, camp, rng } = setup();
		world.tick = 1;
		camp.store.push({ material: 'nuts', count: 10 });
		p.needs.food = 0.05;
		choose(world, rng, p);
		expect(p.activity.kind).toBe('eat');
	});

	it('looks for food when hungry with none to hand', () => {
		const { world, p, rng } = setup();
		world.tick = 1;
		p.needs.food = 0.05;
		choose(world, rng, p);
		expect(['forage', 'hunt', 'fish']).toContain(p.activity.kind);
	});

	it('heads home at evening when far from camp', () => {
		const { world, p, camp, rng } = setup();
		world.tick = 2;
		p.x = camp.x + 30;
		choose(world, rng, p);
		expect(p.activity.kind).toBe('walk');
		expect(p.activity.x).toBe(camp.x);
	});

	it('keeps small children close to camp or a parent', () => {
		const { world, camp, rng } = setup();
		const child = world.people.find((p) => ageOf(world, p) < 8);
		if (!child) return;
		world.tick = 1;
		for (let n = 0; n < 40; n++) {
			child.needs.food = 0.5;
			choose(world, rng, child);
			expect(Math.hypot(child.activity.x - camp.x, child.activity.y - camp.y)).toBeLessThan(30);
			expect(['hunt', 'gather']).not.toContain(child.activity.kind);
		}
	});

	it('prays only when a need is badly unmet and nothing else helps', () => {
		const { world, p, rng } = setup();
		world.tick = 1;
		const kinds = new Set<string>();
		for (let n = 0; n < 30; n++) {
			p.needs.safety = 0.05;
			choose(world, rng, p);
			kinds.add(p.activity.kind);
		}
		expect(kinds.has('pray')).toBe(true);
	});
});
