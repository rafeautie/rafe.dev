import { describe, expect, it } from 'vitest';
import { START_BAND } from '../config';
import { Built } from '../types';
import { ageOf, isAlive } from '../people/village';
import { ADULT_AGE, ELDER_AGE } from '../config';
import { createWorld } from './world';

describe('createWorld', () => {
	const { world } = createWorld(3);
	const people = world.people.filter(isAlive);

	it('settles a band of the right size and mix at a camp', () => {
		expect(people.length).toBeGreaterThanOrEqual(START_BAND.min);
		expect(people.length).toBeLessThanOrEqual(START_BAND.max);
		const camp = world.villages[0];
		expect(world.map.built[camp.y * world.map.size + camp.x]).toBe(Built.camp);
		const age = (p: (typeof people)[number]) => ageOf(world, p);
		expect(people.filter((p) => age(p) > ELDER_AGE).length).toBeGreaterThanOrEqual(1);
		expect(people.filter((p) => age(p) > ELDER_AGE).length).toBeLessThanOrEqual(2);
		const adults = people.filter((p) => age(p) >= ADULT_AGE && age(p) <= ELDER_AGE);
		expect(adults.length).toBeGreaterThanOrEqual(5);
		expect(adults.length).toBeLessThanOrEqual(7);
		expect(people.filter((p) => age(p) < ADULT_AGE).length).toBeGreaterThanOrEqual(2);
	});

	it('pairs some adults and gives children parents', () => {
		expect(people.some((p) => p.partner !== undefined)).toBe(true);
		for (const p of people) {
			if (p.partner !== undefined) {
				expect(people.find((o) => o.id === p.partner)?.partner).toBe(p.id);
			}
			if (ageOf(world, p) < ADULT_AGE)
				expect(p.mother !== undefined || p.father !== undefined).toBe(true);
		}
	});

	it('starts everyone with full needs, no craft know-how and the camp seen', () => {
		for (const p of people) {
			expect(Object.values(p.needs).every((n) => n === 1)).toBe(true);
			expect(Object.keys(p.knowledge)).toHaveLength(0);
			expect(Object.keys(p.seen).length).toBeGreaterThan(5);
			expect(Object.values(p.traits).every((t) => t >= 0 && t <= 1)).toBe(true);
		}
	});

	it('places herds, including wolves, and opens the chronicle', () => {
		const kinds = new Set(world.herds.map((h) => h.kind));
		expect(kinds.has('deer')).toBe(true);
		expect(kinds.has('wolf')).toBe(true);
		expect(world.chronicle[0].kind).toBe('arrival');
	});
});
