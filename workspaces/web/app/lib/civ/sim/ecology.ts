// The living land, once a day: plants and wood grow back, herds wander,
// breed and starve, and stored food goes off.

import { DAYS_PER_YEAR, season } from '../config';
import { spoilsInDays } from '../discovery/sources';
import type { Rng } from '../rng';
import { Biome, Water, type Herd, type Stack, type World } from '../types';
import { dist, living, tileIndex, walkable } from '../people/village';
import { growthFactor } from './weather';

// ---- tuning knobs
// plants regrow in a few days' steps, inside this range of any village
const ACTIVE_RADIUS = 64;
const PLANT_STEP_DAYS = 4;
// how fast plants return, by season (spring..winter)
const SEASON_GROWTH = [1.5, 1.2, 0.8, 0.05];
const PLANT_RATE = 0.03;
// the most plants a biome carries, as a share of the ground's fertility
const BIOME_PLANTS: Record<number, number> = {
	[Biome.grassland]: 1,
	[Biome.wetland]: 0.9,
	[Biome.forest]: 0.8,
	[Biome.scrub]: 0.6,
	[Biome.hills]: 0.4,
	[Biome.coast]: 0.4,
	[Biome.mountain]: 0.1
};
const BIOME_WOOD: Record<number, number> = {
	[Biome.forest]: 0.9,
	[Biome.scrub]: 0.5,
	[Biome.hills]: 0.3,
	[Biome.wetland]: 0.2
};
const WOOD_RATE = 0.0015;
// most a herd of each kind grows to
const HERD_MAX: Record<string, number> = { deer: 14, aurochs: 10, boar: 8, goat: 12, wolf: 5 };
const HERD_BREED = 0.35;
// wolves keep this far from a camp, where people and fire are
const WOLF_KEEPS_OFF = 14;
// fewer wild herds than this and a new one wanders in
const MIN_WILD_HERDS = 6;

// ---------------------------------------------------------------- plants

function regrow(world: World, day: number, changes: Set<number>) {
	const { map } = world;
	const s = season(day);
	const rate = PLANT_RATE * SEASON_GROWTH[s] * growthFactor(world.weather) * PLANT_STEP_DAYS;
	const winterKill = s === 3 ? 0.985 : 1;
	const done: { x: number; y: number }[] = [];
	for (const v of world.villages) {
		if (!living(world).some((p) => p.village === v.id)) continue;
		if (done.some((d) => dist(d.x, d.y, v.x, v.y) < ACTIVE_RADIUS)) continue;
		done.push(v);
		const x0 = Math.max(0, Math.floor(v.x) - ACTIVE_RADIUS);
		const x1 = Math.min(map.size - 1, Math.floor(v.x) + ACTIVE_RADIUS);
		const y0 = Math.max(0, Math.floor(v.y) - ACTIVE_RADIUS);
		const y1 = Math.min(map.size - 1, Math.floor(v.y) + ACTIVE_RADIUS);
		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				const i = y * map.size + x;
				if (map.water[i] === Water.sea || map.biome[i] === Biome.ocean) continue;
				growTile(world, i, rate, winterKill, changes);
			}
		}
	}
}

function growTile(world: World, i: number, rate: number, winterKill: number, changes: Set<number>) {
	const { map } = world;
	const cap = (0.3 + 0.7 * map.fertility[i]) * (BIOME_PLANTS[map.biome[i]] ?? 0.2);
	const before = map.plants[i];
	let next = before * winterKill;
	if (next < cap) {
		const wet = 0.3 + map.moisture[i];
		next = Math.min(cap, next + rate * wet * (0.25 + next) * (1 - next / cap));
	}
	const woodCap = BIOME_WOOD[map.biome[i]] ?? 0;
	const woodBefore = map.wood[i];
	if (woodCap > 0 && woodBefore < woodCap) {
		map.wood[i] = Math.min(woodCap, woodBefore + WOOD_RATE * PLANT_STEP_DAYS);
	}
	map.plants[i] = next;
	if (Math.abs(next - before) > 0.002 || map.wood[i] !== woodBefore) changes.add(i);
}

// ----------------------------------------------------------------- herds

function nextHerdId(world: World): number {
	return world.herds.reduce((m, h) => Math.max(m, h.id), 0) + 1;
}

// the camp a wolf is too close to, if any
function campNear(world: World, x: number, y: number) {
	return world.villages.find((v) => dist(v.x, v.y, x, y) < WOLF_KEEPS_OFF);
}

