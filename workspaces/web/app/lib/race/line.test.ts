import { describe, expect, it } from 'vitest';
import { lapTime, leastBend, racingLine } from './line';
import { getTrack, HALF_CAR, HALF_ROAD, MAX_OFFSET, TRACK_IDS, triangle } from './track';

describe.each(TRACK_IDS)('the racing line on the %s', (id) => {
	const track = getTrack(id);
	const { n, x, y, nx, ny, step, line } = track;
	const lap = lapTime(x, y, nx, ny, step);
	const best = lap(Float64Array.from(line));
	const wrap = (i: number) => ((i % n) + n) % n;

	/**
	 * The track's corners: each stretch where its middle bends one way more
	 * tightly than 40 m, as first and last sample and which way, 1 or -1, is
	 * the inside. Bends the same way with no more than 30 m between them are
	 * one corner, which is how a driver takes them.
	 */
	const corners: [number, number, number][] = [];
	{
		const bends = (i: number) => {
			const [a, b, c] = [i - 4, i, i + 4].map(wrap);
			const [cross, sides] = triangle(x[a], y[a], x[b], y[b], x[c], y[c]);
			return Math.abs((2 * cross) / sides) > 1 / 40 ? Math.sign(cross) : 0;
		};
		let start = 0;
		while (bends(start)) start++;
		for (let i = start; i < start + n; ) {
			const way = bends(i);
			if (!way) {
				i++;
				continue;
			}
			let j = i;
			while (bends(j) === way) j++;
			const last = corners.at(-1);
			if (last && last[2] === way && i - last[1] <= 30) last[1] = j;
			else corners.push([i, j, way]);
			i = j;
		}
	}

	it('is the one kept for it, worked out afresh', { timeout: 60_000 }, () => {
		const fresh = racingLine(x, y, nx, ny, step, MAX_OFFSET);
		for (let i = 0; i < n; i++) expect(Math.abs(line[i] - fresh[i])).toBeLessThan(0.006);
	});

	it('keeps all of a car on the tarmac', () => {
		expect(MAX_OFFSET + HALF_CAR).toBeLessThan(HALF_ROAD - 0.2);
		for (const across of line) expect(Math.abs(across)).toBeLessThanOrEqual(MAX_OFFSET + 1e-6);
	});

	it('is quicker than the line that bends least, and that than the middle of the road', () => {
		const least = lap(leastBend(x, y, nx, ny, MAX_OFFSET));
		expect(best).toBeLessThan(least - 0.05);
		expect(least).toBeLessThan(lap(new Float64Array(n)));
	});

	it('takes every corner from the outside, across to the inside and out again', () => {
		expect(corners.length).toBeGreaterThanOrEqual(2);
		for (const [from, to, inside] of corners) {
			const at = (k: number) => line[wrap(k)] * inside;
			// all the way in at the apex
			let apex = -Infinity;
			for (let k = from; k < to; k++) apex = Math.max(apex, at(k));
			expect(apex).toBeGreaterThan(MAX_OFFSET - 0.1);
			// and well over to the outside on the way in, and on the way out
			const outside = (ks: number[]) => Math.min(...ks.map(at));
			const before = Array.from({ length: 30 }, (_, d) => from - 1 - d);
			const after = Array.from({ length: 30 }, (_, d) => to + d);
			expect(outside(before)).toBeLessThan(-MAX_OFFSET / 2);
			expect(outside(after)).toBeLessThan(-MAX_OFFSET / 2);
		}
	});

	it('is slower with any corner taken a little earlier or later', () => {
		for (const [from, to] of corners) {
			for (const by of [-4, -2, 2, 4]) {
				// the line through the corner moved on (or back) by a few metres,
				// easing into that and out of it either side
				const moved = Float64Array.from(line);
				for (let k = from - 25; k < to + 25; k++) {
					const ease = Math.min(1, (k - from + 25) / 10, (to + 25 - k) / 10);
					const was = line[wrap(k)];
					moved[wrap(k)] = Math.max(
						-MAX_OFFSET,
						Math.min(MAX_OFFSET, was + ease * (line[wrap(k - by)] - was))
					);
				}
				expect(lap(moved), `${from}-${to} by ${by}`).toBeGreaterThan(best);
			}
		}
	});
});
