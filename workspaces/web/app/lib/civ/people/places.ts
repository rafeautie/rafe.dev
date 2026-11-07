// Naming the land. When people use a notable spot (a ford, a lake shore, a
// spring, a hill with flint) now and then one of them gives it a name, and the
// chronicle notes it. Rare on purpose: naming is a sign of a people settling
// in, not something that happens the first week.

import { Biome, Deposit, Water, type World, type WorldMap } from '../types';
import type { Rng } from '../rng';
import { placeName } from './names';
import { dayOf, living, record } from './village';

// ---- tuning knobs
// chance per day, for each person standing at a notable spot, that the spot
// gets a name
export const NAME_DAILY = 0.00012;
// days that must pass between one naming and the next
export const NAME_GAP_DAYS = 96;
// the most places named (the list stays small)
export const PLACES_MAX = 12;
// tiles between two named places
const PLACE_SPACING = 10;

const WORDS: Record<string, string> = {
	ford: 'river crossing',
	lake: 'lake shore',
	spring: 'spring',
	hill: 'hill',
	stones: 'stone outcrop'
};

// What is notable about a tile, if anything
export function featureAt(map: WorldMap, i: number): string | undefined {
	if (map.deposit[i] !== Deposit.none && map.depositLeft[i] > 0) {
		return map.biome[i] === Biome.hills || map.biome[i] === Biome.mountain ? 'hill' : 'stones';
	}
	if (map.water[i] === Water.spring) return 'spring';
	if (map.water[i] === Water.river) return 'ford';
	const { size } = map;
	const x = i % size;
	const near = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size];
	for (const n of near)
		if (n >= 0 && n < map.water.length && map.water[n] === Water.lake) return 'lake';
	return undefined;
}

export function namePlaces(world: World, rng: Rng) {
	if (world.places.length >= PLACES_MAX) return;
	const day = dayOf(world);
	const last = world.places.at(-1);
	if (last && day - last.day < NAME_GAP_DAYS) return;
	const { map } = world;
	for (const p of living(world)) {
		const x = Math.floor(p.x);
		const y = Math.floor(p.y);
		if (x < 0 || y < 0 || x >= map.size || y >= map.size) continue;
		const feature = featureAt(map, y * map.size + x);
		if (!feature) continue;
		if (world.places.some((o) => Math.hypot(o.x - x, o.y - y) < PLACE_SPACING)) continue;
		if (!rng.chance(NAME_DAILY)) continue;
		const name = placeName(rng, feature);
		world.places.push({ name, kind: feature, x, y, day });
		record(world, {
			kind: 'note',
			text: `${p.name} named the ${WORDS[feature]} ${name}.`,
			people: [p.id]
		});
		return;
	}
}
