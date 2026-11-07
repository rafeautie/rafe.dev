import { describe, expect, it } from 'vitest';
import { MAP_SIZE, SEA_LEVEL } from '../config';
import { Biome, Deposit, Ground, Water, type WorldMap } from '../types';
import { findStart, generateWorld } from './generate';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// worlds are slow to build, so build each seed once
const cache = new Map<number, WorldMap>();
function world(seed: number): WorldMap {
	let map = cache.get(seed);
	if (!map) {
		map = generateWorld(seed);
		cache.set(seed, map);
	}
	return map;
}

function count(array: ArrayLike<number>, value: number): number {
	let total = 0;
	for (let i = 0; i < array.length; i++) if (array[i] === value) total++;
	return total;
}

// groups of touching tiles (diagonals count) that pass `test`
function blobs(map: WorldMap, test: (i: number) => boolean): number[][] {
	const { size } = map;
	const seen = new Uint8Array(size * size);
	const groups: number[][] = [];
	for (let s = 0; s < size * size; s++) {
		if (seen[s] || !test(s)) continue;
		const group: number[] = [];
		const stack = [s];
		seen[s] = 1;
		while (stack.length > 0) {
			const c = stack.pop() as number;
			group.push(c);
			const x = c % size;
			const y = (c - x) / size;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
					const j = ny * size + nx;
					if (!seen[j] && test(j)) {
						seen[j] = 1;
						stack.push(j);
					}
				}
			}
		}
		groups.push(group);
	}
	return groups;
}

function touches(map: WorldMap, group: number[], waters: number[]): boolean {
	const { size } = map;
	for (const c of group) {
		const x = c % size;
		const y = (c - x) / size;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
				if (waters.includes(map.water[ny * size + nx])) return true;
			}
		}
	}
	return false;
}

