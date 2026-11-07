import { beforeAll, describe, expect, it } from 'vitest';
import { Biome, Water, type HerdView, type MapLayers, type PersonView } from '../types';
import { collectActors, dryPoint, nearestPerson, personPosition, poseOf, spotInto } from './actors';
import { Camera } from './camera';
import { lightningAt, stepWeights } from './atmosphere';
import { waterAt } from './ground';
import { viewOf, type DrawState, type Standing } from './scene';

const person = (over: Partial<PersonView> = {}): PersonView => ({
	id: 7,
	name: 'Ada',
	x: 10,
	y: 20,
	sex: 'f',
	child: false,
	elder: false,
	activity: 'idle',
	village: 0,
	...over
});

type DryLayers = Pick<MapLayers, 'size' | 'water' | 'biome'>;
// all dry land
const DRY = {
	size: 64,
	water: new Uint8Array(64 * 64),
	biome: new Uint8Array(64 * 64).fill(Biome.grassland)
} as unknown as DryLayers;

// workerd has no canvas: a stand-in that accepts every drawing call, so sprites can be "made"
beforeAll(() => {
	const g = globalThis as unknown as Record<string, unknown>;
	g.OffscreenCanvas = class {
		constructor(
			public width: number,
			public height: number
		) {}
		getContext() {
			return new Proxy({}, { get: () => () => {}, set: () => true });
		}
	};
});

const ZOOM = { overview: 5, map: 64, local: 480 };

function frame(
	mode: keyof typeof ZOOM,
	people: PersonView[],
	herds: HerdView[] = [],
	layers: DryLayers = DRY
): Standing[] {
	const camera = new Camera();
	camera.setViewport(800, 600);
	camera.x = 10;
	camera.y = 20;
	camera.zoom = ZOOM[mode];
	const state = {
		camera,
		people,
		herds,
		layers,
		now: 0,
		dpr: 1,
		theme: 'light'
	} as unknown as DrawState;
	const out: Standing[] = [];
	collectActors(state, viewOf(state), out);
	return out;
}

describe('spots', () => {
	it('are stable and stay inside the tile', () => {
		const a = { dx: 0, dy: 0 };
		const b = { dx: 0, dy: 0 };
		for (const act of ['sleep', 'idle', 'socialize', 'gather']) {
			for (let id = 0; id < 200; id++) {
				spotInto(a, id, act);
				spotInto(b, id, act);
				expect(a).toEqual(b);
				expect(Math.abs(a.dx)).toBeLessThan(0.4);
				expect(Math.abs(a.dy)).toBeLessThan(0.4);
			}
		}
	});
	it('differ by activity', () => {
		const a = { dx: 0, dy: 0 };
		const b = { dx: 0, dy: 0 };
		spotInto(a, 3, 'sleep');
		spotInto(b, 3, 'gather');
		expect(a).not.toEqual(b);
	});
});

describe('poses', () => {
	it('match the work', () => {
		expect(poseOf('sleep', false)).toBe('lie');
		expect(poseOf('forage', false)).toBe('kneel');
		expect(poseOf('socialize', false)).toBe('sit');
		expect(poseOf('pray', false)).toBe('pray');
		expect(poseOf('gather', true)).toBe('walk');
	});
});

describe('positions', () => {
	it('are the tile centre when zoomed out', () => {
		frame('overview', []);
		const p = personPosition(person({ id: 101 }), 1000);
		expect(p).toEqual({ x: 10.5, y: 20.5 });
	});

	it('ease toward the spot and converge', () => {
		const spot = { dx: 0, dy: 0 };
		spotInto(spot, 102, 'idle');
		const walker = person({ id: 102, x: 10, y: 20 });
		frame('local', [walker]);
		personPosition(walker, 0);
		const moved = { ...walker, x: 14, y: 22 };
		let prev = Infinity;
		personPosition(moved, 16);
		for (let t = 32; t <= 6000; t += 16) {
			const last = personPosition(moved, t);
			const d = Math.hypot(last.x - (14.5 + spot.dx), last.y - (22.5 + spot.dy));
			expect(d).toBeLessThanOrEqual(prev + 1e-9);
			prev = d;
		}
		expect(prev).toBeLessThan(0.01);
		// no teleporting: a short time later it is still on the way
		const slow = person({ id: 103, x: 10, y: 20 });
		frame('local', [slow]);
		personPosition(slow, 0);
		const first = personPosition({ ...slow, x: 13 }, 50);
		expect(first.x).toBeLessThan(11.5);
	});

	it('give the same answer for the same frame time', () => {
		const p = person({ id: 104 });
		frame('local', [p]);
		personPosition(p, 0);
		const a = personPosition({ ...p, x: 12 }, 100);
		const b = personPosition({ ...p, x: 12 }, 100);
		expect(a).toEqual(b);
	});
});

