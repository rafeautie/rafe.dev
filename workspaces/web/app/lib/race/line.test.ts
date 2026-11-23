import { describe, expect, it } from 'vitest';
import { budget } from './budget';
import { lapTime, leastBend, racingLine } from './line';
import { getTrack, HALF_CAR, HALF_ROAD, MAX_OFFSET, TRACK_IDS, triangle } from './track';

describe.each(TRACK_IDS)('the racing line on the %s', (id) => {
	const track = getTrack(id);
	const { n, x, y, nx, ny, step, line } = track;
	const lap = lapTime(x, y, nx, ny, step, track.bank);
	const best = lap(Float64Array.from(line));
	const wrap = (i: number) => ((i % n) + n) % n;

	/**
	 * The track's corners: each stretch where its middle bends one way more
	 * tightly than 40 m, as first and last sample and which way across, 1 or
	 * -1, is the inside. Bends the same way with no more than 30 m between them are
	 * one corner, which is how a driver takes them.
	 */
	const corners: [number, number, number][] = [];
	{
		const bends = (i: number) => {
			const [a, b, c] = [i - 4, i, i + 4].map(wrap);
			const [cross, sides] = triangle(x[a], y[a], x[b], y[b], x[c], y[c]);
			return Math.abs((2 * cross) / sides) > 1 / 40 ? Math.sign(cross) * track.hand : 0;
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

	it('is the one kept for it, worked out afresh', budget(id, 60_000), () => {
		const fresh = racingLine(x, y, nx, ny, step, MAX_OFFSET, track.bank);
		for (let i = 0; i < n; i++) expect(Math.abs(line[i] - fresh[i])).toBeLessThan(0.006);
	});

	it('keeps all of a car on the tarmac', budget(id, 5_000), () => {
		expect(MAX_OFFSET + HALF_CAR).toBeLessThan(HALF_ROAD - 0.2);
		for (const across of line) expect(Math.abs(across)).toBeLessThanOrEqual(MAX_OFFSET + 1e-6);
	});

	it(
		'is quicker than the line that bends least, and that than the middle of the road',
		budget(id, 5_000),
		() => {
			const least = lap(leastBend(x, y, nx, ny, MAX_OFFSET));
			expect(best).toBeLessThan(least - 0.05);
			expect(least).toBeLessThan(lap(new Float64Array(n)));
		}
	);

	/** How far a stretch of the track turns, in degrees. */
	const turned = (from: number, to: number) => {
		const [a, b] = [wrap(from), wrap(to)];
		const angle = Math.atan2(track.ty[b], track.tx[b]) - Math.atan2(track.ty[a], track.tx[a]);
		return (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) * 180) / Math.PI;
	};

	it(
		'takes every corner from the outside, across to the inside and out again',
		budget(id, 5_000),
		() => {
			expect(corners.length).toBeGreaterThanOrEqual(2);
			// (a kink in a chicane, which turns only a little, is driven all but
			// straight through, and is no corner to take that way)
			for (const [from, to, inside] of corners.filter(([from, to]) => turned(from, to) >= 45)) {
				const at = (k: number) => line[wrap(k)] * inside;
				// all the way in at the apex
				let apex = -Infinity;
				for (let k = from; k < to; k++) apex = Math.max(apex, at(k));
				expect(apex).toBeGreaterThan(MAX_OFFSET - 0.1);
				// and well over to the outside on the way in, and on the way out; or
				// on a banked corner, taken so fast that it is worth less to open it
				// out, past the middle of the road. Not where the next bend, or the
				// one before, is so near that the line is already setting up for it,
				// nor where it runs on into a gentler bend the same way, as the esses
				// at the Glen do from the first corner.
				const outside = (ks: number[]) => Math.min(...ks.map(at));
				const before = Array.from({ length: 30 }, (_, d) => from - 1 - d);
				const after = Array.from({ length: 30 }, (_, d) => to + d);
				const sweeping = (ks: number[]) => {
					const same = ks.filter((k) => {
						const [a, b, c] = [k - 4, k, k + 4].map(wrap);
						const [cross, sides] = triangle(x[a], y[a], x[b], y[b], x[c], y[c]);
						return (
							Math.abs((2 * cross) / sides) > 1 / 250 && Math.sign(cross) * track.hand === inside
						);
					});
					return same.length > ks.length / 2;
				};
				const near = (ks: number[]) =>
					sweeping(ks) ||
					corners.some(
						([f, t]) => f !== from && ks.some((k) => wrap(k) >= wrap(f) && wrap(k) < wrap(t))
					);
				const wide = track.bank[wrap(from)] > 1.01 ? 0 : -MAX_OFFSET / 2;
				if (!near(before)) expect(outside(before)).toBeLessThan(wide);
				if (!near(after)) expect(outside(after)).toBeLessThan(wide);
			}
		}
	);

	it('is slower with any corner taken a little earlier or later', budget(id, 5_000), () => {
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
