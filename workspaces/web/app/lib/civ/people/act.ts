// Carrying out what a person has chosen: walking, foraging, hunting,
// gathering, eating, talking, teaching, crafting and praying. One call is
// one tick of that activity.

import { ADULT_AGE, WALK_TILES_PER_TICK } from '../config';
import { knowledgeOf, resolve, matchIdea } from '../discovery/engine';
import { MATERIALS } from '../discovery/materials';
import { foodValue, isFood, isPoisonous, materialsFromDeposit } from '../discovery/sources';
import type { Rng } from '../rng';
import {
	Built,
	type Deposit,
	type ActivityKind,
	type Herd,
	type MaterialId,
	type Person,
	type Skill,
	type Village,
	type World
} from '../types';
import { CAMP_RADIUS, HURT_TEXT, atCamp, fallIll } from './needs';
import {
	addMemory,
	addStack,
	ageOf,
	bestFood,
	clamp01,
	countOf,
	dayOf,
	dist,
	indexOf,
	living,
	materialsAround,
	peopleNear,
	record,
	stillGood,
	takeStack,
	tileIndex,
	tileMaterials,
	walkable
} from './village';

// ---- tuning knobs
export const EAT_PER_VALUE = 0.045; // hunger eased per point of food value
export const PRACTICE_GAIN = 0.07; // mastery gained by each success
export const FIRST_LEARN = 0.2; // mastery after a first success
export const WATCH_GAIN = 0.05; // what onlookers pick up from a success
export const CARRY_FOOD_KEEP = 2; // food a person keeps on them at camp
const NOTE_EVERY_DAYS = 12; // art and ritual notes are rare
const PRAYER_EVERY_DAYS = 6;
const MURMUR = 0.55; // chance an idle experiment is worth a note

// ------------------------------------------------------------- starting

export function startActivity(
	p: Person,
	kind: ActivityKind,
	x: number,
	y: number,
	left: number,
	extra: { with?: number; craft?: { action: string; items: MaterialId[] } } = {}
) {
	p.activity = { kind, x, y, left, ...extra };
}

export function endActivity(p: Person) {
	p.activity = { kind: 'idle', x: p.x, y: p.y, left: 0 };
}

// ---------------------------------------------------------------- walking

const STEPS = [0, 0.785, -0.785, 1.57, -1.57];

// Walk toward a point, a tile at a time, going around sea and lakes.
// Returns whether the person is there, still on the way, or can't get there.
export function walkToward(
	world: World,
	p: Person,
	tx: number,
	ty: number,
	arrive = 0.9
): 'there' | 'moving' | 'stuck' {
	const { map } = world;
	if (dist(p.x, p.y, tx, ty) <= arrive) return 'there';
	const startX = p.x;
	const startY = p.y;
	let budget = WALK_TILES_PER_TICK;
	while (budget > 0) {
		const d = dist(p.x, p.y, tx, ty);
		if (d <= arrive) break;
		const len = Math.min(1, budget, d - arrive + 0.05);
		const base = Math.atan2(ty - p.y, tx - p.x);
		let moved = false;
		for (const turn of STEPS) {
			const nx = p.x + Math.cos(base + turn) * len;
			const ny = p.y + Math.sin(base + turn) * len;
			if (nx < 0 || ny < 0 || nx >= map.size || ny >= map.size) continue;
			if (!walkable(map, tileIndex(map, nx, ny))) continue;
			// never turn away from the goal
			if (turn !== 0 && dist(nx, ny, tx, ty) >= d) continue;
			p.x = nx;
			p.y = ny;
			moved = true;
			break;
		}
		if (!moved) break;
		budget -= len;
	}
	if (dist(p.x, p.y, tx, ty) <= arrive) return 'there';
	if (dist(p.x, p.y, startX, startY) < 0.5) return pathStep(world, p, tx, ty, arrive);
	return 'moving';
}

