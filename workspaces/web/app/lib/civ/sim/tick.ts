// One tick of the world, in a fixed order so a seed always plays out the
// same: time, then the day's systems if a day has begun, then each living
// person in id order (needs, insight, a choice if idle, the deed), then the
// slow business of life, and last a check that someone is still alive.

import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../config';
import type { Rng } from '../rng';
import type { Person, Village, World, WorldMap } from '../types';
import { act, startActivity } from '../people/act';
import { choose } from '../people/choose';
import { createBand } from '../people/create';
import { maybeInsight, updateVillageHeat } from '../people/insight';
import { die, dailyLife, causeOfDeath } from '../people/life';
import { updateNeeds } from '../people/needs';
import {
	dayOf,
	isNight,
	mergedKnowledge,
	record,
	refreshLiving,
	walkable
} from '../people/village';
import { dailyEcology } from './ecology';
import { updateWeather } from './weather';
import { makeVillage } from './world';
import { findStart } from '../world/generate';
import { villageName } from '../people/names';

// ---- tuning knobs
// years with nobody alive before another band wanders in
export const EMPTY_YEARS = 2;
export const ARRIVING_BAND = { min: 6, max: 10 };

// How the chronicle tells of a village's firsts
const FIRST_TEXT: Record<string, (v: string) => string> = {
	'fire-making': (v) => `The first fire burned at ${v}.`,
	knapping: (v) => `${v} learned to strike sharp stone.`,
	cooking: (v) => `${v} tasted cooked food for the first time.`,
	pottery: (v) => `The first pot was fired at ${v}.`,
	planting: (v) => `The first seed was sown at ${v}.`,
	shelter: (v) => `The first shelter went up at ${v}.`,
	herding: (v) => `${v} kept its first tame animal.`
};

// Note anything the village's people know that it has not yet marked as a
// first (things learned other ways than by craft).
function recordFirsts(world: World, v: Village) {
	for (const id of Object.keys(mergedKnowledge(world, v))) {
		const key = `first:${id}`;
		if (v.customs.includes(key)) continue;
		v.customs.push(key);
		const text = FIRST_TEXT[id]?.(v.name) ?? `${v.name} learned ${id.replace(/-/g, ' ')}.`;
		record(world, { kind: 'first', text, standout: true });
	}
}

// ---------------------------------------------------------- new arrivals

// the land tiles a walker from `from` can reach
function reachable(map: WorldMap, from: number): Uint8Array {
	const seen = new Uint8Array(map.size * map.size);
	const queue = [from];
	seen[from] = 1;
	for (let head = 0; head < queue.length; head++) {
		const i = queue[head];
		const x = i % map.size;
		const y = (i - x) / map.size;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= map.size || ny >= map.size) continue;
				const n = ny * map.size + nx;
				if (seen[n] || !walkable(map, n)) continue;
				seen[n] = 1;
				queue.push(n);
			}
		}
	}
	return seen;
}

// A new band comes in from the nearest edge they can walk from and settles.
function arrive(world: World, rng: Rng) {
	const { map } = world;
	const site = findStart(map, world.tick);
	const village = makeVillage(world, rng, site.x, site.y);
	village.name = villageName(rng);
	const seen = reachable(map, site.y * map.size + site.x);
	const edge: { x: number; y: number; d: number }[] = [];
	for (let k = 0; k < map.size; k++) {
		for (const [x, y] of [
			[k, 0],
			[k, map.size - 1],
			[0, k],
			[map.size - 1, k]
		]) {
			if (seen[y * map.size + x]) {
				edge.push({ x, y, d: Math.hypot(x - site.x, y - site.y) });
			}
		}
	}
	edge.sort((a, b) => a.d - b.d);
	const from = edge.length ? edge[rng.int(0, Math.min(4, edge.length - 1))] : site;
	const size = rng.int(ARRIVING_BAND.min, ARRIVING_BAND.max);
	const band = createBand(world, rng, village, { size, at: from });
	for (const p of band) startActivity(p, 'walk', village.x, village.y, 1);
	record(world, {
		kind: 'arrival',
		text: `A band of ${band.length} strangers came in from the edge of the land and settled at ${village.name}.`,
		people: band.map((p) => p.id),
		standout: true
	});
}

function checkExtinction(world: World, rng: Rng) {
	if (world.people.some((p) => p.died === undefined)) return;
	const lastDeath = world.people.reduce((m, p) => Math.max(m, p.died ?? 0), 0);
	if (dayOf(world) - lastDeath >= EMPTY_YEARS * DAYS_PER_YEAR) arrive(world, rng);
}

// ------------------------------------------------------------------ step

function tickPerson(world: World, rng: Rng, p: Person, newDay: boolean, changes: Set<number>) {
	updateNeeds(world, p);
	if (p.health <= 0) {
		die(world, p, causeOfDeath(world, p));
		return;
	}
	if (newDay) maybeInsight(world, rng, p);
	// night calls everyone to sleep wherever they are
	if (p.activity.kind === 'idle' || (isNight(world) && p.activity.kind !== 'sleep')) {
		choose(world, rng, p);
	}
	act(world, rng, p, changes);
}

export function step(world: World, rng: Rng, changes: Set<number>) {
	world.tick++;
	const newDay = world.tick % TICKS_PER_DAY === 0;
	const day = dayOf(world);
	refreshLiving(world);

	if (newDay) {
		updateWeather(world, rng.fork(), day);
		dailyEcology(world, rng.fork(), day, changes);
		for (const v of world.villages) {
			updateVillageHeat(world, v);
			recordFirsts(world, v);
		}
	}

	// births add to the list as we go, so walk a copy
	for (const p of world.people.slice()) {
		if (p.died !== undefined) continue;
		tickPerson(world, rng, p, newDay, changes);
	}

	if (newDay) dailyLife(world, rng.fork());
	checkExtinction(world, rng);
	world.rng = rng.state();
}
