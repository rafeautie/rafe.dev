// Shared helpers for the people systems: stacks of things, walking on the
// map, who is near whom, and a cheap per-village list of useful tiles so
// that nobody scans the whole map to find water.

import { DAYS_PER_YEAR, TICKS_PER_DAY } from '../config';
import { foodValue, isFood, materialsFromDeposit, materialsFromTile } from '../discovery/sources';
import {
	Biome,
	type Deposit,
	type Ground,
	Water,
	type ChronicleEvent,
	type MaterialId,
	type Person,
	type Stack,
	type Village,
	type World,
	type WorldMap
} from '../types';

// ------------------------------------------------------------------ time

export const dayOf = (world: World) => Math.floor(world.tick / TICKS_PER_DAY);
export const phaseOf = (world: World) => world.tick % TICKS_PER_DAY;
export const isNight = (world: World) => phaseOf(world) === TICKS_PER_DAY - 1;
export const ageOf = (world: World, p: Person) => (dayOf(world) - p.born) / DAYS_PER_YEAR;
export const isAlive = (p: Person) => p.died === undefined;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const dist = (ax: number, ay: number, bx: number, by: number) =>
	Math.hypot(ax - bx, ay - by);

// ---------------------------------------------------------------- stacks

export function countOf(stacks: Stack[], material: MaterialId): number {
	for (const s of stacks) if (s.material === material) return s.count;
	return 0;
}

export function addStack(stacks: Stack[], material: MaterialId, count: number) {
	if (count <= 0) return;
	const have = stacks.find((s) => s.material === material);
	if (have) have.count += count;
	else stacks.push({ material, count });
}

// takes up to `count`, returns how many were taken
export function takeStack(stacks: Stack[], material: MaterialId, count: number): number {
	const i = stacks.findIndex((s) => s.material === material);
	if (i < 0) return 0;
	const taken = Math.min(count, stacks[i].count);
	stacks[i].count -= taken;
	if (stacks[i].count <= 0) stacks.splice(i, 1);
	return taken;
}

export function foodCount(stacks: Stack[]): number {
	let n = 0;
	for (const s of stacks) if (isFood(s.material)) n += s.count;
	return n;
}

// the best thing to eat: the most filling, but spoiling things first
export function bestFood(stacks: Stack[]): MaterialId | undefined {
	let best: MaterialId | undefined;
	let bestScore = 0;
	for (const s of stacks) {
		const value = foodValue(s.material);
		if (value <= 0 || s.count <= 0) continue;
		if (value > bestScore) {
			bestScore = value;
			best = s.material;
		}
	}
	return best;
}

// ------------------------------------------------------------ memories

const MEMORY_KEEP = 12;

export function addMemory(world: World, p: Person, text: string, weight: number) {
	p.memories.push({ day: dayOf(world), text, weight });
	if (p.memories.length <= MEMORY_KEEP) return;
	// forget the least weighty, oldest first
	let drop = 0;
	for (let i = 1; i < p.memories.length; i++) {
		if (p.memories[i].weight < p.memories[drop].weight) drop = i;
	}
	p.memories.splice(drop, 1);
}

export function record(world: World, event: Omit<ChronicleEvent, 'day'>) {
	world.chronicle.push({ day: dayOf(world), ...event });
}

// ------------------------------------------------------------- the map

export function tileIndex(map: WorldMap, x: number, y: number): number {
	const tx = Math.min(map.size - 1, Math.max(0, Math.floor(x)));
	const ty = Math.min(map.size - 1, Math.max(0, Math.floor(y)));
	return ty * map.size + tx;
}

// Sea and lakes stop people; rivers can be waded
export function walkable(map: WorldMap, i: number): boolean {
	return map.water[i] !== Water.sea && map.water[i] !== Water.lake && map.biome[i] !== Biome.ocean;
}

const isFresh = (map: WorldMap, i: number) =>
	map.water[i] === Water.river || map.water[i] === Water.lake || map.water[i] === Water.spring;

