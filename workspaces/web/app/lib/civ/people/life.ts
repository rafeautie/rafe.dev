// The slow business of living: growing old, pairing up, having children,
// dying, and who stands out. Runs once a day.

import {
	ADULT_AGE,
	DAYS_PER_SEASON,
	DAYS_PER_YEAR,
	ELDER_AGE,
	POPULATION_CAP,
	season
} from '../config';
import type { Rng } from '../rng';
import { SKILLS, type Person, type Village, type World } from '../types';
import { fallIll, HURT_TEXT, ILL_TEXT, worstUnmet } from './needs';
import { makePerson } from './create';
import {
	addMemory,
	addStack,
	ageOf,
	clamp01,
	dayOf,
	foodCount,
	living,
	record,
	refreshLiving
} from './village';

// ---- tuning knobs
// chance per day that a partnered woman of child-bearing age conceives, before
// food and room are counted
export const BIRTH_BASE = 0.011;
export const BIRTH_AGES = { min: 16, max: 40 };
// a mother waits this many years between children
export const BIRTH_GAP = 2;
// chance per day that someone falls ill for no reason but luck (doubled in winter)
export const SICK_DAILY = 0.0015;
// the chance of dying in a year, by age (up to and including)
export const DEATH_BY_AGE: [number, number][] = [
	[2, 0.06],
	[12, 0.01],
	[35, 0.008],
	[45, 0.03],
	[55, 0.08],
	[65, 0.18],
	[Infinity, 0.35]
];
// how fond two people must be before they pair, and how often they get round to it
export const PAIR_AFFECTION = 0.55;
export const PAIR_DAILY = 0.2;
export const NOTABLE_MAX = 8;

// ---------------------------------------------------------------- death

function yearlyRisk(age: number): number {
	for (const [upTo, risk] of DEATH_BY_AGE) if (age <= upTo) return risk;
	return 0.35;
}

// What killed someone whose body gave out
export function causeOfDeath(world: World, p: Person): string {
	const unmet = worstUnmet(p);
	if (unmet) return unmet;
	const day = dayOf(world);
	for (const m of p.memories) {
		if (day - m.day > 8) continue;
		if (m.text.startsWith(HURT_TEXT)) return 'hunting injury';
		if (m.text.startsWith(ILL_TEXT)) return 'sickness';
	}
	return 'sickness';
}

export function die(world: World, p: Person, cause: string) {
	if (p.died !== undefined) return;
	const v = world.villages[p.village];
	p.died = dayOf(world);
	p.cause = cause;
	p.activity = { kind: 'idle', x: p.x, y: p.y, left: 0 };
	p.notable = false;
	// what they carried goes to the camp
	if (v) for (const s of p.carrying) addStack(v.store, s.material, s.count);
	p.carrying = [];
	const age = Math.floor(ageOf(world, p));
	const verb: Record<string, string> = {
		'old age': 'died of old age',
		starvation: 'starved',
		thirst: 'died of thirst',
		cold: 'died of the cold',
		sickness: 'died of sickness',
		'hunting injury': 'died of wounds from the hunt'
	};
	record(world, {
		kind: 'death',
		text: `${p.name} ${verb[cause] ?? 'died'}, aged ${age}.`,
		people: [p.id],
		standout: p.id === v?.leader
	});
	if (v?.leader === p.id) v.leader = undefined;

	const byId = new Map(world.people.map((o) => [o.id, o]));
	const kin = [p.partner, p.mother, p.father].filter((id): id is number => id !== undefined);
	for (const o of world.people) if (o.mother === p.id || o.father === p.id) kin.push(o.id);
	for (const id of kin) {
		const o = byId.get(id);
		if (!o || o.died !== undefined) continue;
		if (o.partner === p.id) o.partner = undefined;
		addMemory(world, o, `${p.name} died of ${cause}`, 1);
		o.needs.safety = clamp01(o.needs.safety - 0.2);
	}
	if (p.partner !== undefined) p.partner = undefined;
}

function ageDeaths(world: World, rng: Rng) {
	const winter = season(dayOf(world)) === 3 ? 2 : 1;
	for (const p of living(world)) {
		if (p.died !== undefined) continue;
		const age = ageOf(world, p);
		if (p.health <= 0) {
			die(world, p, causeOfDeath(world, p));
			continue;
		}
		if (rng.chance(SICK_DAILY * winter * (age < 5 || age > ELDER_AGE ? 2 : 1))) {
			fallIll(world, p, 'a fever');
		}
		// a yearly risk, spread over the days
		const daily = 1 - Math.pow(1 - yearlyRisk(age), 1 / DAYS_PER_YEAR);
		if (rng.chance(daily)) die(world, p, age >= 50 ? 'old age' : 'sickness');
	}
}

// --------------------------------------------------------------- pairing

const FERTILE_MIN = 15;
const FERTILE_MAX = 50;

function kin(a: Person, b: Person): boolean {
	if (a.id === b.mother || a.id === b.father || b.id === a.mother || b.id === a.father) return true;
	return (
		(a.mother !== undefined && a.mother === b.mother) ||
		(a.father !== undefined && a.father === b.father)
	);
}

