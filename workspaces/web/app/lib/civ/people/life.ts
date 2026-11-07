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
import { fieldsAt } from '../sim/farming';
import { fallIll, HURT_TEXT, ILL_TEXT, worstUnmet } from './needs';
import { makePerson } from './create';
import {
	addMemory,
	addStack,
	ageOf,
	clamp01,
	dayOf,
	foodCount,
	hasShelter,
	living,
	mergedKnowledge,
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
	[45, 0.02],
	[50, 0.03],
	[55, 0.04],
	[60, 0.07],
	[65, 0.11],
	[75, 0.22],
	[Infinity, 0.4]
];
// What a village can feed. A band living off what it finds supports about this
// many; know-how, fields, tame herds and a full store raise it. Births slow as
// a village nears its capacity and stop above it (famine does the rest).
export const CAPACITY_BASE = 22;
export const CAPACITY_KNOW: Record<string, number> = {
	cooking: 3,
	drying: 4,
	salting: 5,
	pottery: 4,
	'seed-saving': 6,
	planting: 10,
	herding: 6,
	'cattle-keeping': 8,
	fencing: 3
};
export const CAPACITY_PER_FIELD = 5;
export const CAPACITY_PER_TAME = 2;
// a full store adds up to this much room, one person for each few units of food
export const CAPACITY_STORE_MAX = 30;
export const CAPACITY_STORE_UNITS = 6;
// How much each comfort cuts the sickness that kills, together at most this
// much (cooked food, clean water kept in pots or wells, a roof)
export const SICK_RELIEF = { cooking: 0.2, water: 0.2, shelter: 0.2 };
export const SICK_FLOOR = 0.4;
// chance per day, in a village with a grown person who has no one to pair
// with, that a young stranger from another band joins and pairs with them
export const OUTSIDER_DAILY = 0.01;
// how fond two people must be before they pair, and how often they get round to it
export const PAIR_AFFECTION = 0.55;
export const PAIR_DAILY = 0.2;
export const NOTABLE_MAX = 8;

// ---------------------------------------------------------------- death