// When walking straight gets stuck on a shore, find a way round with a
// small breadth-first search over a window around both points.
function pathStep(
	world: World,
	p: Person,
	tx: number,
	ty: number,
	arrive: number
): 'there' | 'moving' | 'stuck' {
	const { map } = world;
	const pad = 24;
	const x0 = Math.max(0, Math.floor(Math.min(p.x, tx)) - pad);
	const y0 = Math.max(0, Math.floor(Math.min(p.y, ty)) - pad);
	const x1 = Math.min(map.size - 1, Math.floor(Math.max(p.x, tx)) + pad);
	const y1 = Math.min(map.size - 1, Math.floor(Math.max(p.y, ty)) + pad);
	const w = x1 - x0 + 1;
	const from = (Math.floor(p.y) - y0) * w + (Math.floor(p.x) - x0);
	const to = (Math.floor(ty) - y0) * w + (Math.floor(tx) - x0);
	if (from < 0 || to < 0) return 'stuck';
	const parent = new Int32Array(w * (y1 - y0 + 1)).fill(-2);
	parent[from] = -1;
	const queue = [from];
	let found = -1;
	for (let head = 0; head < queue.length && found < 0; head++) {
		const c = queue[head];
		const cx = c % w;
		const cy = (c - cx) / w;
		if (dist(cx + x0, cy + y0, tx, ty) <= arrive || c === to) {
			found = c;
			break;
		}
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const nx = cx + dx;
				const ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny > y1 - y0) continue;
				const n = ny * w + nx;
				if (parent[n] !== -2 || !walkable(map, (ny + y0) * map.size + nx + x0)) continue;
				parent[n] = c;
				queue.push(n);
			}
		}
	}
	if (found < 0) return 'stuck';
	const path: number[] = [];
	for (let c = found; c !== -1; c = parent[c]) path.push(c);
	path.reverse();
	const step = path[Math.min(path.length - 1, WALK_TILES_PER_TICK)];
	p.x = (step % w) + x0 + 0.5;
	p.y = Math.floor(step / w) + y0 + 0.5;
	return dist(p.x, p.y, tx, ty) <= arrive ? 'there' : 'moving';
}

// Walk toward the activity's goal. Returns true once there; a person who
// can't get there gives the activity up.
function approach(world: World, p: Person, arrive = 0.9): boolean {
	const a = p.activity;
	const state = walkToward(world, p, a.x, a.y, arrive);
	if (state === 'stuck') endActivity(p);
	return state === 'there';
}

// ------------------------------------------------------------- the camp

function village(world: World, p: Person): Village {
	return world.villages[p.village];
}

// Leave surplus at camp: everything but a little food and, for makers, what
// they are carrying for a job.
export function unload(world: World, p: Person) {
	const v = village(world, p);
	if (!v || !atCamp(world, p)) return;
	let kept = 0;
	const rest = [];
	for (const s of p.carrying) {
		if (isFood(s.material) && kept < CARRY_FOOD_KEEP) {
			const keep = Math.min(s.count, CARRY_FOOD_KEEP - kept);
			kept += keep;
			if (s.count > keep) addStack(v.store, s.material, s.count - keep);
			rest.push({ material: s.material, count: keep });
		} else {
			addStack(v.store, s.material, s.count);
		}
	}
	p.carrying = rest;
}

// -------------------------------------------------------------- eating

const COOKED: Record<string, MaterialId> = {
	'raw-meat': 'cooked-meat',
	fish: 'cooked-fish',
	roots: 'baked-roots'
};

// Eat up to `max` items from what's carried and, at camp, from the store.
export function eat(world: World, p: Person, max: number): number {
	const v = village(world, p);
	const camp = !!v && atCamp(world, p);
	let eaten = 0;
	while (eaten < max && p.needs.food < 0.92) {
		let from = p.carrying;
		let item = bestFood(from);
		if (!item && camp) {
			from = v.store;
			item = bestFood(from);
		}
		if (!item) break;
		takeStack(from, item, 1);
		// once the village cooks, a meal at camp is the cooked one
		const cooks = camp && v.heat >= 300 && v.customs.includes('first:cooking');
		const cooked = cooks ? COOKED[item] : undefined;
		p.needs.food = clamp01(p.needs.food + foodValue(cooked ?? item) * EAT_PER_VALUE);
		if (!cooked && (item === 'raw-meat' || item === 'fish') && world.tick % 29 === 0) {
			fallIll(world, p, 'eating raw meat');
		}
		eaten++;
	}
	return eaten;
}

