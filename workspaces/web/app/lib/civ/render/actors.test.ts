import { describe, expect, it } from 'vitest';
import type { HerdView, PersonView } from '../types';
import {
	carryColor,
	closeUpAmount,
	collectActors,
	lookOf,
	nearestPerson,
	personPosition,
	poseOf,
	scaleOf,
	spotInto
} from './actors';
import { Camera } from './camera';
import { lightningAt, stepWeights } from './atmosphere';
import type { DrawState, View } from './scene';

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

function frame(detail: number, people: PersonView[], herds: HerdView[] = []): void {
	const camera = new Camera();
	camera.setViewport(800, 600);
	camera.x = 10;
	camera.y = 20;
	camera.zoom = 480;
	const state = { camera, people, herds, now: 0, theme: 'light' } as unknown as DrawState;
	const view = { detail, zoom: 480, ppm: 12 } as View;
	collectActors(state, view, []);
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

describe('looks', () => {
	it('come from the id alone', () => {
		expect(lookOf(5, 'm', false, false)).toEqual(lookOf(5, 'm', false, false));
		const skins = new Set<string>();
		for (let id = 0; id < 100; id++) skins.add(lookOf(id, 'f', false, false).skin);
		expect(skins.size).toBeGreaterThan(4);
	});
	it('greys the hair of elders and shrinks children', () => {
		expect(lookOf(9, 'm', false, true).hair).toMatch(/^#(b7|cf|9d)/);
		expect(scaleOf({ id: 1, sex: 'm', child: true, elder: false })).toBeLessThan(0.75);
	});
	it('colours carried things by kind', () => {
		expect(carryColor('wood')).toBe(carryColor('wood'));
		expect(carryColor('wood')).not.toBe(carryColor('clay'));
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
		frame(0, []);
		const p = personPosition(person({ id: 101 }), 1000);
		expect(p).toEqual({ x: 10.5, y: 20.5 });
	});

	it('ease toward the spot and converge', () => {
		const spot = { dx: 0, dy: 0 };
		spotInto(spot, 102, 'idle');
		const walker = person({ id: 102, x: 10, y: 20 });
		frame(1, [walker]);
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
		frame(1, [slow]);
		personPosition(slow, 0);
		const first = personPosition({ ...slow, x: 13 }, 50);
		expect(first.x).toBeLessThan(11.5);
	});

	it('give the same answer for the same frame time', () => {
		const p = person({ id: 104 });
		frame(1, [p]);
		personPosition(p, 0);
		const a = personPosition({ ...p, x: 12 }, 100);
		const b = personPosition({ ...p, x: 12 }, 100);
		expect(a).toEqual(b);
	});
});

describe('nearestPerson', () => {
	it('picks the closest within reach', () => {
		frame(0, []);
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

	it('reaches wider around a big figure', () => {
		frame(0, []);
		const cam = new Camera();
		cam.setViewport(800, 600);
		cam.zoom = 480;
		const a = person({ id: 1, x: 10, y: 20 });
		frame(1, [a]);
		const at = personPosition(a, 0);
		cam.x = at.x;
		cam.y = at.y;
		// 14 px above the foot is on the body, outside the old 10 px radius
		expect(nearestPerson([a], cam, 0, 400, 300 - 14)).toBe(1);
		expect(closeUpAmount(1, 12)).toBe(1);
		expect(closeUpAmount(1, 0.5)).toBe(0);
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
