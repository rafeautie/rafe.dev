import { describe, expect, it } from 'vitest';
import { createWorld } from '../sim/world';
import type { Person, World } from '../types';
import { eat, startActivity, act } from './act';
import { updateNeeds } from './needs';
import { Rng } from '../rng';

function setup() {
	const { world } = createWorld(2);
	const p = world.people[2];
	const camp = world.villages[0];
	p.x = camp.x;
	p.y = camp.y;
	return { world, p, camp };
}

const run = (world: World, p: Person, ticks: number) => {
	for (let i = 0; i < ticks; i++) updateNeeds(world, p);
};

describe('needs', () => {
	it('food and water fall, faster when working than asleep', () => {
		const { world, p } = setup();
		const b = structuredClone(p);
		p.activity.kind = 'forage';
		b.activity.kind = 'sleep';
		run(world, p, 8);
		run(world, b, 8);
		expect(p.needs.food).toBeLessThan(1);
		expect(p.needs.water).toBeLessThan(p.needs.food);
		expect(b.needs.food).toBeGreaterThan(p.needs.food);
		expect(b.needs.water).toBeGreaterThan(p.needs.water);
	});

	it('rest falls by day and recovers asleep', () => {
		const { world, p } = setup();
		run(world, p, 10);
		const tired = p.needs.rest;
		expect(tired).toBeLessThan(1);
		p.activity.kind = 'sleep';
		run(world, p, 3);
		expect(p.needs.rest).toBeGreaterThan(tired);
	});

	it('are met by drinking and eating', () => {
		const { world, p, camp } = setup();
		const rng = new Rng(1);
		p.needs.water = 0.2;
		p.needs.food = 0.2;
		p.carrying = [{ material: 'nuts', count: 5 }];
		startActivity(p, 'drink', p.x, p.y, 1);
		act(world, rng, p, new Set());
		expect(p.needs.water).toBeGreaterThan(0.8);
		expect(eat(world, p, 3)).toBeGreaterThan(0);
		expect(p.needs.food).toBeGreaterThan(0.5);
		expect(camp).toBeTruthy();
	});

	it('cooked food is worth more once the village cooks', () => {
		const { world, p, camp } = setup();
		p.needs.food = 0.1;
		p.carrying = [{ material: 'raw-meat', count: 1 }];
		eat(world, p, 1);
		const raw = p.needs.food;
		p.needs.food = 0.1;
		p.carrying = [{ material: 'raw-meat', count: 1 }];
		camp.heat = 600;
		camp.customs.push('first:cooking');
		eat(world, p, 1);
		expect(p.needs.food).toBeGreaterThan(raw);
	});

	it('warmth is better at a camp with fire and shelter', () => {
		const { world, p, camp } = setup();
		world.weather = 'cold';
		p.needs.warmth = 0.5;
		run(world, p, 20);
		const bare = p.needs.warmth;
		camp.heat = 600;
		camp.customs.push('shelter');
		p.needs.warmth = 0.5;
		run(world, p, 20);
		expect(p.needs.warmth).toBeGreaterThan(bare);
	});

	it('unmet needs hurt and met ones heal', () => {
		const { world, p } = setup();
		p.needs.water = 0;
		run(world, p, 5);
		expect(p.health).toBeLessThan(1);
		const hurt = p.health;
		p.needs.food = 1;
		p.needs.water = 1;
		p.needs.warmth = 1;
		updateNeeds(world, p);
		updateNeeds(world, p);
		expect(p.health).toBeGreaterThan(hurt - 0.001);
		p.health = 0.5;
		run(world, p, 10);
		expect(p.health).toBeGreaterThan(0.5);
	});
});