function wanderHerd(world: World, rng: Rng, h: Herd, changes: Set<number>) {
	const { map } = world;
	if (h.tame) {
		const v = h.village === undefined ? undefined : world.villages[h.village];
		if (v && dist(h.x, h.y, v.x, v.y) > 4) {
			h.x += Math.sign(v.x - h.x);
			h.y += Math.sign(v.y - h.y);
		}
		return;
	}
	// look at a few places nearby and go toward the greenest
	let bestX = h.x;
	let bestY = h.y;
	let bestScore = -Infinity;
	for (let k = 0; k < 4; k++) {
		const x = Math.min(map.size - 1, Math.max(0, h.x + rng.range(-3, 3)));
		const y = Math.min(map.size - 1, Math.max(0, h.y + rng.range(-3, 3)));
		const i = tileIndex(map, x, y);
		if (!walkable(map, i) || map.water[i] !== Water.none) continue;
		if (h.kind === 'wolf' && campNear(world, x, y)) continue;
		const score = map.plants[i] + rng.range(0, 0.3);
		if (score > bestScore) {
			bestScore = score;
			bestX = x;
			bestY = y;
		}
	}
	h.x = bestX;
	h.y = bestY;
	// grazing
	if (h.kind !== 'wolf') {
		const i = tileIndex(map, h.x, h.y);
		map.plants[i] = Math.max(0, map.plants[i] - 0.004 * h.count);
		changes.add(i);
	}
}

function huntHerds(world: World, rng: Rng, wolves: Herd) {
	for (const h of world.herds) {
		if (h === wolves || h.kind === 'wolf' || h.tame || h.count <= 0) continue;
		if (dist(h.x, h.y, wolves.x, wolves.y) < 4 && rng.chance(0.08)) h.count--;
	}
}

function seekPrey(world: World, wolves: Herd) {
	let best: Herd | undefined;
	let bestD = 20;
	for (const h of world.herds) {
		if (h.kind === 'wolf' || h.tame || h.count <= 0) continue;
		const d = dist(h.x, h.y, wolves.x, wolves.y);
		if (d < bestD) {
			bestD = d;
			best = h;
		}
	}
	if (best) {
		const x = wolves.x + Math.sign(best.x - wolves.x);
		const y = wolves.y + Math.sign(best.y - wolves.y);
		if (!campNear(world, x, y)) {
			wolves.x = x;
			wolves.y = y;
		}
	}
}

function breed(world: World, rng: Rng) {
	for (const h of world.herds) {
		if (h.tame) continue;
		const max = HERD_MAX[h.kind] ?? 8;
		const i = tileIndex(world.map, h.x, h.y);
		const graze = Math.min(1, world.map.plants[i] * 2 + 0.2);
		const calves = Math.round(h.count * HERD_BREED * graze + rng.range(0, 0.6));
		h.count = Math.min(max, h.count + calves);
	}
	// herds wander in from elsewhere when the land is nearly empty of them
	const wild = world.herds.filter((h) => h.kind !== 'wolf' && !h.tame && h.count > 0).length;
	if (wild >= MIN_WILD_HERDS) return;
	for (let tries = 0; tries < 40; tries++) {
		const x = rng.int(0, world.map.size - 1);
		const y = rng.int(0, world.map.size - 1);
		const i = y * world.map.size + x;
		const biome = world.map.biome[i];
		if (biome !== Biome.grassland && biome !== Biome.forest) continue;
		if (world.villages.some((v) => dist(v.x, v.y, x, y) < 25)) continue;
		world.herds.push({
			id: nextHerdId(world),
			kind: rng.pick(['deer', 'aurochs', 'boar']),
			x,
			y,
			count: rng.int(3, 5),
			tame: false
		});
		return;
	}
}

function herds(world: World, rng: Rng, day: number, changes: Set<number>) {
	for (const h of world.herds) {
		if (h.count <= 0) continue;
		wanderHerd(world, rng, h, changes);
		if (h.kind === 'wolf') {
			// a pack that strays close to camp is driven back
			const camp = campNear(world, h.x, h.y);
			if (camp) {
				h.x = Math.min(world.map.size - 1, Math.max(0, h.x + Math.sign(h.x - camp.x) * 2));
				h.y = Math.min(world.map.size - 1, Math.max(0, h.y + Math.sign(h.y - camp.y) * 2));
			}
			seekPrey(world, h);
			huntHerds(world, rng, h);
		}
		// a hungry winter thins the weakest
		if (season(day) === 3 && !h.tame && rng.chance(0.03) && h.count > 1) h.count--;
	}
	// herds breed on the first day of spring
	if (day % DAYS_PER_YEAR === 0) breed(world, rng);
	world.herds = world.herds.filter((h) => h.count > 0);
}

// --------------------------------------------------------------- spoilage

function spoil(stacks: Stack[], rng: Rng) {
	for (let i = stacks.length - 1; i >= 0; i--) {
		const days = spoilsInDays(stacks[i].material);
		if (days === undefined) continue;
		const expected = stacks[i].count / days;
		let lost = Math.floor(expected);
		if (rng.chance(expected - lost)) lost++;
		stacks[i].count -= lost;
		if (stacks[i].count <= 0) stacks.splice(i, 1);
	}
}

// ------------------------------------------------------------- the day

export function dailyEcology(world: World, rng: Rng, day: number, changes: Set<number>) {
	if (day % PLANT_STEP_DAYS === 0) regrow(world, day, changes);
	herds(world, rng, day, changes);
	for (const v of world.villages) spoil(v.store, rng);
	for (const p of living(world)) spoil(p.carrying, rng);
}