// ------------------------------------------------------------- foraging

function skillUp(p: Person, skill: Skill, by = 0.012) {
	p.skills[skill] = clamp01(p.skills[skill] + by);
}

function see(p: Person, material: MaterialId, times = 1) {
	p.seen[material] = Math.min(60, (p.seen[material] ?? 0) + times);
}

function forage(world: World, rng: Rng, p: Person, changes: Set<number>) {
	const { map } = world;
	const i = tileIndex(map, p.activity.x, p.activity.y);
	const have = Math.min(map.plants[i], 0.3);
	if (have < 0.08) return;
	const foods = tileMaterials(map, i).filter((id) => isFood(id) || isPoisonous(id));
	if (foods.length === 0) return;
	map.plants[i] -= have;
	changes.add(i);
	skillUp(p, 'foraging');
	const choice = rng.pick(foods);
	// pale mushrooms look like food; the careful know better
	if (isPoisonous(choice) && !rng.chance(p.skills.foraging * 2)) {
		fallIll(world, p, 'eating a pale mushroom');
		return;
	}
	const safe = foods.filter((id) => !isPoisonous(id));
	const item = isPoisonous(choice) ? rng.pick(safe) : choice;
	if (!item) return;
	const units = Math.max(1, Math.round(have * (10 + p.skills.foraging * 10)));
	addStack(p.carrying, item, units);
	see(p, item);
	eat(world, p, 2);
}

function fish(world: World, rng: Rng, p: Person) {
	if (!rng.chance(0.4 + p.skills.foraging * 0.4 + (countOf(p.carrying, 'net') ? 0.2 : 0))) return;
	skillUp(p, 'foraging', 0.006);
	addStack(p.carrying, 'fish', rng.int(1, 2));
	see(p, 'fish');
	eat(world, p, 2);
}

// ------------------------------------------------------------- gathering

const WANTED_STOCK = ['flint', 'river-stone', 'clay', 'wood', 'branch', 'grass', 'earth', 'reed'];

// Take material from the tile under someone's feet. Returns how many units.
export function gatherFrom(
	world: World,
	p: Person,
	i: number,
	material: MaterialId,
	changes: Set<number>
): number {
	const { map } = world;
	let units = 1;
	if (
		map.depositLeft[i] > 0 &&
		materialsFromDeposit(map.deposit[i] as Deposit).includes(material)
	) {
		units = Math.min(map.depositLeft[i], 2);
		map.depositLeft[i] -= units;
	} else if (material === 'wood') {
		map.wood[i] = Math.max(0, map.wood[i] - 0.05);
		changes.add(i);
	} else if (material === 'branch') {
		map.wood[i] = Math.max(0, map.wood[i] - 0.01);
		changes.add(i);
		units = 2;
	} else if (isFood(material)) {
		map.plants[i] = Math.max(0, map.plants[i] - 0.05);
		changes.add(i);
	}
	addStack(p.carrying, material, units);
	see(p, material);
	return units;
}

// What the village is short of that this tile has
function wantedHere(world: World, p: Person, i: number): MaterialId | undefined {
	const v = village(world, p);
	const here = tileMaterials(world.map, i);
	const short = WANTED_STOCK.filter((id) => here.includes(id) && countOf(v.store, id) < 6);
	return short[0] ?? here[0];
}

function gather(world: World, p: Person, changes: Set<number>) {
	const i = tileIndex(world.map, p.activity.x, p.activity.y);
	const material = wantedHere(world, p, i);
	if (material) gatherFrom(world, p, i, material, changes);
	skillUp(p, 'crafting', 0.004);
	// handling a thing again and again is how people come to know it
	for (const id of tileMaterials(world.map, i)) see(p, id);
}

