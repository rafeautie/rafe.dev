// Long trips for ore that is too far to fetch on an ordinary day. A day's gathering
// only reaches about 35 tiles (the walk home at dusk and thirst turn people back),
// and tin lies far from where the first people settle on purpose. So now and then a
// bold, curious adult sets out for days, digs, and walks home. Trade and real travel
// come later; this is just a person walking out and back.

import { ELDER_AGE } from '../config';
import { Deposit, type Person, type Village, type World, type WorldMap } from '../types';
import type { Rng } from '../rng';
import { startActivity, gatherFrom } from './act';
import { CAMP_RADIUS } from './needs';
import { addMemory, countOf, dist, tileIndex } from './village';

// ---- tuning knobs
// chance per decision, for someone with spare time, times (bold + curious)
export const TRIP_CHANCE = 0.00005;
// units of ore carried home
export const TRIP_LOAD = 4;
// ore this close is fetched on an ordinary day, so it needs no trip
const TRIP_NEAR = 30;
// turns of no progress before a walker gives up on the way out, then on the way home
const STUCK_LIMIT = 3;

type Quarry = {
	material: string;
	deposit: Deposit;
	// whether this person would think to go for it now
	wanted: (p: Person, v: Village) => boolean;
};

const QUARRIES: Quarry[] = [
	// the odd green stone the curious have heard of
	{
		material: 'copper-ore',
		deposit: Deposit.copper,
		wanted: (_p, v) => countOf(v.store, 'copper-ore') + countOf(v.store, 'copper') < 4
	},
	// metalworkers know what tin is for, and a village short of it sends someone
	{
		material: 'tin-ore',
		deposit: Deposit.tin,
		wanted: (p, v) =>
			(p.knowledge['smelting-copper'] ?? 0) > 0 &&
			countOf(v.store, 'tin-ore') + countOf(v.store, 'tin') + countOf(v.store, 'bronze') < 2
	}
];

const tiles = new WeakMap<WorldMap, Map<Deposit, number[]>>();

function depositTiles(map: WorldMap, kind: Deposit): number[] {
	let byKind = tiles.get(map);
	if (!byKind) tiles.set(map, (byKind = new Map()));
	let list = byKind.get(kind);
	if (!list) {
		list = [];
		for (let i = 0; i < map.deposit.length; i++) if (map.deposit[i] === kind) list.push(i);
		byKind.set(kind, list);
	}
	return list;
}

// the nearest deposit of a kind that still has some left, wherever it is
function nearestDeposit(world: World, v: Village, kind: Deposit) {
	const { map } = world;
	let best: { i: number; d: number } | undefined;
	for (const i of depositTiles(map, kind)) {
		if (map.depositLeft[i] <= 0) continue;
		const d = dist(v.x, v.y, (i % map.size) + 0.5, Math.floor(i / map.size) + 0.5);
		if (!best || d < best.d) best = { i, d };
	}
	return best;
}

// Maybe set off. Returns whether a trip began.
export function maybeStartTrip(
	world: World,
	rng: Rng,
	p: Person,
	v: Village,
	age: number
): boolean {
	if (p.trip || age >= ELDER_AGE || p.health < 0.7) return false;
	const wanting = QUARRIES.filter((q) => q.wanted(p, v));
	if (wanting.length === 0) return false;
	if (!rng.chance(TRIP_CHANCE * (p.traits.bold + p.traits.curious))) return false;
	const quarry = rng.pick(wanting);
	const found = nearestDeposit(world, v, quarry.deposit);
	if (!found || found.d <= TRIP_NEAR) return false;
	const size = world.map.size;
	p.trip = {
		x: (found.i % size) + 0.5,
		y: Math.floor(found.i / size) + 0.5,
		material: quarry.material,
		back: false,
		px: p.x,
		py: p.y,
		stuck: 0
	};
	addMemory(world, p, `Set out for ore far from ${v.name}`, 0.6);
	return true;
}

// One decision of a person on a trip: keep walking, dig on arrival, turn home,
// or finish at camp. Returns true while the trip goes on.
export function continueTrip(world: World, p: Person, v: Village): boolean {
	const t = p.trip;
	if (!t) return false;
	// no progress since last time: blocked by water, say
	t.stuck = dist(p.x, p.y, t.px, t.py) < 0.3 ? t.stuck + 1 : 0;
	t.px = p.x;
	t.py = p.y;
	if (t.stuck >= STUCK_LIMIT) {
		if (t.back) {
			p.trip = undefined;
			return false;
		}
		t.back = true;
		t.stuck = 0;
	}
	if (!t.back && dist(p.x, p.y, t.x, t.y) <= 1.5) {
		const i = tileIndex(world.map, t.x, t.y);
		const none = new Set<number>();
		for (let got = 0; got < TRIP_LOAD && world.map.depositLeft[i] > 0; ) {
			got += gatherFrom(world, p, i, t.material, none);
		}
		t.back = true;
	}
	if (t.back && dist(p.x, p.y, v.x, v.y) <= CAMP_RADIUS - 1) {
		p.trip = undefined;
		return false;
	}
	const [gx, gy] = t.back ? [v.x, v.y] : [t.x, t.y];
	startActivity(p, 'walk', gx, gy, 1);
	return true;
}
