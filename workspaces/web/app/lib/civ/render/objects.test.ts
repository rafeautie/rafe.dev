import { describe, expect, it } from 'vitest';
import { Biome, Built, Deposit, Ground, Water } from '../types';
import { Camera } from './camera';
import {
	MAX_OBJECTS,
	bushCount,
	clearFactor,
	collectObjects,
	keepRatio,
	keptCount,
	scatter,
	treeCount,
	treeKind
} from './objects';
import { viewOf, type DrawState, type Standing } from './scene';
import { Kind } from './sprites';

describe('scatter', () => {
	it('is stable for the same tile and stays inside it', () => {
		const a = [0, 0];
		const b = [0, 0];
		for (let tx = 0; tx < 20; tx++) {
			for (let j = 0; j < 30; j++) {
				scatter(tx, 7, j, 3, a);
				scatter(tx, 7, j, 3, b);
				expect(a).toEqual(b);
				expect(a[0]).toBeGreaterThan(0);
				expect(a[0]).toBeLessThan(1);
				expect(a[1]).toBeGreaterThan(0);
				expect(a[1]).toBeLessThan(1);
			}
		}
	});

	it('differs between kinds and indexes', () => {
		const a = [0, 0];
		const b = [0, 0];
		scatter(3, 4, 0, 0, a);
		scatter(3, 4, 1, 0, b);
		expect(a).not.toEqual(b);
	});
});

describe('counts', () => {
	it('trees follow wood cover', () => {
		expect(treeCount(0)).toBe(0);
		expect(treeCount(0.01)).toBe(0);
		expect(treeCount(0.05)).toBeGreaterThanOrEqual(1);
		expect(treeCount(0.5)).toBeLessThan(treeCount(1));
		expect(treeCount(5)).toBe(treeCount(1));
	});

	it('bushes follow plants and skip bare biomes', () => {
		expect(bushCount(0, Biome.grassland)).toBe(0);
		expect(bushCount(1, Biome.grassland)).toBeGreaterThan(bushCount(0.3, Biome.grassland));
		expect(bushCount(1, Biome.mountain)).toBe(0);
	});

	it('picks conifers in hills and broadleaf in grassland', () => {
		expect(treeKind(Biome.grassland, 0.9)).toBe(Kind.oak);
		expect(treeKind(Biome.hills, 0.1)).toBe(Kind.conifer);
	});

	it('thinning keeps within the room and moves in steps', () => {
		expect(keepRatio(100, 200)).toBe(1);
		expect(keepRatio(100, 0)).toBe(0);
		const r = keepRatio(10000, 2000);
		expect(r).toBeLessThanOrEqual(0.2);
		expect(r).toBeGreaterThan(0.05);
		expect(keptCount(10, 1, 0, 0)).toBe(10);
		expect(keptCount(10, 0.3, 4, 5)).toBeLessThanOrEqual(4);
	});
});

function fakeState(zoom: number): DrawState {
	const size = 64;
	const n = size * size;
	const camera = new Camera();
	camera.setViewport(1600, 900);
	camera.mapSize = size;
	camera.x = 32;
	camera.y = 32;
	camera.zoom = zoom;
	const built = new Uint8Array(n);
	built[32 * size + 32] = Built.hut;
	built[32 * size + 33] = Built.pen;
	const deposit = new Uint8Array(n);
	deposit[31 * size + 32] = Deposit.flint;
	return {
		camera,
		terrain: { width: size, height: size } as unknown as DrawState['terrain'],
		dpr: 1,
		layers: {
			size,
			height: new Float32Array(n).fill(0.5),
			moisture: new Float32Array(n).fill(0.5),
			ground: new Uint8Array(n).fill(Ground.loam),
			water: new Uint8Array(n).fill(Water.none),
			biome: new Uint8Array(n).fill(Biome.forest),
			deposit
		},
		living: { plants: new Float32Array(n).fill(1), wood: new Float32Array(n).fill(1), built },
		people: [],
		herds: [],
		villages: [],
		tick: 0,
		now: 0,
		season: 1,
		weather: 'clear',
		followedId: null,
		hoveredId: null,
		theme: 'light'
	};
}

describe('collectObjects', () => {
	it('stays within the object budget at every zoom, in the thickest forest', () => {
		for (const zoom of [1.5, 5, 18, 30, 60, 120, 480, 960]) {
			const state = fakeState(zoom);
			const out: Standing[] = [];
			collectObjects(state, viewOf(state), out);
			expect(out.length).toBeLessThanOrEqual(MAX_OBJECTS + 400);
		}
	});

	it('draws nothing but markers when zoomed out', () => {
		const state = fakeState(5);
		const out: Standing[] = [];
		collectObjects(state, viewOf(state), out);
		// a hut and a pen (ore markers start at 8 px per tile)
		expect(out.length).toBe(2);
	});

	it('is deterministic between frames', () => {
		const state = fakeState(120);
		const a: Standing[] = [];
		const b: Standing[] = [];
		collectObjects(state, viewOf(state), a);
		const ys = a.map((e) => e.y);
		collectObjects(state, viewOf(state), b);
		expect(b.map((e) => e.y)).toEqual(ys);
	});
});

describe('village clearing', () => {
	it('is 0 at the centre and 1 well away, and only grows outward', () => {
		const vx = [10.5];
		const vy = [10.5];
		expect(clearFactor(10.5, 10.5, vx, vy, 1)).toBe(0);
		expect(clearFactor(14, 10.5, vx, vy, 1)).toBe(1);
		expect(clearFactor(11.5, 10.5, vx, vy, 1)).toBeLessThan(clearFactor(12.5, 10.5, vx, vy, 1));
		expect(clearFactor(3, 3, vx, vy, 0)).toBe(1);
	});

	it('leaves no trees at a village centre', () => {
		const state = fakeState(120);
		state.villages = [{ id: 1, name: 'A', x: 32, y: 32 }];
		const out: Standing[] = [];
		collectObjects(state, viewOf(state), out);
		// entries are pooled and reused, so count before the next collect
		const row = (list: Standing[]) => list.filter((e) => e.y > 32.2 && e.y < 32.8).length;
		const near = row(out);
		const withoutVillage: Standing[] = [];
		state.villages = [];
		collectObjects(state, viewOf(state), withoutVillage);
		// trees standing on the row through the village are fewer near its centre
		expect(near).toBeLessThan(row(withoutVillage));
	});
});
