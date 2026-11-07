// Making people: one person from a few choices, and a whole starting band.

import { ADULT_AGE, DAYS_PER_YEAR, ELDER_AGE, START_BAND } from '../config';
import type { Rng } from '../rng';
import {
	KNACKS,
	NEEDS,
	SKILLS,
	TRAITS,
	type Knack,
	type Need,
	type Person,
	type Skill,
	type Trait,
	type Village,
	type World
} from '../types';
import { uniqueName } from './names';
import { ageOf, clamp01, dayOf, materialsAround } from './village';

// which skills each knack helps
const KNACK_SKILLS: Record<Knack, Skill[]> = {
	hands: ['crafting', 'building'],
	nature: ['foraging', 'hunting', 'farming', 'herding'],
	words: ['talking', 'healing'],
	people: ['leading', 'talking']
};

export type PersonSpec = {
	sex: 'f' | 'm';
	// in years
	age: number;
	village: number;
	x: number;
	y: number;
	mother?: Person;
	father?: Person;
};

function newTraits(rng: Rng, mother?: Person, father?: Person): Record<Trait, number> {
	const traits = {} as Record<Trait, number>;
	for (const t of TRAITS) {
		// children lean toward their parents
		const parents = [mother, father].filter((p): p is Person => !!p);
		const lean = parents.length
			? parents.reduce((s, p) => s + p.traits[t], 0) / parents.length
			: 0.5;
		const mix = parents.length ? 0.5 : 0;
		traits[t] = clamp01(0.5 * (1 - mix) + lean * mix + rng.gauss() * 0.2);
	}
	return traits;
}

function newSkills(rng: Rng, knack: Knack, age: number): Record<Skill, number> {
	const skills = {} as Record<Skill, number>;
	// a young adult has had some practice; a child has had none
	const grown = Math.min(1, Math.max(0, (age - 8) / 8));
	for (const s of SKILLS) {
		const bonus = KNACK_SKILLS[knack].includes(s) ? 0.1 : 0;
		skills[s] = clamp01((rng.range(0, 0.15) + bonus) * grown);
	}
	return skills;
}

export function makePerson(world: World, rng: Rng, spec: PersonSpec): Person {
	const taken = new Set(world.people.map((p) => p.name));
	const knack = rng.pick(KNACKS);
	const needs = {} as Record<Need, number>;
	for (const n of NEEDS) needs[n] = 1;
	const person: Person = {
		id: world.nextId++,
		name: uniqueName(rng, taken),
		sex: spec.sex,
		born: dayOf(world) - Math.round(spec.age * DAYS_PER_YEAR),
		x: spec.x,
		y: spec.y,
		village: spec.village,
		mother: spec.mother?.id,
		father: spec.father?.id,
		health: 1,
		needs,
		traits: newTraits(rng, spec.mother, spec.father),
		knack,
		skills: newSkills(rng, knack, spec.age),
		knowledge: {},
		seen: {},
		carrying: [],
		memories: [],
		relations: {},
		activity: { kind: 'idle', x: spec.x, y: spec.y, left: 0 },
		notable: false
	};
	return person;
}

// everyone has seen what lies around camp
function learnSurroundings(world: World, p: Person, camp: Village) {
	for (const id of materialsAround(world.map, camp.x, camp.y, 12)) p.seen[id] = 3;
}

function bond(a: Person, b: Person, trust: number, affection: number) {
	a.relations[b.id] = { trust, affection };
	b.relations[a.id] = { trust, affection };
}

function couple(a: Person, b: Person) {
	a.partner = b.id;
	b.partner = a.id;
	bond(a, b, 0.8, 0.8);
}

// People of the band get to know each other a little
function introduce(rng: Rng, band: Person[]) {
	for (let i = 0; i < band.length; i++) {
		for (let j = i + 1; j < band.length; j++) {
			if (band[i].relations[band[j].id]) continue;
			bond(band[i], band[j], rng.range(0.3, 0.6), rng.range(0.2, 0.55));
		}
	}
}

// A starting band: one or two elders, a handful of adults (some paired), and
// children with parents. `size` is for arriving bands; the first band picks
// its own.
export function createBand(
	world: World,
	rng: Rng,
	village: Village,
	opts: { size?: number; at?: { x: number; y: number } } = {}
): Person[] {
	let elders = opts.size ? 1 : rng.int(1, 2);
	let kids = opts.size ? rng.int(1, 2) : rng.int(2, 4);
	let adults = opts.size ? opts.size - elders - kids : rng.int(5, 7);
	const total = () => elders + kids + adults;
	while (!opts.size && total() > START_BAND.max) {
		if (kids > 2) kids--;
		else if (elders > 1) elders--;
		else adults--;
	}
	const at = opts.at ?? village;

	const make = (age: number, sex?: 'f' | 'm', mother?: Person, father?: Person) =>
		makePerson(world, rng, {
			sex: sex ?? (rng.chance(0.5) ? 'f' : 'm'),
			age,
			village: village.id,
			x: at.x + rng.range(-2, 2),
			y: at.y + rng.range(-2, 2),
			mother,
			father
		});

	const grown: Person[] = [];
	for (let i = 0; i < elders; i++)
		grown.push(make(rng.range(ELDER_AGE + 1, 58), i % 2 ? 'm' : 'f'));
	const half = Math.ceil(adults / 2);
	for (let i = 0; i < adults; i++) {
		grown.push(make(rng.range(ADULT_AGE + 2, 40), i < half ? 'f' : 'm'));
	}
	world.people.push(...grown);

	// pair elders together, then adults as far as the sexes allow
	const elderList = grown.slice(0, elders);
	if (elderList.length === 2) couple(elderList[0], elderList[1]);
	const women = grown.slice(elders).filter((p) => p.sex === 'f');
	const men = grown.slice(elders).filter((p) => p.sex === 'm');
	const pairs = Math.min(women.length, men.length, Math.ceil(adults / 2) - 1);
	for (let i = 0; i < pairs; i++) couple(women[i], men[i]);

	const children: Person[] = [];
	for (let i = 0; i < kids; i++) {
		const age = rng.range(1, 12);
		const mothers = grown.filter((p) => p.sex === 'f' && (p.partner !== undefined || adults < 5));
		const eligible = mothers.filter((m) => ageOf(world, m) >= age + 15);
		const mother = eligible.length ? rng.pick(eligible) : undefined;
		const father =
			mother?.partner !== undefined ? world.people.find((p) => p.id === mother.partner) : undefined;
		const child = make(age, undefined, mother, father);
		children.push(child);
		world.people.push(child);
		if (mother) bond(child, mother, 0.9, 0.9);
		if (father) bond(child, father, 0.9, 0.9);
	}

	const band = [...grown, ...children];
	introduce(rng, band);
	for (const p of band) learnSurroundings(world, p, village);
	return band;
}