function wander(world: World, p: Person) {
	for (const id of materialsAround(world.map, p.x, p.y, 2)) see(p, id);
	p.needs.curiosity = clamp01(p.needs.curiosity + 0.3);
}

// ---------------------------------------------------------------- hunting

type Prey = { meat: number; danger: number; young?: MaterialId };
const PREY: Record<string, Prey> = {
	deer: { meat: 3, danger: 0.02 },
	aurochs: { meat: 6, danger: 0.12, young: 'calf' },
	boar: { meat: 3, danger: 0.09 },
	goat: { meat: 2, danger: 0.02, young: 'kid' },
	wolf: { meat: 2, danger: 0.14, young: 'pup' }
};

function huntBonus(world: World, p: Person): number {
	const v = village(world, p);
	const has = (id: string) => countOf(p.carrying, id) > 0 || (v && countOf(v.store, id) > 0);
	if (has('spear')) return 0.15;
	return ['flake', 'knife', 'hand-axe', 'stone-axe', 'scraper'].some(has) ? 0.05 : 0;
}

function hunt(world: World, rng: Rng, p: Person) {
	const herd = world.herds.find((h) => h.id === p.activity.with);
	if (!herd || herd.count <= 0) return;
	const prey = PREY[herd.kind] ?? PREY.deer;
	const chance = clamp01(
		0.3 + p.skills.hunting * 0.35 + p.traits.bold * 0.15 + huntBonus(world, p) - prey.danger
	);
	if (rng.chance(chance)) {
		herd.count--;
		killYields(world, rng, p, herd, prey);
		skillUp(p, 'hunting', 0.02);
		p.needs.respect = clamp01(p.needs.respect + 0.08);
	} else {
		// the herd bolts
		herd.x += rng.range(-5, 5);
		herd.y += rng.range(-5, 5);
		herd.x = Math.min(world.map.size - 1, Math.max(0, herd.x));
		herd.y = Math.min(world.map.size - 1, Math.max(0, herd.y));
		skillUp(p, 'hunting', 0.006);
	}
	if (rng.chance(prey.danger * (1 - p.skills.hunting * 0.5) * 0.7)) {
		p.health = Math.max(0, p.health - rng.range(0.2, 0.5));
		addMemory(world, p, `${HURT_TEXT} a ${herd.kind} and barely got away`, 0.8);
		p.needs.safety = Math.max(0, p.needs.safety - 0.3);
	}
}

function killYields(world: World, rng: Rng, p: Person, herd: Herd, prey: Prey) {
	addStack(p.carrying, 'raw-meat', prey.meat + rng.int(0, 1));
	addStack(p.carrying, 'hide', 1);
	if (rng.chance(0.7)) addStack(p.carrying, 'bone', 1);
	if (rng.chance(0.5)) addStack(p.carrying, 'sinew', 1);
	// sometimes a young one is taken alive
	if (prey.young && rng.chance(0.12)) {
		addStack(p.carrying, prey.young, 1);
		addMemory(world, p, `Brought home a ${MATERIALS[prey.young].name}`, 0.5);
	}
	for (const id of ['raw-meat', 'hide', 'bone', 'sinew']) see(p, id);
}

// ------------------------------------------------------------ socialising

function bondWith(a: Person, b: Person, rng: Rng) {
	const gain = 0.02 + 0.03 * (a.traits.kind + b.traits.kind) * 0.5 + rng.range(0, 0.02);
	for (const [x, y] of [
		[a, b],
		[b, a]
	] as const) {
		const r = (x.relations[y.id] ??= { trust: 0.3, affection: 0.3 });
		r.trust = clamp01(r.trust + gain * 0.8);
		r.affection = clamp01(r.affection + gain);
	}
}

// The best thing `teacher` knows that `learner` knows less of
export function teachable(teacher: Person, learner: Person): string | undefined {
	let best: string | undefined;
	let gap = 0.08;
	for (const [id, level] of Object.entries(teacher.knowledge)) {
		const diff = level - (learner.knowledge[id] ?? 0);
		if (diff > gap) {
			gap = diff;
			best = id;
		}
	}
	return best;
}