function yearlyRisk(age: number): number {
	for (const [upTo, risk] of DEATH_BY_AGE) if (age <= upTo) return risk;
	return 0.4;
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

// How many people a village can feed, from what its people know and have
export function capacityOf(world: World, v: Village, know = mergedKnowledge(world, v)): number {
	let room = CAPACITY_BASE;
	for (const [id, bonus] of Object.entries(CAPACITY_KNOW)) if ((know[id] ?? 0) > 0) room += bonus;
	if ((know.planting ?? 0) > 0) room += CAPACITY_PER_FIELD * fieldsAt(world, v);
	for (const h of world.herds)
		if (h.tame && h.village === v.id) room += CAPACITY_PER_TAME * h.count;
	return room + Math.min(CAPACITY_STORE_MAX, foodCount(v.store) / CAPACITY_STORE_UNITS);
}

// 1 for a bare camp; lower as cooking, clean water and shelter take hold
export function sicknessFactor(know: Record<string, number>, v: Village): number {
	let f = 1;
	if ((know.cooking ?? 0) > 0) f -= SICK_RELIEF.cooking;
	if ((know.pottery ?? 0) > 0 || (know.digging ?? 0) > 0) f -= SICK_RELIEF.water;
	if (hasShelter(v)) f -= SICK_RELIEF.shelter;
	return Math.max(SICK_FLOOR, f);
}

function ageDeaths(world: World, rng: Rng) {
	const winter = season(dayOf(world)) === 3 ? 2 : 1;
	const relief = new Map<number, number>();
	for (const v of world.villages) relief.set(v.id, sicknessFactor(mergedKnowledge(world, v), v));
	for (const p of living(world)) {
		if (p.died !== undefined) continue;
		const age = ageOf(world, p);
		const f = relief.get(p.village) ?? 1;
		if (p.health <= 0) {
			die(world, p, causeOfDeath(world, p));
			continue;
		}
		if (rng.chance(SICK_DAILY * f * winter * (age < 5 || age > ELDER_AGE ? 2 : 1))) {
			fallIll(world, p, 'a fever');
		}
		// a yearly risk, spread over the days
		// the young die mostly of sickness, which comforts hold back; old age is old age
		const risk = yearlyRisk(age) * (age < 50 ? f : 0.5 + 0.5 * f);
		const daily = 1 - Math.pow(1 - risk, 1 / DAYS_PER_YEAR);
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
	const heads = new Map<number, number>();
	for (const p of people) heads.set(p.village, (heads.get(p.village) ?? 0) + 1);
	// young children by mother, so nobody scans the whole list for each woman
	const littleOnes = new Set<number>();
	for (const c of people) {
		if (c.mother !== undefined && ageOf(world, c) < BIRTH_GAP) littleOnes.add(c.mother);
	}
	const room = new Map<number, number>();
	let left = POPULATION_CAP - people.length;
	for (const m of people) {
		if (left <= 0) break;
		if (m.died !== undefined || m.sex !== 'f' || m.partner === undefined) continue;
		const age = ageOf(world, m);
		if (age < BIRTH_AGES.min || age > BIRTH_AGES.max) continue;
		const dad = byId.get(m.partner);
		const v = world.villages[m.village];
		if (!dad || dad.died !== undefined || !v) continue;
		// a young child at the breast waits for the next
		if (littleOnes.has(m.id)) continue;
		// food and room make it likelier
		let space = room.get(v.id);
		if (space === undefined) {
			space = clamp01(1 - (heads.get(v.id) ?? 0) / capacityOf(world, v));
			room.set(v.id, space);
		}
		const fed = clamp01(0.4 + 0.3 * m.needs.food + 0.3 * clamp01(foodCount(v.store) / 20));
		if (!rng.chance(BIRTH_BASE * fed * space)) continue;
		bear(world, rng, m, dad, v);
		heads.set(v.id, (heads.get(v.id) ?? 0) + 1);
		room.delete(v.id);
		left--;
	}
}

// -------------------------------------------------------------- outsiders

// A small band has few people it may pair with (brothers and sisters do not),
// so now and then a young stranger from another band joins and pairs with
// someone who would otherwise be left alone.
function outsiders(world: World, rng: Rng) {
	if (living(world).length >= POPULATION_CAP) return;
	const heads = new Map<number, Person[]>();
	for (const p of living(world)) {
		const list = heads.get(p.village);
		if (list) list.push(p);
		else heads.set(p.village, [p]);
	}
	for (const [id, here] of heads) {
		const v = world.villages[id];
		if (!v || here.length >= capacityOf(world, v)) continue;
		const single = (o: Person) =>
			o.partner === undefined &&
			ageOf(world, o) >= FERTILE_MIN &&
			ageOf(world, o) <= FERTILE_MAX - 10;
		const singles = here.filter(single);
		const lonely = singles.find((p) => !singles.some((o) => o.sex !== p.sex && !kin(p, o)));
		if (!lonely || !rng.chance(OUTSIDER_DAILY)) continue;
		const stranger = makePerson(world, rng, {
			sex: lonely.sex === 'f' ? 'm' : 'f',
			age: rng.range(17, 28),
			village: v.id,
			x: v.x + rng.range(-2, 2),
			y: v.y + rng.range(-2, 2)
		});
		world.people.push(stranger);
		stranger.partner = lonely.id;
		lonely.partner = stranger.id;
		for (const [a, b] of [
			[stranger, lonely],
			[lonely, stranger]
		]) {
			a.relations[b.id] = { trust: 0.8, affection: 0.8 };
		}
		for (const o of here) {
			const bond = { trust: 0.4, affection: 0.35 };
			stranger.relations[o.id] ??= { ...bond };
			o.relations[stranger.id] ??= { ...bond };
		}
		addMemory(world, lonely, `${stranger.name} came and stayed`, 0.9);
		record(world, {
			kind: 'pairing',
			text: `${stranger.name} came from another band to ${v.name} and paired with ${lonely.name}.`,
			people: [stranger.id, lonely.id]
		});
		return;
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
	const adults = living(world).filter((p) => p.died === undefined && ageOf(world, p) >= ADULT_AGE);
	for (const p of world.people) if (p.died === undefined) p.notable = false;
	adults.sort((a, b) => standing(world, b) - standing(world, a) || a.id - b.id);
	for (const p of adults.slice(0, NOTABLE_MAX)) p.notable = true;
}

// The oldest respected adult leads. Only living adults can lead; a new one is
// chosen only when there is none (or the leader has died), and named once.
function chooseLeaders(world: World) {
	for (const v of world.villages) {
		const here = living(world).filter(
			(p) => p.died === undefined && p.village === v.id && ageOf(world, p) >= ADULT_AGE + 4
		);
		if (here.length === 0) continue;
		if (here.some((p) => p.id === v.leader)) continue;
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
	// people who died earlier this tick are still in the cached list
	refreshLiving(world);
	ageDeaths(world, rng);
	refreshLiving(world);
	pairUp(world, rng);
	outsiders(world, rng);
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