function pairUp(world: World, rng: Rng) {
	const people = living(world);
	const byId = new Map(people.map((o) => [o.id, o]));
	const free = (o: Person, age: number) =>
		o.died === undefined && o.partner === undefined && age >= FERTILE_MIN && age <= FERTILE_MAX;
	for (const p of people) {
		if (p.died !== undefined || !free(p, ageOf(world, p)) || !rng.chance(PAIR_DAILY)) continue;
		let best: Person | undefined;
		let bestLove = PAIR_AFFECTION;
		for (const [key, rel] of Object.entries(p.relations)) {
			const o = byId.get(Number(key));
			if (!o || o.sex === p.sex || !free(o, ageOf(world, o)) || kin(p, o)) continue;
			const love = Math.min(rel.affection, o.relations[p.id]?.affection ?? 0);
			if (love > bestLove) {
				bestLove = love;
				best = o;
			}
		}
		if (!best) continue;
		p.partner = best.id;
		best.partner = p.id;
		addMemory(world, p, `Paired with ${best.name}`, 0.9);
		addMemory(world, best, `Paired with ${p.name}`, 0.9);
		record(world, {
			kind: 'pairing',
			text: `${p.name} and ${best.name} became a pair.`,
			people: [p.id, best.id]
		});
	}
}

// ---------------------------------------------------------------- births

function bear(world: World, rng: Rng, mother: Person, father: Person, v: Village) {
	const child = makePerson(world, rng, {
		sex: rng.chance(0.5) ? 'f' : 'm',
		age: 0,
		village: v.id,
		x: v.x + rng.range(-1, 1),
		y: v.y + rng.range(-1, 1),
		mother,
		father
	});
	world.people.push(child);
	for (const parent of [mother, father]) {
		child.relations[parent.id] = { trust: 0.9, affection: 0.9 };
		parent.relations[child.id] = { trust: 0.9, affection: 0.9 };
		addMemory(world, parent, `${child.name} was born`, 1);
	}
	record(world, {
		kind: 'birth',
		text: `${mother.name} and ${father.name} had a ${child.sex === 'f' ? 'daughter' : 'son'}, ${child.name}.`,
		people: [child.id, mother.id, father.id]
	});
}

function births(world: World, rng: Rng) {
	const people = living(world);
	if (people.length >= POPULATION_CAP) return;
	const byId = new Map(people.map((o) => [o.id, o]));
	let room = POPULATION_CAP - people.length;
	for (const m of people) {
		if (room <= 0) break;
		if (m.died !== undefined || m.sex !== 'f' || m.partner === undefined) continue;
		const age = ageOf(world, m);
		if (age < BIRTH_AGES.min || age > BIRTH_AGES.max) continue;
		const dad = byId.get(m.partner);
		const v = world.villages[m.village];
		if (!dad || dad.died !== undefined || !v) continue;
		// a young child at the breast waits for the next
		const recent = world.people.some(
			(c) => c.mother === m.id && ageOf(world, c) < BIRTH_GAP && c.died === undefined
		);
		if (recent) continue;
		// food and room make it likelier
		const fed = clamp01(0.4 + 0.3 * m.needs.food + 0.3 * clamp01(foodCount(v.store) / 20));
		const space = 1 - people.length / POPULATION_CAP;
		if (!rng.chance(BIRTH_BASE * fed * space)) continue;
		bear(world, rng, m, dad, v);
		room--;
	}
}

// ---------------------------------------------------------- who stands out

function standing(world: World, p: Person): number {
	const best = Math.max(...SKILLS.map((s) => p.skills[s]));
	const knows = Object.keys(p.knowledge).length;
	const age = ageOf(world, p);
	return (
		(age >= ELDER_AGE ? 3 : 0) +
		best * 5 +
		p.traits.curious * 2 +
		knows * 1.5 +
		p.needs.respect * 2 +
		(p.id === world.villages[p.village]?.leader ? 100 : 0)
	);
}

function markNotable(world: World) {
	const adults = living(world).filter((p) => ageOf(world, p) >= ADULT_AGE);
	for (const p of world.people) if (p.died === undefined) p.notable = false;
	adults.sort((a, b) => standing(world, b) - standing(world, a) || a.id - b.id);
	for (const p of adults.slice(0, NOTABLE_MAX)) p.notable = true;
}

// The oldest respected adult leads
function chooseLeaders(world: World) {
	for (const v of world.villages) {
		const here = living(world).filter(
			(p) => p.village === v.id && ageOf(world, p) >= ADULT_AGE + 4
		);
		if (here.length === 0) continue;
		const current = here.find((p) => p.id === v.leader);
		if (current) continue;
		const score = (p: Person) => ageOf(world, p) + p.needs.respect * 10 + p.skills.leading * 20;
		const leader = here.reduce((a, b) => (score(b) > score(a) ? b : a));
		v.leader = leader.id;
		record(world, {
			kind: 'note',
			text: `${leader.name} became the leader of ${v.name}.`,
			people: [leader.id]
		});
	}
}

// -------------------------------------------------------------- the day

export function dailyLife(world: World, rng: Rng) {
	const day = dayOf(world);
	ageDeaths(world, rng);
	pairUp(world, rng);
	births(world, rng);
	// a new year takes a little from the old
	if (day % DAYS_PER_YEAR === 0) {
		for (const p of living(world)) {
			if (p.died === undefined && ageOf(world, p) > ELDER_AGE) {
				p.skills.hunting = clamp01(p.skills.hunting - 0.03);
			}
		}
	}
	chooseLeaders(world);
	if (day % DAYS_PER_SEASON === 0) markNotable(world);
	refreshLiving(world);
}