// Whether a tile is on or beside fresh water (a place to drink)
export function besideWater(map: WorldMap, i: number): boolean {
	if (isFresh(map, i)) return true;
	const { size } = map;
	const x = i % size;
	const y = (i - x) / size;
	return (
		(x > 0 && isFresh(map, i - 1)) ||
		(x < size - 1 && isFresh(map, i + 1)) ||
		(y > 0 && isFresh(map, i - size)) ||
		(y < size - 1 && isFresh(map, i + size))
	);
}

// what a tile can give, remembered by kind of ground so it costs nothing
const tileCache = new Map<number, MaterialId[]>();

export function tileMaterials(map: WorldMap, i: number): MaterialId[] {
	const wood = map.wood[i];
	const bucket = wood > 0.35 ? 2 : wood > 0.2 ? 1 : 0;
	const key = map.biome[i] | (map.ground[i] << 4) | (map.water[i] << 7) | (bucket << 10);
	let list = tileCache.get(key);
	if (!list) {
		list = materialsFromTile(
			map.biome[i] as Biome,
			map.ground[i] as Ground,
			map.water[i] as Water,
			[0.1, 0.3, 0.5][bucket]
		);
		tileCache.set(key, list);
	}
	if (map.deposit[i] === 0 || map.depositLeft[i] === 0) return list;
	return [...list, ...materialsFromDeposit(map.deposit[i] as Deposit)];
}

// materials on tiles within `radius` of a point
export function materialsAround(map: WorldMap, x: number, y: number, radius: number) {
	const found = new Set<MaterialId>();
	const cx = Math.floor(x);
	const cy = Math.floor(y);
	for (let dy = -radius; dy <= radius; dy++) {
		for (let dx = -radius; dx <= radius; dx++) {
			const tx = cx + dx;
			const ty = cy + dy;
			if (tx < 0 || ty < 0 || tx >= map.size || ty >= map.size) continue;
			for (const id of tileMaterials(map, ty * map.size + tx)) found.add(id);
		}
	}
	return found;
}

// -------------------------------------------------------------- crowds

// People bucketed into 4x4 tile blocks each tick, so "who is near me" never
// means looking at everyone.
type Crowd = { tick: number; size: number; list: Person[]; blocks: Map<number, Person[]> };
const crowds = new WeakMap<World, Crowd>();

const block = (x: number, y: number) => (Math.floor(y / 4) << 12) | Math.floor(x / 4);

export function refreshLiving(world: World) {
	const list = world.people.filter(isAlive);
	const blocks = new Map<number, Person[]>();
	for (const p of list) {
		const key = block(p.x, p.y);
		const there = blocks.get(key);
		if (there) there.push(p);
		else blocks.set(key, [p]);
	}
	crowds.set(world, { tick: world.tick, size: world.people.length, list, blocks });
}

function crowdOf(world: World): Crowd {
	let crowd = crowds.get(world);
	if (!crowd || crowd.size !== world.people.length || crowd.tick !== world.tick) {
		refreshLiving(world);
		crowd = crowds.get(world) as Crowd;
	}
	return crowd;
}

export function living(world: World): Person[] {
	return crowdOf(world).list;
}

// living people within `radius` tiles of a point, not counting `except`
export function peopleNear(
	world: World,
	x: number,
	y: number,
	radius: number,
	except?: Person
): Person[] {
	const { blocks } = crowdOf(world);
	const out: Person[] = [];
	const reach = Math.ceil(radius / 4);
	const bx = Math.floor(x / 4);
	const by = Math.floor(y / 4);
	for (let j = by - reach; j <= by + reach; j++) {
		for (let i = bx - reach; i <= bx + reach; i++) {
			const there = i < 0 || j < 0 ? undefined : blocks.get((j << 12) | i);
			if (!there) continue;
			for (const p of there) {
				if (p === except || p.died !== undefined) continue;
				if (dist(p.x, p.y, x, y) <= radius) out.push(p);
			}
		}
	}
	return out;
}

