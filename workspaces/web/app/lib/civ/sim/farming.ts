// What knowing how to plant and keep animals does for a village. Fields get
// sown each spring and give grain in autumn; tame herds breed and are
// slaughtered now and then. This is where food know-how turns into room for
// more people.

import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../config';
import { freeSpot } from '../people/act';
import { addStack, countOf, living, mergedKnowledge } from '../people/village';
import type { Rng } from '../rng';
import { Built, type Village, type World } from '../types';

// ---- tuning knobs
// people one field is expected to help feed; villages sow about this many
export const FIELD_PEOPLE = 3;
// the most fields a village sows
export const FIELDS_MAX = 60;
// grain a field gives each autumn (one person eats about 90 a year), more with
// stored seed
export const FIELD_GRAIN = 150;
export const SEED_STORE_BONUS = 1.3;
// grain a village keeps per person, about two years of eating
export const GRAIN_PER_HEAD = 180;
// tame animals breed this much a year, up to this many in a herd
const TAME_BREED = 0.3;
const TAME_MAX = 10;
// a herd bigger than this gives up one animal each autumn
const SLAUGHTER_OVER = 3;
const MEAT_PER_ANIMAL = 5;
// how far from the village a field is sown
const FIELD_REACH = 12;

export function fieldsAt(world: World, v: Village): number {
	const { map } = world;
	let n = 0;
	const cx = Math.floor(v.x);
	const cy = Math.floor(v.y);
	for (let y = Math.max(0, cy - FIELD_REACH); y <= Math.min(map.size - 1, cy + FIELD_REACH); y++) {
		for (
			let x = Math.max(0, cx - FIELD_REACH);
			x <= Math.min(map.size - 1, cx + FIELD_REACH);
			x++
		) {
			if (map.built[y * map.size + x] === Built.field) n++;
		}
	}
	return n;
}

function sow(world: World, v: Village, headcount: number, changes: Set<number>) {
	const want = Math.min(FIELDS_MAX, Math.ceil(headcount / FIELD_PEOPLE));
	let have = fieldsAt(world, v);
	// a couple of new fields a spring, not a whole landscape at once
	for (let k = 0; k < 2 && have < want; k++) {
		const i = freeSpot(world, v, FIELD_REACH);
		if (i === undefined) return;
		world.map.built[i] = Built.field;
		changes.add(i);
		have++;
	}
}

function harvest(world: World, v: Village, know: Record<string, number>, headcount: number) {
	const fields = fieldsAt(world, v);
	if (fields === 0) return;
	const bonus = (know['seed-saving'] ?? 0) > 0 ? SEED_STORE_BONUS : 1;
	// a granary only holds so much; the rest is lost to damp and mice
	const room = Math.max(0, GRAIN_PER_HEAD * headcount - countOf(v.store, 'wild-grain'));
	addStack(v.store, 'wild-grain', Math.min(room, Math.round(fields * FIELD_GRAIN * bonus)));
}

function tendHerds(world: World, rng: Rng, v: Village, autumn: boolean) {
	for (const h of world.herds) {
		if (!h.tame || h.village !== v.id || h.count <= 0) continue;
		if (!autumn) {
			h.count = Math.min(TAME_MAX, h.count + Math.round(h.count * TAME_BREED + rng.range(0, 0.6)));
		} else if (h.count > SLAUGHTER_OVER) {
			h.count--;
			addStack(v.store, 'raw-meat', MEAT_PER_ANIMAL);
			addStack(v.store, 'hide', 1);
		}
	}
}

// Called once a day. Spring's first day sows and breeds; autumn's reaps.
export function dailyFarming(world: World, rng: Rng, day: number, changes: Set<number>) {
	const inYear = day % DAYS_PER_YEAR;
	const spring = inYear === 0;
	const autumn = inYear === DAYS_PER_SEASON * 2;
	if (!spring && !autumn) return;
	const heads = new Map<number, number>();
	for (const p of living(world)) heads.set(p.village, (heads.get(p.village) ?? 0) + 1);
	for (const v of world.villages) {
		const headcount = heads.get(v.id) ?? 0;
		if (headcount === 0) continue;
		const know = mergedKnowledge(world, v);
		const herding = (know.herding ?? 0) > 0 || (know['cattle-keeping'] ?? 0) > 0;
		if (herding) tendHerds(world, rng, v, autumn);
		if (!((know.planting ?? 0) > 0)) continue;
		// without seed kept back, sowing stays a small plot made by hand
		if (spring && (know['seed-saving'] ?? 0) > 0) sow(world, v, headcount, changes);
		else if (autumn) harvest(world, v, know, headcount);
	}
}