describe('nearestPerson', () => {
	it('picks the closest within reach', () => {
		frame('overview', []);
		const cam = new Camera();
		cam.setViewport(800, 600);
		cam.zoom = 10;
		cam.x = 10;
		cam.y = 20;
		const a = person({ id: 1, x: 10, y: 20 });
		const b = person({ id: 2, x: 11, y: 20 });
		const at = cam.toScreen(10.5, 20.5);
		expect(nearestPerson([a, b], cam, 0, at.x + 1, at.y)).toBe(1);
		expect(nearestPerson([a, b], cam, 0, at.x + 400, at.y)).toBeNull();
	});

	it('reaches as wide as the sprite up close', () => {
		const cam = new Camera();
		cam.setViewport(800, 600);
		cam.zoom = 480;
		const a = person({ id: 1, x: 10, y: 20 });
		frame('local', [a]);
		const at = personPosition(a, 0);
		cam.x = at.x;
		cam.y = at.y;
		// 14 px above the foot is on the body (16 art px tall at 2x), outside the old 10 px radius
		expect(nearestPerson([a], cam, 0, 400, 300 - 14)).toBe(1);
		expect(nearestPerson([a], cam, 0, 400, 300 - 70)).toBeNull();
	});
});

describe('staying out of water', () => {
	const size = 12;
	const n = size * size;
	const layers = {
		size,
		water: new Uint8Array(n),
		biome: new Uint8Array(n).fill(Biome.grassland)
	} as unknown as MapLayers;
	// a river along row 5 (x 0..7) and a lake at x 8..9, y 4..6
	for (let x = 0; x < 8; x++) layers.water[5 * size + x] = Water.river;
	for (let y = 4; y <= 6; y++) for (let x = 8; x <= 9; x++) layers.water[y * size + x] = Water.lake;
	const pt = { x: 0, y: 0 };

	it('moves a point from a river channel to dry ground in the same tile', () => {
		let moved = 0;
		for (let i = 0; i < 60; i++) {
			const x = 3.3 + (i % 10) * 0.04;
			const y = 5.5;
			expect(dryPoint(layers, x, y, i, pt)).toBe(true);
			expect(waterAt(layers, pt.x, pt.y)).toBe(false);
			expect(Math.floor(pt.x)).toBe(3);
			expect(Math.floor(pt.y)).toBe(5);
			if (pt.x !== x || pt.y !== y) moved++;
		}
		expect(moved).toBeGreaterThan(0);
	});

	it('puts someone from the middle of a lake on the nearest dry neighbouring tile', () => {
		expect(dryPoint(layers, 8.5, 5.5, 1, pt)).toBe(true);
		expect(waterAt(layers, pt.x, pt.y)).toBe(false);
		// the lake is x 8..9, so dry land is x 7 or x 10, or y 3 or 7
		expect(Math.abs(pt.x - 8.5) + Math.abs(pt.y - 5.5)).toBeLessThan(3);
	});

	it('leaves dry points alone', () => {
		dryPoint(layers, 2.4, 2.4, 1, pt);
		expect(pt).toEqual({ x: 2.4, y: 2.4 });
	});

	it('keeps people on dry ground, at rest and while easing', () => {
		for (let id = 0; id < 40; id++) {
			for (const [x, y] of [
				[3, 5],
				[8, 5]
			]) {
				const who = person({ id, x, y, activity: id % 2 ? 'sleep' : 'gather' });
				frame('local', [who], [], layers);
				for (const t of [0, 100, 600]) {
					const at = personPosition(who, t);
					expect(waterAt(layers, at.x, at.y)).toBe(false);
				}
			}
		}
	});
});

describe('modes', () => {
	it('draws one thing per person in every mode, culled to the view', () => {
		const here = person({ id: 1, x: 10, y: 20 });
		const far = person({ id: 2, x: 50, y: 50 });
		const herd: HerdView = { id: 3, kind: 'wolf', x: 10, y: 20, count: 3, tame: false };
		expect(frame('overview', [here, far], [herd]).length).toBe(3);
		expect(frame('map', [here, far], [herd]).length).toBeGreaterThanOrEqual(2);
		const local = frame('local', [here, far], [herd]).length;
		expect(local).toBeGreaterThan(1);
		expect(local).toBeLessThanOrEqual(1 + 3);
	});

	it('spreads people a little inside a map tile', () => {
		frame('map', []);
		const a = personPosition(person({ id: 11 }), 0);
		const b = personPosition(person({ id: 12 }), 0);
		expect(Math.abs(a.x - 10.5)).toBeLessThan(0.3);
		expect(a).not.toEqual(b);
	});
});

describe('weather', () => {
	it('fades toward the current kind', () => {
		const w = { rain: 0, storm: 0, snow: 0, drought: 0, cold: 0 };
		stepWeights(w, 'rain', 0.5);
		expect(w.rain).toBeGreaterThan(0);
		expect(w.rain).toBeLessThan(1);
		stepWeights(w, 'rain', 30);
		expect(w.rain).toBe(1);
		stepWeights(w, 'clear', 30);
		expect(w.rain).toBe(0);
	});
	it('flashes rarely and briefly', () => {
		let on = 0;
		for (let ms = 0; ms < 120000; ms += 50) if (lightningAt(ms) > 0.05) on++;
		expect(on).toBeGreaterThan(0);
		expect(on * 50).toBeLessThan(120000 * 0.1);
	});
});