function teachOne(world: World, rng: Rng, teacher: Person, learner: Person) {
	const id = teachable(teacher, learner);
	if (!id) return;
	const young = ageOf(world, learner) < ADULT_AGE;
	const chance = 0.45 + teacher.skills.talking * 0.3 + learner.traits.curious * 0.25;
	if (!rng.chance(young ? chance + 0.2 : chance)) return;
	const have = learner.knowledge[id] ?? 0;
	const target = teacher.knowledge[id];
	learner.knowledge[id] = Math.min(target, have + 0.15 + (target - have) * 0.3);
	skillUp(teacher, 'talking', 0.01);
	teacher.needs.respect = clamp01(teacher.needs.respect + 0.05);
	if (have === 0)
		addMemory(world, learner, `${teacher.name} showed me ${id.replace(/-/g, ' ')}`, 0.4);
}

function socialize(world: World, rng: Rng, p: Person) {
	const other = living(world).find((o) => o.id === p.activity.with);
	if (!other || other.died !== undefined) return;
	bondWith(p, other, rng);
	p.needs.company = clamp01(p.needs.company + 0.3);
	other.needs.company = clamp01(other.needs.company + 0.2);
	skillUp(p, 'talking', 0.003);
	if (p.activity.kind === 'teach') teachOne(world, rng, p, other);
	else if (rng.chance(0.3)) teachOne(world, rng, other, p);
}

// ----------------------------------------------------------------- praying

// Prayer is rare: nobody in the world prays again within a few days of the
// last, so the chronicle isn't filled with them.
export function prayedRecently(world: World, _p: Person): boolean {
	const day = dayOf(world);
	for (let i = world.chronicle.length - 1; i >= 0 && i > world.chronicle.length - 60; i--) {
		const e = world.chronicle[i];
		if (day - e.day > PRAYER_EVERY_DAYS) return false;
		if (e.kind === 'prayer') return true;
	}
	return false;
}

function pray(world: World, p: Person) {
	if (prayedRecently(world, p)) return;
	const n = p.needs;
	const worst = (['food', 'water', 'warmth', 'safety'] as const).reduce((a, b) =>
		n[a] <= n[b] ? a : b
	);
	const asks: Record<string, string> = {
		food: 'for food',
		water: 'for water',
		warmth: 'against the cold',
		safety: 'for protection'
	};
	record(world, {
		kind: 'prayer',
		text: `${p.name} prayed ${asks[worst]}.`,
		people: [p.id]
	});
	n.safety = clamp01(n.safety + 0.1);
}

// ------------------------------------------------------------- crafting

const BUILT_FROM: Record<MaterialId, Built> = {
	kiln: Built.kiln,
	furnace: Built.furnace,
	field: Built.field,
	'seed-store': Built.store,
	'lean-to': Built.hut,
	fence: Built.pen
};

const TAMED: Record<MaterialId, string> = {
	'tame-goat': 'goat',
	dog: 'dog',
	'tame-aurochs': 'aurochs'
};

// a free tile beside the village, working outward
function freeSpot(world: World, v: Village): number | undefined {
	const { map } = world;
	const cx = Math.floor(v.x);
	const cy = Math.floor(v.y);
	for (let r = 1; r <= 8; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const x = cx + dx;
				const y = cy + dy;
				if (x < 0 || y < 0 || x >= map.size || y >= map.size) continue;
				const i = y * map.size + x;
				if (map.built[i] === Built.none && walkable(map, i) && map.water[i] === 0) return i;
			}
		}
	}
	return undefined;
}

// Some products are places or animals rather than things to carry. Returns
// whether the product was handled that way.
function placeProduct(
	world: World,
	v: Village,
	material: MaterialId,
	changes: Set<number>,
	nextHerd: () => number
): boolean {
	const built = BUILT_FROM[material];
	if (built !== undefined) {
		const i = freeSpot(world, v);
		if (i !== undefined) {
			world.map.built[i] = built;
			changes.add(i);
		}
		if (built === Built.hut && !v.customs.includes('shelter')) v.customs.push('shelter');
		return true;
	}
	const kind = TAMED[material];
	if (kind) {
		world.herds.push({
			id: nextHerd(),
			kind,
			x: v.x + 2,
			y: v.y + 2,
			count: 2,
			tame: true,
			village: v.id
		});
		return true;
	}
	return false;
}

