import { describe, expect, it } from 'vitest';
import type { HerdView, PersonView } from '../types';
import { interpolateHerds, interpolatePeople } from './interpolate';

const person = (id: number, x: number, y: number): PersonView => ({
	id,
	name: `p${id}`,
	x,
	y,
	sex: 'f',
	child: false,
	activity: 'walk',
	village: 0
});

describe('interpolatePeople', () => {
	it('blends positions by id', () => {
		const out = interpolatePeople([person(1, 0, 0)], [person(1, 10, 4)], 0.5);
		expect(out[0].x).toBe(5);
		expect(out[0].y).toBe(2);
	});

	it('hits both ends and clamps t', () => {
		const a = [person(1, 0, 0)];
		const b = [person(1, 10, 0)];
		expect(interpolatePeople(a, b, 0)[0].x).toBe(0);
		expect(interpolatePeople(a, b, 1)[0].x).toBe(10);
		expect(interpolatePeople(a, b, 3)[0].x).toBe(10);
	});

	it('shows new people where they are and drops the gone', () => {
		const out = interpolatePeople(
			[person(1, 0, 0), person(2, 5, 5)],
			[person(1, 2, 0), person(3, 7, 7)],
			0.5
		);
		expect(out.map((p) => p.id)).toEqual([1, 3]);
		expect(out[1].x).toBe(7);
	});

	it('snaps over huge jumps', () => {
		const out = interpolatePeople([person(1, 0, 0)], [person(1, 100, 100)], 0.5);
		expect(out[0].x).toBe(100);
	});
});

describe('interpolateHerds', () => {
	it('blends herds and keeps their other fields', () => {
		const herd = (x: number): HerdView => ({ id: 1, kind: 'deer', x, y: 0, count: 3, tame: false });
		const out = interpolateHerds([herd(0)], [herd(4)], 0.25);
		expect(out[0].x).toBe(1);
		expect(out[0].kind).toBe('deer');
	});
});
