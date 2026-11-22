import { describe, expect, it } from 'vitest';
import {
	MARGIN,
	TRACK,
	ZOOM_MAX,
	ZOOM_MIN,
	aim,
	battle,
	chosen,
	createCamera,
	focus,
	framing,
	home,
	keep,
	parse,
	pick,
	toFrame,
	toWorld,
	toggle,
	type Body,
	type Follow,
	type Frame
} from './camera';
import { HEIGHT, SCALE, WIDTH } from './render';

const car = (id: string, over: Partial<Body> = {}): Body => ({
	entry: { id },
	x: 50,
	y: 40,
	angle: 0,
	speed: 0,
	retired: false,
	progress: 0,
	finishTime: 0,
	...over
});

// a desktop frame: the track in the middle with grass all round
const frame: Frame = { width: 1200, height: 600, ox: 280, oy: 120 };
const whole = { x: 0, y: 0, w: frame.width, h: frame.height };

describe('choosing cars', () => {
	const field = [
		car('a', { progress: 500, speed: 40 }),
		car('b', { progress: 480, speed: 40 }),
		car('c', { progress: 300, speed: 40 }),
		car('d', { progress: 495, retired: true })
	];

	it('follows nothing on the track view, and one car by its id', () => {
		expect(chosen(TRACK, field, new Set())).toEqual([]);
		expect(chosen({ mode: 'car', id: 'c' }, field, new Set())).toEqual([field[2]]);
		expect(chosen({ mode: 'car', id: 'zz' }, field, new Set())).toEqual([]);
	});

	it('puts in a battle the cars within a second of it, but not retired ones', () => {
		// 40 m/s: a second is 40 m, so b (20 m back) is in it and c (200 m) is not
		expect(battle(field[0], field).map((c) => c.entry.id)).toEqual(['a', 'b']);
		// the leader's battle when none is named
		expect(chosen({ mode: 'battle', id: null }, field, new Set()).map((c) => c.entry.id)).toEqual([
			'a',
			'b'
		]);
	});

	it('takes the nearest car into a battle when nobody is close', () => {
		expect(battle(field[2], field).map((c) => c.entry.id)).toEqual(['c', 'b']);
	});

	it('follows the cars bet on, and shows the numbers of the one furthest on', () => {
		const backed = new Set(['c', 'b']);
		expect(chosen({ mode: 'mine' }, field, backed).map((c) => c.entry.id)).toEqual(['b', 'c']);
		const mine: Follow = { mode: 'mine' };
		expect(focus(mine, chosen(mine, field, backed))?.entry.id).toBe('b');
		const group: Follow = { mode: 'group', ids: ['c', 'a'] };
		expect(focus(group, chosen(group, field, backed))?.entry.id).toBe('c');
		expect(focus(TRACK, [])).toBeNull();
	});
});

describe('aiming', () => {
	it('looks at the whole track when there is nothing to follow', () => {
		expect(aim([], whole)).toBeNull();
	});

	it('holds one car close up, a little ahead of where it is going', () => {
		const at = aim([car('a', { x: 50, y: 40, speed: 40, angle: 0 })], whole)!;
		expect(at.zoom).toBe(ZOOM_MAX);
		expect(at.x).toBeGreaterThan(50);
		expect(at.y).toBeCloseTo(40);
	});

	it('fits a group in view with room round it', () => {
		const pair = [car('a', { x: 40, y: 40 }), car('b', { x: 60, y: 45 })];
		const at = aim(pair, whole)!;
		expect(at.x).toBe(50);
		expect(at.y).toBe(42.5);
		const shown = framing(at, whole, frame);
		// every car, and the margin round them, is inside what is shown
		for (const c of pair) {
			const px = frame.ox + c.x * SCALE;
			const py = frame.oy + c.y * SCALE;
			expect(px - MARGIN * SCALE).toBeGreaterThanOrEqual(shown.x - 1);
			expect(px + MARGIN * SCALE).toBeLessThanOrEqual(shown.x + shown.w + 1);
			expect(py).toBeGreaterThanOrEqual(shown.y);
			expect(py).toBeLessThanOrEqual(shown.y + shown.h);
		}
	});

	it('keeps the zoom between the whole track and the closest it goes', () => {
		const close = aim([car('a', { x: 50 }), car('b', { x: 50.5 })], whole)!;
		expect(close.zoom).toBe(ZOOM_MAX);
		const strip = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
		const apart = aim([car('a', { x: 0, y: 0 }), car('b', { x: 160, y: 90 })], strip)!;
		expect(apart.zoom).toBe(ZOOM_MIN);
		// in quarter steps
		const middling = aim([car('a', { x: 20 }), car('b', { x: 90 })], whole)!;
		expect((middling.zoom * 4) % 1).toBe(0);
	});
});

