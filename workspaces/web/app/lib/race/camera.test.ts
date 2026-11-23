import { describe, expect, it } from 'vitest';
import {
	TRACK,
	ZOOM_MAX,
	aim,
	chosen,
	createCamera,
	framing,
	home,
	keep,
	parse,
	pick,
	toFrame,
	toWorld,
	toggle,
	type Body,
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
	...over
});

// a desktop frame: the track in the middle with grass all round
const frame: Frame = { width: 1200, height: 600, ox: 280, oy: 120 };
const whole = { x: 0, y: 0, w: frame.width, h: frame.height };

describe('choosing a car', () => {
	const field = [car('a'), car('b'), car('c')];

	it('follows nothing on the track view, and one car by its id', () => {
		expect(chosen(TRACK, field)).toBeNull();
		expect(chosen({ mode: 'car', id: 'c' }, field)).toBe(field[2]);
		expect(chosen({ mode: 'car', id: 'zz' }, field)).toBeNull();
	});
});

describe('aiming', () => {
	it('looks at the whole track when there is nothing to follow', () => {
		expect(aim(null)).toBeNull();
	});

	it('holds one car close up, a little ahead of where it is going', () => {
		const at = aim(car('a', { x: 50, y: 40, speed: 40, angle: 0 }))!;
		expect(at.zoom).toBe(ZOOM_MAX);
		expect(at.x).toBeGreaterThan(50);
		expect(at.y).toBeCloseTo(40);
	});

	it('looks right at a car that is out of the race', () => {
		expect(aim(car('a', { x: 50, y: 40, speed: 40, retired: true }))).toEqual({
			x: 50,
			y: 40,
			zoom: ZOOM_MAX
		});
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
		const one = toggle(TRACK, 'a');
		expect(one).toEqual({ mode: 'car', id: 'a' });
		expect(toggle(one, 'a')).toEqual(TRACK);
		expect(toggle(one, 'b')).toEqual({ mode: 'car', id: 'b' });
	});
});

describe('keeping a choice', () => {
	it('keeps it while the field has its car, and otherwise goes back to the track', () => {
		const field = ['a', 'b', 'c'];
		const a = { mode: 'car', id: 'a' } as const;
		// unchanged is the very same choice, so the page need not set it again
		expect(keep(a, field)).toBe(a);
		expect(keep(TRACK, field)).toBe(TRACK);
		expect(keep({ mode: 'car', id: 'z' }, field)).toEqual(TRACK);
	});

	it('reads back what was stored, and anything else as the track', () => {
		expect(parse('{"mode":"car","id":"a"}')).toEqual({ mode: 'car', id: 'a' });
		expect(parse(null)).toEqual(TRACK);
		expect(parse('not json')).toEqual(TRACK);
		expect(parse('null')).toEqual(TRACK);
		expect(parse('{"mode":"car","id":4}')).toEqual(TRACK);
	});

	it('takes a choice of a view there no longer is as the track', () => {
		expect(parse('{"mode":"battle","id":"a"}')).toEqual(TRACK);
		expect(parse('{"mode":"battle","id":null}')).toEqual(TRACK);
		expect(parse('{"mode":"mine"}')).toEqual(TRACK);
		expect(parse('{"mode":"group","ids":["a","b"]}')).toEqual(TRACK);
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