function nextHerdId(world: World): number {
	return world.herds.reduce((m, h) => Math.max(m, h.id), 0) + 1;
}

// counts of each material a try needs in hand
function needed(items: MaterialId[]): Map<MaterialId, number> {
	const out = new Map<MaterialId, number>();
	for (const id of items) out.set(id, (out.get(id) ?? 0) + 1);
	return out;
}

// Bring what the try needs into hand: from the store at camp, or from the
// nearest tile that has it. Returns what is still missing, if anything.
function fetchInputs(
	world: World,
	p: Person,
	items: MaterialId[],
	changes: Set<number>
): { missing?: MaterialId; walking?: boolean } {
	const v = village(world, p);
	for (const [id, n] of needed(items)) {
		let short = n - countOf(p.carrying, id);
		if (short <= 0) continue;
		if (atCamp(world, p)) {
			const got = takeStack(v.store, id, short);
			addStack(p.carrying, id, got);
			short -= got;
			if (short <= 0) continue;
		}
		const spot = nearestSource(world, p, id);
		if (spot === undefined) return { missing: id };
		const sx = (spot % world.map.size) + 0.5;
		const sy = Math.floor(spot / world.map.size) + 0.5;
		const state = walkToward(world, p, sx, sy, 0.9);
		if (state === 'stuck') return { missing: id };
		if (state === 'there') gatherFrom(world, p, spot, id, changes);
		return { walking: true };
	}
	return {};
}