// ----------------------------------------------------- resource lists

// Tiles around a village worth walking to, nearest first by walking
// distance, and only ones that can be reached on foot.
export type Index = {
	builtAt: number;
	plants: number[];
	water: number[];
	materials: Map<MaterialId, number[]>;
};

export const INDEX_RADIUS = 60;
const REFRESH_TICKS = 32; // every eight days
const PER_MATERIAL = 20;
const MAX_PLANTS = 90;
const MAX_WATER = 30;

const W = INDEX_RADIUS * 2 + 1;
const queue = new Int32Array(W * W);
const stamp = new Uint32Array(W * W);
let stampNow = 0;
const indexes = new WeakMap<Village, Index>();

function build(world: World, v: Village): Index {
	const { map } = world;
	const index: Index = { builtAt: world.tick, plants: [], water: [], materials: new Map() };
	const sx = Math.floor(v.x);
	const sy = Math.floor(v.y);
	const local = (x: number, y: number) => (y - sy + INDEX_RADIUS) * W + (x - sx + INDEX_RADIUS);
	stampNow++;
	let head = 0;
	let tail = 0;
	queue[tail++] = sy * map.size + sx;
	stamp[local(sx, sy)] = stampNow;
	while (head < tail) {
		const i = queue[head++];
		const x = i % map.size;
		const y = (i - x) / map.size;
		visit(map, index, i);
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= map.size || ny >= map.size) continue;
				if (Math.abs(nx - sx) > INDEX_RADIUS || Math.abs(ny - sy) > INDEX_RADIUS) continue;
				const l = local(nx, ny);
				if (stamp[l] === stampNow) continue;
				const ni = ny * map.size + nx;
				if (!walkable(map, ni)) continue;
				stamp[l] = stampNow;
				queue[tail++] = ni;
			}
		}
	}
	return index;
}

function visit(map: WorldMap, index: Index, i: number) {
	const here = tileMaterials(map, i);
	// plants only count where something edible grows (reeds are not a meal)
	if (map.plants[i] >= 0.25 && index.plants.length < MAX_PLANTS && here.some(isFood)) {
		index.plants.push(i);
	}
	const wet = index.water.length < MAX_WATER && besideWater(map, i);
	if (wet) index.water.push(i);
	for (const id of here) {
		let list = index.materials.get(id);
		if (!list) index.materials.set(id, (list = []));
		if (list.length < PER_MATERIAL) list.push(i);
	}
	if (wet) {
		let list = index.materials.get('water');
		if (!list) index.materials.set('water', (list = []));
		if (list.length < PER_MATERIAL) list.push(i);
	}
}

export function indexOf(world: World, v: Village): Index {
	let index = indexes.get(v);
	if (!index || world.tick - index.builtAt >= REFRESH_TICKS) {
		index = build(world, v);
		indexes.set(v, index);
	}
	return index;
}

// Is a listed tile still worth the walk? Depleted ones are skipped until the
// next refresh.
export function stillGood(map: WorldMap, material: MaterialId | 'plants', i: number): boolean {
	if (material === 'plants') return map.plants[i] >= 0.15;
	if (material === 'water') return true;
	return tileMaterials(map, i).includes(material);
}

// ----------------------------------------------------------- the village

export const hasShelter = (v: Village) => v.customs.includes('shelter');

export function villageOf(world: World, p: Person): Village {
	return world.villages[p.village];
}

// the best know-how anyone alive in a village has, by id
export function mergedKnowledge(world: World, v: Village): Record<string, number> {
	const merged: Record<string, number> = {};
	for (const p of living(world)) {
		if (p.village !== v.id) continue;
		for (const [id, level] of Object.entries(p.knowledge)) {
			if (level > (merged[id] ?? 0)) merged[id] = level;
		}
	}
	return merged;
}
