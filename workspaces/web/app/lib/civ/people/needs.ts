// How needs change each tick, and how unmet needs hurt. Every need runs
// 0..1 where 1 is fully met.

import { ADULT_AGE, ELDER_AGE, season } from '../config';
import type { Person, WeatherKind, World } from '../types';
import {
	addMemory,
	ageOf,
	clamp01,
	countOf,
	dayOf,
	dist,
	hasShelter,
	peopleNear,
	tileIndex
} from './village';

// ---- tuning knobs: how fast each need falls per tick (four ticks a day)
export const FOOD_FALL = 0.035;
export const WATER_FALL = 0.05;
export const REST_FALL = 0.035;
export const REST_GAIN = 0.12;
export const COMPANY_FALL = 0.012;
export const CURIOSITY_FALL = 0.008;
// how far from the village centre counts as "at camp"
export const CAMP_RADIUS = 5;
// On a long walk they drink at streams, forage and doze as they go, so food, water
// and rest never fall below this (a trip is not a way to die of thirst).
export const ROAD_FLOOR = 0.4;

const WORKING = new Set(['forage', 'hunt', 'fish', 'gather', 'craft', 'build', 'walk', 'flee']);

// warmth of the air before fire or shelter, by season (spring..winter)
const SEASON_WARMTH = [0.05, 0.25, 0, -0.25];
const WEATHER_WARMTH: Record<WeatherKind, number> = {
	clear: 0,
	rain: -0.1,
	storm: -0.15,
	drought: 0.05,
	snow: -0.15,
	cold: -0.2
};

export const atCamp = (world: World, p: Person) => {
	const v = world.villages[p.village];
	return !!v && dist(p.x, p.y, v.x, v.y) <= CAMP_RADIUS;
};

// the most health a body can hold: elders wear down
export function maxHealth(world: World, p: Person): number {
	const age = ageOf(world, p);
	return age <= ELDER_AGE ? 1 : Math.max(0.4, 1 - (age - ELDER_AGE) * 0.025);
}

function targetWarmth(world: World, p: Person): number {
	const v = world.villages[p.village];
	const here = world.map.temperature[tileIndex(world.map, p.x, p.y)];
	let warmth = 0.55 + (here - 12) / 40;
	warmth += SEASON_WARMTH[season(dayOf(world))] + WEATHER_WARMTH[world.weather];
	if (p.activity.kind === 'sleep') warmth -= 0.05;
	if (countOf(p.carrying, 'clothing') > 0) warmth += 0.15;
	// huddling together
	if (peopleNear(world, p.x, p.y, 3, p).length >= 2) warmth += 0.08;
	if (v && atCamp(world, p)) {
		if (v.heat > 0) warmth += 0.3;
		if (hasShelter(v)) warmth += 0.15;
	}
	return clamp01(warmth);
}

export function nearWolf(world: World, p: Person): boolean {
	for (const h of world.herds) {
		if (h.kind === 'wolf' && !h.tame && dist(h.x, h.y, p.x, p.y) < 8) return true;
	}
	return false;
}

export function updateNeeds(world: World, p: Person) {
	const n = p.needs;
	const asleep = p.activity.kind === 'sleep';
	const working = WORKING.has(p.activity.kind);
	const child = ageOf(world, p) < ADULT_AGE;
	const effort = asleep ? 0.4 : working ? 1.3 : 1;
	const hot = world.weather === 'drought' || season(dayOf(world)) === 1 ? 1.25 : 1;

	n.food = clamp01(n.food - FOOD_FALL * effort * (child ? 0.8 : 1));
	n.water = clamp01(n.water - WATER_FALL * effort * hot);
	n.rest = clamp01(asleep ? n.rest + REST_GAIN : n.rest - REST_FALL * (working ? 1.3 : 1));
	n.warmth = clamp01(n.warmth + (targetWarmth(world, p) - n.warmth) * 0.3);
	if (p.trip) {
		n.food = Math.max(n.food, ROAD_FLOOR);
		n.water = Math.max(n.water, ROAD_FLOOR);
		n.rest = Math.max(n.rest, ROAD_FLOOR);
	}

	const wolf = nearWolf(world, p);
	// at camp, among others and by the fire, a wolf nearby is a worry, not a terror
	n.safety = clamp01(wolf ? n.safety - (atCamp(world, p) ? 0.03 : 0.2) : n.safety + 0.05);

	const company = peopleNear(world, p.x, p.y, 4, p).length > 0;
	n.company = clamp01(company ? n.company + 0.05 : n.company - COMPANY_FALL * (child ? 2 : 1));

	// respect drifts back to ordinary; deeds raise it elsewhere
	const base = p.notable ? 0.7 : 0.5;
	n.respect = clamp01(n.respect + (base - n.respect) * 0.01);

	// idle minds get restless once the body is looked after
	const spare = n.food > 0.5 && n.water > 0.5 && n.rest > 0.4;
	n.curiosity = clamp01(n.curiosity - (spare ? CURIOSITY_FALL * (0.5 + p.traits.curious) : 0));

	hurt(world, p);
}

// Unmet needs wear the body down; met ones let it mend.
function hurt(world: World, p: Person) {
	const n = p.needs;
	let harm = 0;
	if (n.food < 0.05) harm += 0.012;
	else if (n.food < 0.15) harm += 0.003;
	if (n.water < 0.05) harm += 0.02;
	else if (n.water < 0.15) harm += 0.006;
	if (n.warmth < 0.2) harm += (0.2 - n.warmth) * 0.03;
	if (n.rest < 0.05) harm += 0.003;
	if (harm > 0) {
		p.health = Math.max(0, p.health - harm);
	} else if (n.food > 0.3 && n.water > 0.3 && n.warmth > 0.3) {
		const gain = p.activity.kind === 'sleep' ? 0.008 : 0.004;
		p.health = Math.min(maxHealth(world, p), p.health + gain);
	}
}

// what is killing someone whose needs are unmet, in plain words
export function worstUnmet(p: Person): 'thirst' | 'starvation' | 'cold' | undefined {
	const n = p.needs;
	if (n.water < 0.1) return 'thirst';
	if (n.food < 0.1) return 'starvation';
	if (n.warmth < 0.25) return 'cold';
	return undefined;
}

// ---- illness: a bad meal or bad luck knocks health down; the memory marks
// the cause if it ends in a death
export const ILL_TEXT = 'Fell ill';
export const HURT_TEXT = 'Hurt hunting';

export function fallIll(world: World, p: Person, why: string) {
	p.health = Math.max(0, p.health - 0.25 - 0.2 * (1 - p.health));
	addMemory(world, p, `${ILL_TEXT} after ${why}`, 0.5);
}