export function nearestSource(world: World, p: Person, material: MaterialId): number | undefined {
	const list = indexOf(world, village(world, p)).materials.get(material);
	if (!list) return undefined;
	let best: number | undefined;
	let bestD = Infinity;
	for (const i of list) {
		if (!stillGood(world.map, material, i)) continue;
		const d = dist(p.x, p.y, (i % world.map.size) + 0.5, Math.floor(i / world.map.size) + 0.5);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

function craft(world: World, rng: Rng, p: Person, changes: Set<number>) {
	const a = p.activity;
	const v = village(world, p);
	if (!a.craft || !v) return endActivity(p);
	const { action, items } = a.craft;
	// patience runs out
	if (--a.left <= 0) return endActivity(p);

	const fetched = fetchInputs(world, p, items, changes);
	if (fetched.missing) return endActivity(p);
	if (fetched.walking) return;
	// the work is done at camp, where the fire is
	if (!atCamp(world, p)) {
		const state = walkToward(world, p, v.x, v.y, CAMP_RADIUS - 1);
		if (state === 'stuck') endActivity(p);
		return;
	}
	attempt(world, rng, p, v, action, items, changes);
	endActivity(p);
}

function attempt(
	world: World,
	rng: Rng,
	p: Person,
	v: Village,
	action: string,
	items: MaterialId[],
	changes: Set<number>
) {
	const known = knowledgeOf(action, items);
	const outcome = resolve(
		{ action, items, heat: v.heat, skill: known ? (p.knowledge[known] ?? 0) : 0 },
		rng
	);
	for (const id of items) see(p, id);
	const rule = matchIdea(action, items);
	if (rule) skillUp(p, rule.skill, outcome.result === 'success' ? 0.015 : 0.005);

	if (outcome.result === 'nothing') {
		murmur(world, rng, p, action, items);
		return;
	}
	for (const s of outcome.consumes) takeStack(p.carrying, s.material, s.count);
	if (outcome.result === 'fail') return;

	let nextId = nextHerdId(world);
	for (const s of outcome.produces) {
		for (let n = 0; n < s.count; n++) {
			if (placeProduct(world, v, s.material, changes, () => nextId++)) continue;
			addStack(p.carrying, s.material, 1);
		}
		see(p, s.material, 2);
	}
	p.needs.curiosity = clamp01(p.needs.curiosity + 0.4);
	p.needs.respect = clamp01(p.needs.respect + 0.05);
	if (outcome.learns) learn(world, p, v, outcome.learns, outcome.reason);
}

function learn(world: World, p: Person, v: Village, id: string, text: string) {
	const had = p.knowledge[id] ?? 0;
	p.knowledge[id] = had > 0 ? Math.min(1, had + PRACTICE_GAIN) : FIRST_LEARN;
	// onlookers pick a little of it up
	for (const w of peopleNear(world, p.x, p.y, 3, p)) {
		if (w.activity.kind === 'sleep') continue;
		const theirs = w.knowledge[id] ?? 0;
		if (theirs < p.knowledge[id]) {
			w.knowledge[id] = Math.min(p.knowledge[id], theirs + (theirs > 0 ? WATCH_GAIN : 0.1));
		}
	}
	const key = `first:${id}`;
	if (v.customs.includes(key)) return;
	v.customs.push(key);
	addMemory(world, p, `Discovered how: ${text}`, 1);
	p.needs.respect = clamp01(p.needs.respect + 0.2);
	record(world, {
		kind: 'first',
		text: `${p.name} ${text}.`,
		people: [p.id],
		standout: true
	});
}

// An experiment nothing answers sometimes becomes art or ritual
const NOTE_LINES = [
	(n: string, i: string) => `${n} painted the rock with ${i}.`,
	(n: string, i: string) => `${n} laid ${i} out in a ring and sat watching it.`,
	(n: string, i: string) => `${n} pressed ${i} into the ground, over and over.`
];

function murmur(world: World, rng: Rng, p: Person, _action: string, items: MaterialId[]) {
	const day = dayOf(world);
	const last = [...world.chronicle]
		.reverse()
		.slice(0, 40)
		.find((e) => e.kind === 'note');
	if (last && day - last.day < NOTE_EVERY_DAYS) return;
	if (!rng.chance(MURMUR * 0.3)) return;
	const what = MATERIALS[items[0]]?.name ?? 'a stone';
	record(world, { kind: 'note', text: rng.pick(NOTE_LINES)(p.name, what), people: [p.id] });
}

// ------------------------------------------------------------------ act

// One tick of what a person is doing
export function act(world: World, rng: Rng, p: Person, changes: Set<number>) {
	const a = p.activity;
	switch (a.kind) {
		case 'idle':
			return;
		case 'sleep':
			walkToward(world, p, a.x, a.y, CAMP_RADIUS - 1);
			if (--a.left <= 0) endActivity(p);
			return;
		case 'craft':
			craft(world, rng, p, changes);
			return;
		case 'hunt': {
			// the herd drifts while we walk
			const herd = world.herds.find((h) => h.id === a.with);
			if (herd) {
				a.x = herd.x;
				a.y = herd.y;
			}
			if (!approach(world, p, 2)) return;
			hunt(world, rng, p);
			endActivity(p);
			return;
		}
		case 'socialize':
		case 'teach': {
			const other = living(world).find((o) => o.id === a.with);
			if (other) {
				a.x = other.x;
				a.y = other.y;
			}
			if (!approach(world, p, 2.5)) return;
			socialize(world, rng, p);
			endActivity(p);
			return;
		}
		default:
			break;
	}
	if (!approach(world, p, a.kind === 'eat' ? CAMP_RADIUS - 1 : 0.9)) return;
	switch (a.kind) {
		case 'drink':
			p.needs.water = clamp01(p.needs.water + 0.7);
			break;
		case 'forage':
			forage(world, rng, p, changes);
			break;
		case 'fish':
			fish(world, rng, p);
			break;
		case 'gather':
			gather(world, p, changes);
			break;
		case 'eat':
			eat(world, p, 4);
			break;
		case 'wander':
			wander(world, p);
			break;
		case 'pray':
			pray(world, p);
			break;
		default:
			break;
	}
	if (--a.left <= 0 && p.activity === a) endActivity(p);
	if (p.activity.kind !== 'craft') unload(world, p);
}