describe('framing', () => {
	it('shows the part the race has as it is when at rest', () => {
		const rest = home(whole, frame);
		expect(framing(rest, whole, frame)).toEqual(whole);
		// on a phone, the strip at the top the track is in
		const strip = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
		const phone = { width: WIDTH, height: 1300, ox: 0, oy: 0 };
		expect(framing(home(strip, phone), strip, phone)).toEqual(strip);
	});

	it('shows a third as much at three times, round the car', () => {
		const shown = framing({ x: 80, y: 45, zoom: 3 }, whole, frame);
		expect(shown.w).toBe(400);
		expect(shown.h).toBe(200);
		expect(shown.x + shown.w / 2).toBe(frame.ox + 80 * SCALE);
	});

	it('never runs off the frame, at a corner of the track', () => {
		const shown = framing({ x: -30, y: 200, zoom: 2 }, whole, frame);
		expect(shown.x).toBe(0);
		expect(shown.y + shown.h).toBe(frame.height);
	});

	it('takes a point to the screen and back again', () => {
		const lens = { from: framing({ x: 70, y: 30, zoom: 2.5 }, whole, frame), to: whole };
		const on = toFrame(lens, frame, 70, 30);
		expect(on.x).toBeCloseTo(frame.width / 2);
		expect(on.y).toBeCloseTo(frame.height / 2);
		const back = toWorld(lens, frame, on.x, on.y);
		expect(back.x).toBeCloseTo(70);
		expect(back.y).toBeCloseTo(30);
	});
});

describe('picking a car', () => {
	const field = [car('a', { x: 10, y: 10 }), car('b', { x: 14, y: 10 })];

	it('takes the nearest car under the pointer, or none', () => {
		expect(pick(field, 13, 10)?.entry.id).toBe('b');
		expect(pick(field, 40, 40)).toBeNull();
	});

	it('follows a car, and a second click on it goes back to the track', () => {
		const one = toggle(TRACK, 'a', false);
		expect(one).toEqual({ mode: 'car', id: 'a' });
		expect(toggle(one, 'a', false)).toEqual(TRACK);
		expect(toggle(one, 'b', false)).toEqual({ mode: 'car', id: 'b' });
	});

	it('adds cars to a group and takes them out again', () => {
		const pair = toggle({ mode: 'car', id: 'a' }, 'b', true);
		expect(pair).toEqual({ mode: 'group', ids: ['a', 'b'] });
		expect(toggle(pair, 'a', true)).toEqual({ mode: 'car', id: 'b' });
		expect(toggle({ mode: 'car', id: 'a' }, 'a', true)).toEqual(TRACK);
	});
});

describe('keeping a choice', () => {
	it('keeps it while the field has its cars, and otherwise goes back to the track', () => {
		const field = ['a', 'b', 'c'];
		expect(keep({ mode: 'car', id: 'a' }, field)).toEqual({ mode: 'car', id: 'a' });
		expect(keep({ mode: 'car', id: 'z' }, field)).toEqual(TRACK);
		expect(keep({ mode: 'group', ids: ['a', 'z'] }, field)).toEqual({ mode: 'car', id: 'a' });
		expect(keep({ mode: 'battle', id: 'z' }, field)).toEqual({ mode: 'battle', id: null });
		expect(keep({ mode: 'mine' }, field)).toEqual({ mode: 'mine' });
		// unchanged is the very same choice, so the page need not set it again
		const pair: Follow = { mode: 'group', ids: ['a', 'b'] };
		expect(keep(pair, field)).toBe(pair);
	});

	it('reads back what was stored, and anything else as the track', () => {
		const stored = { mode: 'group', ids: ['a', 'b'] };
		expect(parse(JSON.stringify(stored))).toEqual(stored);
		expect(parse(null)).toEqual(TRACK);
		expect(parse('not json')).toEqual(TRACK);
		expect(parse('{"mode":"car","id":4}')).toEqual(TRACK);
	});
});

describe('the camera', () => {
	const rest = { x: 80, y: 45, zoom: 1 };

	it('starts where it is told and glides towards a new aim', () => {
		const camera = createCamera();
		expect(camera.update(null, rest, 1 / 60)).toEqual(rest);
		const target = { x: 20, y: 20, zoom: 3 };
		const first = camera.update(target, rest, 1 / 60);
		expect(first.x).toBeLessThan(80);
		expect(first.x).toBeGreaterThan(20);
		expect(first.zoom).toBeGreaterThan(1);
		expect(first.zoom).toBeLessThan(3);
	});

	it('comes to rest exactly on its aim within a second', () => {
		const camera = createCamera();
		camera.update(null, rest, 0);
		const target = { x: 20, y: 20, zoom: 3 };
		let at = rest;
		for (let frame = 0; frame < 60; frame++) at = camera.update(target, rest, 1 / 60);
		expect(at).toEqual(target);
	});

	it('cuts straight there for reduced motion', () => {
		const camera = createCamera();
		camera.update(null, rest, 0);
		const target = { x: 20, y: 20, zoom: 3 };
		expect(camera.update(target, rest, 1 / 60, true)).toEqual(target);
	});
});