describe('generateWorld', { timeout: 60_000 }, () => {
	it('repeats from the same seed', () => {
		const a = generateWorld(42, 96);
		const b = generateWorld(42, 96);
		for (const key of Object.keys(a) as (keyof WorldMap)[]) {
			expect(b[key], key).toEqual(a[key]);
		}
	});

	it('differs between seeds', () => {
		const a = generateWorld(1, 96);
		const b = generateWorld(2, 96);
		expect(b.height).not.toEqual(a.height);
		expect(b.water).not.toEqual(a.water);
	});

	it('fills every layer to size squared', () => {
		const map = world(1);
		const n = MAP_SIZE * MAP_SIZE;
		expect(map.size).toBe(MAP_SIZE);
		expect(map.seed).toBe(1);
		for (const key of Object.keys(map) as (keyof WorldMap)[]) {
			const layer = map[key];
			if (typeof layer !== 'number') expect(layer.length, key).toBe(n);
		}
		expect(count(map.built, 0)).toBe(n);
	});

	it('keeps values in range', () => {
		const map = world(3);
		for (let i = 0; i < map.height.length; i++) {
			for (const layer of [map.height, map.moisture, map.fertility, map.plants, map.wood]) {
				expect(layer[i]).toBeGreaterThanOrEqual(0);
				expect(layer[i]).toBeLessThanOrEqual(1);
			}
			if (map.water[i] !== Water.sea) {
				expect(map.temperature[i]).toBeGreaterThan(-5);
				expect(map.temperature[i]).toBeLessThan(20);
			}
		}
	});

	it('is 55 to 80 percent land, with sea at the edge', () => {
		for (const seed of SEEDS) {
			const map = world(seed);
			const n = map.size * map.size;
			const land = 1 - count(map.water, Water.sea) / n;
			expect(land, `seed ${seed}`).toBeGreaterThan(0.55);
			expect(land, `seed ${seed}`).toBeLessThan(0.8);
			// sea means below sea level, and the other way round
			let wrong = 0;
			for (let i = 0; i < n; i++) {
				const sea = map.water[i] === Water.sea;
				if (sea !== (map.biome[i] === Biome.ocean) || sea !== map.height[i] < SEA_LEVEL) wrong++;
			}
			expect(wrong, `seed ${seed}`).toBe(0);
		}
	});

	it('runs rivers down to the sea or a lake', () => {
		for (const seed of SEEDS) {
			const map = world(seed);
			const chains = blobs(
				map,
				(i) => map.water[i] === Water.river || map.water[i] === Water.spring
			);
			const reaching = chains.filter(
				(g) => g.length >= 20 && touches(map, g, [Water.sea, Water.lake])
			);
			expect(reaching.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
			expect(count(map.water, Water.lake), `seed ${seed}`).toBeGreaterThan(0);
			expect(count(map.water, Water.spring), `seed ${seed}`).toBeGreaterThan(0);
		}
	});

	it('flows downhill along rivers', () => {
		const map = world(2);
		const { size } = map;
		let steps = 0;
		let stuck = 0;
		for (let i = 0; i < size * size; i++) {
			if (map.water[i] !== Water.river) continue;
			// water leaves a tile for a neighbour that is no higher and is water
			const x = i % size;
			const y = (i - x) / size;
			let outlet = false;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
					const j = ny * size + nx;
					if (map.water[j] !== Water.none && map.height[j] <= map.height[i]) outlet = true;
				}
			}
			steps++;
			if (!outlet) stuck++;
		}
		expect(steps).toBeGreaterThan(100);
		// the odd tile at the edge of the map is fine
		expect(stuck / steps).toBeLessThan(0.05);
	});

	it('has the biomes and ground the plan calls for', () => {
		for (const seed of SEEDS) {
			const map = world(seed);
			const n = map.size * map.size;
			for (const biome of Object.values(Biome)) {
				expect(count(map.biome, biome), `seed ${seed} biome ${biome}`).toBeGreaterThan(0);
			}
			for (const ground of [Ground.loam, Ground.clay, Ground.rock, Ground.chalk, Ground.bog]) {
				expect(count(map.ground, ground), `seed ${seed} ground ${ground}`).toBeGreaterThan(0);
			}
			const land = n - count(map.water, Water.sea);
			// forests and grassland are the bulk of the lowland
			const lowland = count(map.biome, Biome.forest) + count(map.biome, Biome.grassland);
			expect(lowland / land, `seed ${seed}`).toBeGreaterThan(0.5);
			let minT = Infinity;
			let maxT = -Infinity;
			for (let i = 0; i < n; i++) {
				if (map.water[i] === Water.sea) continue;
				minT = Math.min(minT, map.temperature[i]);
				maxT = Math.max(maxT, map.temperature[i]);
			}
			expect(minT).toBeLessThan(8);
			expect(maxT).toBeGreaterThan(14);
		}
	});

	it('places every kind of deposit by the rules', () => {
		let obsidian = 0;
		for (const seed of SEEDS) {
			const map = world(seed);
			const { size } = map;
			const kinds = (kind: number) => blobs(map, (i) => map.deposit[i] === kind);
			expect(kinds(Deposit.flint).length, `flint ${seed}`).toBeGreaterThanOrEqual(3);
			expect(kinds(Deposit.clay).length, `clay ${seed}`).toBeGreaterThanOrEqual(8);
			const copper = kinds(Deposit.copper).length;
			expect(copper, `copper ${seed}`).toBeGreaterThanOrEqual(3);
			// a site can split in two where the rock thins out
			expect(copper, `copper ${seed}`).toBeLessThanOrEqual(8);
			expect(kinds(Deposit.bogIron).length, `bog iron ${seed}`).toBeGreaterThanOrEqual(1);
			expect(kinds(Deposit.salt).length, `salt ${seed}`).toBeGreaterThanOrEqual(1);
			expect(kinds(Deposit.ochre).length, `ochre ${seed}`).toBeGreaterThanOrEqual(2);
			expect(kinds(Deposit.tin).length, `tin ${seed}`).toBeLessThanOrEqual(2);
			expect(count(map.deposit, Deposit.meteorite)).toBe(0);
			obsidian += count(map.deposit, Deposit.obsidian);

			const tin = kinds(Deposit.tin);
			expect(tin.length, `tin ${seed}`).toBeGreaterThanOrEqual(1);
			// clusters, not single pixels
			for (const group of tin) expect(group.length).toBeGreaterThan(2);

			// tin is far from the camp, so bronze needs travel
			const start = findStart(map, seed);
			for (const group of tin) {
				for (const c of group) {
					const d = Math.hypot((c % size) - start.x, Math.floor(c / size) - start.y);
					expect(d, `tin ${seed}`).toBeGreaterThan(80);
				}
			}

			let misplaced = 0;
			for (let i = 0; i < size * size; i++) {
				const kind = map.deposit[i];
				const left = map.depositLeft[i];
				if (kind === Deposit.none) {
					if (left !== 0) misplaced++;
					continue;
				}
				if (left < 10 || left > 400 || map.water[i] === Water.sea) misplaced++;
				if (kind === Deposit.flint && map.ground[i] !== Ground.chalk) misplaced++;
				if (kind === Deposit.clay && map.ground[i] !== Ground.clay) misplaced++;
				if (kind === Deposit.salt && map.biome[i] !== Biome.coast) misplaced++;
			}
			expect(misplaced, `seed ${seed}`).toBe(0);
		}
		// rare, but somewhere among the seeds
		expect(obsidian).toBeGreaterThan(0);
	});
});

