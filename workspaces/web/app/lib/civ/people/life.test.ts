import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createWorld } from '../sim/world';
import { makePerson } from './create';
import { causeOfDeath, dailyLife, die } from './life';
import { ageOf, isAlive } from './village';
import { ADULT_AGE, DAYS_PER_YEAR, POPULATION_CAP } from '../config';
import type { Person, World } from '../types';

function setup() {
	const { world } = createWorld(2);
	return { world, camp: world.villages[0], rng: new Rng(8) };
}

const addPerson = (world: World, rng: Rng, sex: 'f' | 'm', age: number) => {
	const camp = world.villages[0];
	const p = makePerson(world, rng, { sex, age, village: 0, x: camp.x, y: camp.y });
	world.people.push(p);
	return p;
};

describe('life', () => {
	it('names a first leader among the grown', () => {
		const { world, rng } = setup();
		dailyLife(world, rng);
		const leader = world.people.find((p) => p.id === world.villages[0].leader);
		expect(leader).toBeTruthy();
		expect(leader && ageOf(world, leader)).toBeGreaterThan(ADULT_AGE);
	});

	it('pairs fond, unpartnered adults of different sex both ways', () => {
		const { world, rng } = setup();
		for (const p of world.people) p.partner = undefined;
		const a = addPerson(world, rng, 'f', 22);
		const b = addPerson(world, rng, 'm', 24);
		a.relations[b.id] = { trust: 0.9, affection: 0.9 };
		b.relations[a.id] = { trust: 0.9, affection: 0.9 };
		for (let n = 0; n < 40 && a.partner === undefined; n++) dailyLife(world, rng);
		expect(a.partner).toBe(b.id);
		expect(b.partner).toBe(a.id);
		expect(world.chronicle.some((e) => e.kind === 'pairing')).toBe(true);
	});

	it('does not pair close kin', () => {
		const { world, rng } = setup();
		for (const p of world.people) p.partner = undefined;
		const mum = addPerson(world, rng, 'f', 40);
		const son = addPerson(world, rng, 'm', 22);
		son.mother = mum.id;
		mum.relations[son.id] = { trust: 1, affection: 1 };
		son.relations[mum.id] = { trust: 1, affection: 1 };
		for (let n = 0; n < 60; n++) dailyLife(world, rng);
		expect(son.partner).not.toBe(mum.id);
	});

	it('gives partnered women children over the years, with parents set', () => {
		const { world, rng } = setup();
		// a few couples, since children come slowly in a small band
		const couples = Array.from({ length: 4 }, () => {
			const mum = addPerson(world, rng, 'f', 22);
			const dad = addPerson(world, rng, 'm', 24);
			mum.partner = dad.id;
			dad.partner = mum.id;
			return { mum, dad };
		});
		const mums = new Set(couples.map((c) => c.mum.id));
		const before = world.people.length;
		const kids = () => world.people.filter((p) => p.mother !== undefined && mums.has(p.mother));
		for (let n = 0; n < DAYS_PER_YEAR * 30 && kids().length === 0; n++) {
			world.tick += 4;
			for (const p of world.people) if (isAlive(p)) p.needs.food = 1;
			dailyLife(world, rng);
		}
		expect(kids().length).toBeGreaterThan(0);
		expect(world.people.length).toBeGreaterThan(before);
		const child = kids()[0];
		// the father is whoever she was paired with then
		const father = world.people.find((p) => p.id === child.father);
		expect(father?.sex).toBe('m');
		expect(world.chronicle.some((e) => e.kind === 'birth')).toBe(true);
	});

	it('births stop at the population cap', () => {
		const { world, rng } = setup();
		const mum = addPerson(world, rng, 'f', 22);
		const dad = addPerson(world, rng, 'm', 24);
		mum.partner = dad.id;
		dad.partner = mum.id;
		while (world.people.filter(isAlive).length < POPULATION_CAP) addPerson(world, rng, 'm', 20);
		const n = world.people.length;
		for (let d = 0; d < 200; d++) {
			world.tick += 4;
			dailyLife(world, rng);
		}
		expect(world.chronicle.filter((e) => e.kind === 'birth').length).toBe(0);
		expect(world.people.length).toBe(n);
	});

	it('death records a cause, an event and widows the partner', () => {
		const { world, rng } = setup();
		const a = addPerson(world, rng, 'f', 30);
		const b = addPerson(world, rng, 'm', 31);
		a.partner = b.id;
		b.partner = a.id;
		a.carrying = [{ material: 'nuts', count: 3 }];
		a.needs.food = 0;
		a.health = 0;
		expect(causeOfDeath(world, a)).toBe('starvation');
		die(world, a, 'starvation');
		expect(a.died).toBeDefined();
		expect(a.cause).toBe('starvation');
		expect(b.partner).toBeUndefined();
		expect(b.memories.some((m) => m.text.includes(a.name))).toBe(true);
		expect(world.chronicle.at(-1)?.kind).toBe('death');
		expect(world.villages[0].store.some((s) => s.material === 'nuts')).toBe(true);
	});

	it('old people die and the risk rises with age', () => {
		const { world, rng } = setup();
		const old = Array.from({ length: 30 }, () => addPerson(world, rng, 'm', 70));
		const young = Array.from({ length: 30 }, () => addPerson(world, rng, 'm', 25));
		for (let d = 0; d < DAYS_PER_YEAR * 2; d++) {
			world.tick += 4;
			for (const p of world.people) if (isAlive(p)) p.health = 1;
			dailyLife(world, rng);
		}
		const dead = (list: typeof old) => list.filter((p) => !isAlive(p)).length;
		expect(dead(old)).toBeGreaterThan(dead(young));
		expect(old.find((p) => !isAlive(p))?.cause).toBe('old age');
	});

	it('flags at most eight notable people, the leader among them', () => {
		const { world, rng } = setup();
		for (let n = 0; n < 20; n++) addPerson(world, rng, 'm', 25);
		world.tick = 0;
		dailyLife(world, rng);
		const notable = world.people.filter((p) => p.notable);
		expect(notable.length).toBeGreaterThan(0);
		expect(notable.length).toBeLessThanOrEqual(8);
		expect(notable.some((p) => p.id === world.villages[0].leader)).toBe(true);
	});

	it('never leads with the dead, and names a new leader once', () => {
		const { world, rng } = setup();
		const camp = world.villages[0];
		dailyLife(world, rng);
		const first = camp.leader;
		expect(first).toBeDefined();
		const leader = world.people.find((p) => p.id === first) as Person;
		// the leader dies during a tick, before the day's life runs on a stale list
		die(world, leader, 'old age');
		expect(camp.leader).toBeUndefined();
		world.tick += 4;
		dailyLife(world, rng);
		expect(camp.leader).toBeDefined();
		expect(camp.leader).not.toBe(first);
		const next = world.people.find((p) => p.id === camp.leader) as Person;
		expect(isAlive(next)).toBe(true);
		expect(ageOf(world, next)).toBeGreaterThanOrEqual(ADULT_AGE);
		for (let d = 0; d < 30; d++) {
			world.tick += 4;
			dailyLife(world, rng);
		}
		// one announcement for the first leader, one for the next, none for the dead again
		const named = world.chronicle.filter((e) => e.text.includes('became the leader'));
		expect(named.length).toBe(2);
		expect(named.filter((e) => e.people?.[0] === first).length).toBe(1);
	});

	it('does not wear out a healthy 55-year-old too fast', () => {
		const { world, rng } = setup();
		const group = Array.from({ length: 200 }, () => addPerson(world, rng, 'm', 55));
		for (let d = 0; d < DAYS_PER_YEAR; d++) {
			world.tick += 4;
			for (const p of world.people) if (isAlive(p)) p.health = 1;
			dailyLife(world, rng);
		}
		const dead = group.filter((p) => !isAlive(p)).length;
		expect(dead).toBeLessThan(group.length * 0.1);
	});

	it('lets a stranger join a lonely adult who has no one to pair with', () => {
		const { world, rng } = setup();
		for (const p of world.people) if (isAlive(p)) die(world, p, 'sickness');
		const woman = addPerson(world, rng, 'f', 24);
		const before = world.people.length;
		for (let d = 0; d < 400 && woman.partner === undefined; d++) {
			world.tick += 4;
			for (const p of world.people) if (isAlive(p)) p.needs.food = 1;
			dailyLife(world, rng);
		}
		const man = world.people.find((p) => p.id === woman.partner);
		expect(man).toBeTruthy();
		expect(man?.sex).toBe('m');
		expect(man?.partner).toBe(woman.id);
		expect(world.people.length).toBeGreaterThan(before);
		expect(world.chronicle.some((e) => /came from another band/.test(e.text))).toBe(true);
	});

	it('births slow as a village fills to what it can feed', () => {
		const { world, rng } = setup();
		const mum = addPerson(world, rng, 'f', 22);
		const dad = addPerson(world, rng, 'm', 24);
		mum.partner = dad.id;
		dad.partner = mum.id;
		// far more people than a bare camp can feed
		for (let n = 0; n < 40; n++) addPerson(world, rng, 'm', 30);
		const kids = () => world.people.filter((p) => p.mother === mum.id).length;
		for (let d = 0; d < DAYS_PER_YEAR * 3; d++) {
			world.tick += 4;
			for (const p of world.people) if (isAlive(p)) p.needs.food = 1;
			dailyLife(world, rng);
		}
		expect(kids()).toBe(0);
	});
});
