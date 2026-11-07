import { describe, expect, it } from 'vitest';
import { Biome, Built, Deposit, Ground, Water } from '../types';
import { Camera } from './camera';
import {
	MAX_OBJECTS,
	PEN_POSTS,
	PEN_RUNS,
	bushCount,
	clearFactor,
	collectObjects,
	keepRatio,
	keptCount,
	scatter,
	tileOnScreen,
	treeCount,
	treeKind
} from './objects';
import { depthOf, snapToArt, viewOf, type DrawState, type Standing } from './scene';
import { FENCE_RUN } from './pixel/localsprites';
import { Kind } from './pixel/localsprites';

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
		for (const zoom of [1.5, 5, 18, 30, 60, 120, 240, 480, 720, 960]) {
			const state = fakeState(zoom);
			const out: Standing[] = [];
			collectObjects(state, viewOf(state), out);
			expect(out.length).toBeLessThanOrEqual(MAX_OBJECTS + 400);
		}
	});

	it('collects nothing outside the close-up view', () => {
		for (const zoom of [5, 32, 120]) {
			const state = fakeState(zoom);
			const out: Standing[] = [];
			collectObjects(state, viewOf(state), out);
			expect(out.length).toBe(0);
		}
	});

	it('builds the village pieces: a hut, a pen of fence, ore with its chunks', () => {
		const state = fakeState(960);
		state.camera.x = 32.5;
		state.camera.y = 32.5;
		const out: Standing[] = [];
		collectObjects(state, viewOf(state), out);
		// hut (1) + pen: 9 rails, 3 end posts, 2 side runs + flint and 3 chunks, at least
		expect(out.length).toBeGreaterThan(1 + 14 + 4);
	});

	it('sorts things by depth, x + y at the foot', () => {
		const state = fakeState(480);
		// only a hut, on tile (32, 32): it stands at (0.5, 0.58) in its tile
		state.living.wood.fill(0);
		state.living.plants.fill(0);
		state.layers.deposit.fill(Deposit.none);
		state.living.built.fill(Built.none);
		state.living.built[32 * 64 + 32] = Built.hut;
		state.camera.x = 32.5;
		state.camera.y = 32.5;
		const out: Standing[] = [];
		const view = viewOf(state);
		collectObjects(state, view, out);
		const hut = out.filter((e) => Math.abs(e.y - (65 + 0.5 + 0.58 - 1)) < 1e-9);
		expect(hut.length).toBe(1);
		expect(depthOf(view, 32.5, 32.58)).toBeCloseTo(65.08, 9);
		// things further down the diamond (larger x + y) sort later
		const deeper = out.filter((e) => e.y > 65.08 + 1e-6).length;
		const shallower = out.filter((e) => e.y < 65.08 - 1e-6).length;
		expect(deeper + shallower + 1).toBe(out.length);
	});

	it('lifts things to the height of their tile', () => {
		const state = fakeState(480);
		const view = viewOf(state);
		const flat = snapToArt(view, 32.5, 32.5);
		const base = view.levels[32 * 64 + 32];
		view.levels[32 * 64 + 32] = base - 3;
		const raised = snapToArt(view, 32.5, 32.5);
		expect(raised.y - flat.y).toBe(3 * view.liftArt * view.scale);
		expect(raised.x).toBe(flat.x);
	});

	it('only counts tiles that can show on screen', () => {
		const state = fakeState(240);
		const view = viewOf(state);
		let box = 0;
		let shown = 0;
		for (let ty = view.y0; ty < view.y1; ty++)
			for (let tx = view.x0; tx < view.x1; tx++) {
				box++;
				if (tileOnScreen(view, state.camera.width, state.camera.height, tx, ty)) shown++;
			}
		// the screen is a rotated rectangle on the ground: much of its bounding box is off it
		expect(shown).toBeGreaterThan(0);
		expect(shown).toBeLessThan(box * 0.75);
		// the tile at the centre is on screen, one far away is not
		expect(tileOnScreen(view, state.camera.width, state.camera.height, 32, 32)).toBe(true);
		expect(tileOnScreen(view, state.camera.width, state.camera.height, 50, 10)).toBe(false);
	});

	it('is deterministic between frames', () => {
		const state = fakeState(480);
		const a: Standing[] = [];
		const b: Standing[] = [];
		collectObjects(state, viewOf(state), a);
		const ys = a.map((e) => e.y);
		collectObjects(state, viewOf(state), b);
		expect(b.map((e) => e.y)).toEqual(ys);
	});
});

describe('pen fence', () => {
	it('is a square of runs along the x and y axes, joined at posts', () => {
		const posts = new Set(PEN_POSTS.map(([x, y]) => x.toFixed(3) + ',' + y.toFixed(3)));
		const run = FENCE_RUN / 240;
		let alongX = 0;
		let alongY = 0;
		for (const [x, y, ay] of PEN_RUNS) {
			const end = ay ? [x, y + run] : [x + run, y];
			expect(posts.has(x.toFixed(3) + ',' + y.toFixed(3))).toBe(true);
			expect(posts.has(end[0].toFixed(3) + ',' + end[1].toFixed(3))).toBe(true);
			if (ay) alongY++;
			else alongX++;
		}
		// three runs on each side, less the gate in the middle of the front
		expect(alongY).toBe(6);
		expect(alongX).toBe(5);
		// the posts sit on the square and nowhere else
		for (const [x, y] of PEN_POSTS) {
			const edge = (v: number) => Math.abs(v - 0.2) < 1e-9 || Math.abs(v - 0.8) < 1e-9;
			expect(edge(x) || edge(y)).toBe(true);
			expect(x).toBeGreaterThanOrEqual(0.2);
			expect(Math.max(x, y)).toBeLessThanOrEqual(0.8 + 1e-9);
		}
		expect(PEN_POSTS.length).toBe(12);
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
		const state = fakeState(240);
		state.villages = [{ id: 1, name: 'A', x: 32, y: 32 }];
		const out: Standing[] = [];
		collectObjects(state, viewOf(state), out);
		// entries are pooled and reused, so count before the next collect
		const row = (list: Standing[]) => list.filter((e) => e.y > 64.4 && e.y < 65.6).length;
		const near = row(out);
		const withoutVillage: Standing[] = [];
		state.villages = [];
		collectObjects(state, viewOf(state), withoutVillage);
		// trees standing on the row through the village are fewer near its centre
		expect(near).toBeLessThan(row(withoutVillage));
	});
});