describe('findStart', { timeout: 60_000 }, () => {
	it('picks a good camp for every seed', () => {
		let withBoth = 0;
		for (let seed = 1; seed <= 20; seed++) {
			const map = world(seed);
			const start = findStart(map, seed);
			expect(findStart(map, seed)).toEqual(start);
			const { size } = map;
			expect(Number.isInteger(start.x) && Number.isInteger(start.y)).toBe(true);
			expect(start.x).toBeGreaterThanOrEqual(0);
			expect(start.x).toBeLessThan(size);
			expect(start.y).toBeGreaterThanOrEqual(0);
			expect(start.y).toBeLessThan(size);
			const i = start.y * size + start.x;
			expect(map.water[i], `seed ${seed}`).toBe(Water.none);
			expect([Biome.grassland, Biome.forest], `seed ${seed}`).toContain(map.biome[i]);
			expect(map.temperature[i]).toBeGreaterThan(7);
			expect(map.temperature[i]).toBeLessThan(18);

			let river = false;
			let stone = false;
			let clay = false;
			let trees = 0;
			for (let dy = -30; dy <= 30; dy++) {
				for (let dx = -30; dx <= 30; dx++) {
					const x = start.x + dx;
					const y = start.y + dy;
					if (x < 0 || y < 0 || x >= size || y >= size) continue;
					const j = y * size + x;
					if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1 && map.water[j] === Water.river) {
						river = true;
					}
					if (map.deposit[j] === Deposit.flint || map.ground[j] === Ground.chalk) stone = true;
					if (map.deposit[j] === Deposit.clay) clay = true;
					if (Math.max(Math.abs(dx), Math.abs(dy)) <= 6) trees += map.wood[j];
				}
			}
			expect(river, `seed ${seed}`).toBe(true);
			expect(trees, `seed ${seed}`).toBeGreaterThan(5);
			if (stone && clay) withBoth++;
		}
		// nearly every world has flint and clay in reach of the camp
		expect(withBoth).toBeGreaterThanOrEqual(18);
	});

	it('still answers on a map with almost no land', () => {
		const map = generateWorld(5, 64);
		map.water.fill(Water.sea);
		map.biome.fill(Biome.ocean);
		map.deposit.fill(Deposit.none);
		const start = findStart(map, 5);
		expect(start.x).toBeGreaterThanOrEqual(0);
		expect(start.y).toBeLessThan(64);
	});
});

describe('timing', () => {
	it('builds a full map quickly', () => {
		const began = performance.now();
		generateWorld(99);
		// generous, since test machines vary; the aim is well under half a second
		expect(performance.now() - began).toBeLessThan(1500);
	});
});
