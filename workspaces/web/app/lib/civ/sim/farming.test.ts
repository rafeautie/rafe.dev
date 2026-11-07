import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../config';
import { Rng } from '../rng';
import { capacityOf, sicknessFactor } from '../people/life';
import { countOf } from '../people/village';
import { Built } from '../types';
import { dailyFarming, fieldsAt } from './farming';
import { createWorld } from './world';

function setup() {
	const { world } = createWorld(2);
	const camp = world.villages[0];
	const know = (id: string) => world.people.forEach((p) => (p.knowledge[id] = 0.8));
	return { world, camp, know, rng: new Rng(3), changes: new Set<number>() };
}

describe('farming', () => {
	it('sows fields each spring only once seed is kept, and reaps grain in autumn', () => {
		const { world, camp, know, rng, changes } = setup();
		know('planting');
		dailyFarming(world, rng, DAYS_PER_YEAR, changes);
		expect(fieldsAt(world, camp)).toBe(0);
		know('seed-saving');
		dailyFarming(world, rng, DAYS_PER_YEAR, changes);
		expect(fieldsAt(world, camp)).toBeGreaterThan(0);
		expect(world.map.built.some((b) => b === Built.field)).toBe(true);
		const before = countOf(camp.store, 'wild-grain');
		dailyFarming(world, rng, DAYS_PER_YEAR + DAYS_PER_SEASON * 2, changes);
		expect(countOf(camp.store, 'wild-grain')).toBeGreaterThan(before);
	});

	it('does nothing without planting', () => {
		const { world, camp, rng, changes } = setup();
		dailyFarming(world, rng, DAYS_PER_YEAR, changes);
		dailyFarming(world, rng, DAYS_PER_YEAR + DAYS_PER_SEASON * 2, changes);
		expect(fieldsAt(world, camp)).toBe(0);
		expect(countOf(camp.store, 'wild-grain')).toBe(0);
	});

	it('tame herds breed in spring and are culled in autumn for meat', () => {
		const { world, camp, know, rng, changes } = setup();
		know('herding');
		world.herds.push({
			id: 99,
			kind: 'goat',
			x: camp.x,
			y: camp.y,
			count: 4,
			tame: true,
			village: 0
		});
		dailyFarming(world, rng, DAYS_PER_YEAR, changes);
		const herd = world.herds.find((h) => h.id === 99);
		expect(herd?.count).toBeGreaterThan(4);
		const meat = countOf(camp.store, 'raw-meat');
		dailyFarming(world, rng, DAYS_PER_YEAR + DAYS_PER_SEASON * 2, changes);
		expect(countOf(camp.store, 'raw-meat')).toBeGreaterThan(meat);
	});
});

describe('what a village can feed and how healthy it is', () => {
	it('room grows with food know-how, fields and tame herds', () => {
		const { world, camp, know } = setup();
		const bare = capacityOf(world, camp);
		know('drying');
		const dry = capacityOf(world, camp);
		expect(dry).toBeGreaterThan(bare);
		know('planting');
		world.map.built[Math.floor(camp.y) * world.map.size + Math.floor(camp.x) + 2] = Built.field;
		expect(capacityOf(world, camp)).toBeGreaterThan(dry + 5);
		const fields = capacityOf(world, camp);
		world.herds.push({
			id: 98,
			kind: 'goat',
			x: camp.x,
			y: camp.y,
			count: 3,
			tame: true,
			village: 0
		});
		expect(capacityOf(world, camp)).toBeGreaterThan(fields);
	});

	it('sickness eases with cooking, clean water and shelter', () => {
		const { camp } = setup();
		expect(sicknessFactor({}, camp)).toBe(1);
		const cooked = sicknessFactor({ cooking: 1 }, camp);
		const cleaner = sicknessFactor({ cooking: 1, pottery: 1 }, camp);
		expect(cooked).toBeLessThan(1);
		expect(cleaner).toBeLessThan(cooked);
		camp.customs.push('shelter');
		expect(sicknessFactor({ cooking: 1, pottery: 1 }, camp)).toBeLessThan(cleaner);
		expect(sicknessFactor({ cooking: 1, pottery: 1, digging: 1 }, camp)).toBeGreaterThan(0.3);
	});
});
