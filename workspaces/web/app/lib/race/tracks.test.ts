import { describe, expect, it } from 'vitest';
import { budget } from './budget';
import { APRON, BOX_ACROSS, pitsFor } from './pits';
import { pack, placing, record } from './recording';
import { ROSTER } from './roster';
import { LIMITS } from './settings';
import { drawGrid, RULES } from './sim';
import { RING } from './service';
import {
	getTrack,
	HALF_CORRIDOR,
	TRACK_IDS,
	trackKind,
	trackName,
	triangle,
	worldOf
} from './track';
import { LAYOUTS, WORLD } from './tracks';

// What every track has to be for the race to be run on it and drawn: all of
// it in its world, no two stretches of it so close that their walls meet, no
// bend tighter than a car or a tow truck can take, and room on the infield
// for its pits and on the straight behind the start line for the grid.

/** The tightest a centre line may bend, as a radius in metres: about the tightest hairpin the cars and trucks can get round. */
const TIGHTEST = 8.4;
/** Two stretches of a track this far apart along it or more are different stretches. */
const APART = 45;

describe.each(TRACK_IDS)('the %s', (id) => {
	const track = getTrack(id);
	const { n, x, y, length } = track;
	const { width, height } = worldOf(id);
	/** How far round the lap it is between two samples, the short way. */
	const round = (a: number, b: number) => Math.min(Math.abs(a - b), n - Math.abs(a - b));

	it('has a name, a kind and a 16:9 world', budget(id, 5_000), () => {
		expect(trackName(id)).toBeTruthy();
		expect(['oval', 'road']).toContain(trackKind(id));
		expect(width).toBeGreaterThanOrEqual(WORLD);
		expect(height).toBe((width * 9) / 16);
		expect(track.width).toBe(width);
		// the recordings keep positions in 16 bits: to a 256th of a metre in a
		// world under 256 m across, and to no worse than a 16th in any
		expect(placing(track)).toBeGreaterThanOrEqual(width < 256 ? 256 : 16);
		expect(Math.max(width, height) * placing(track)).toBeLessThanOrEqual(65535);
	});

	it('is all inside its world, walls and all', budget(id, 5_000), () => {
		for (let i = 0; i < n; i++) {
			expect(x[i]).toBeGreaterThan(HALF_CORRIDOR + 0.5);
			expect(x[i]).toBeLessThan(width - HALF_CORRIDOR - 0.5);
			expect(y[i]).toBeGreaterThan(HALF_CORRIDOR + 0.5);
			expect(y[i]).toBeLessThan(height - HALF_CORRIDOR - 0.5);
		}
	});

	it('bends no tighter than a car can take', budget(id, 5_000), () => {
		let tightest = Infinity;
		for (let i = 0; i < n; i++) {
			const [a, b] = [(i + n - 4) % n, (i + 4) % n];
			const [cross, sides] = triangle(x[a], y[a], x[i], y[i], x[b], y[b]);
			tightest = Math.min(tightest, sides / Math.abs(2 * cross || 1e-9));
		}
		expect(tightest).toBeGreaterThan(TIGHTEST);
	});

	it('has a wall of its own between every two stretches of it', budget(id, 5_000), () => {
		let closest = Infinity;
		for (let i = 0; i < n; i++) {
			for (let j = i + APART; j < n; j++) {
				if (round(i, j) < APART) continue;
				closest = Math.min(closest, Math.hypot(x[i] - x[j], y[i] - y[j]));
			}
		}
		expect(closest).toBeGreaterThan(2 * HALF_CORRIDOR + 1.5);
	});

	it('has room for its pits on the infield, clear of the rest of it', budget(id, 5_000), () => {
		const lane = pitsFor(track);
		// every box and truck stand, all the way back to the wall behind them,
		// further from every other stretch of the track than its wall
		for (const spot of [...lane.boxes, ...lane.stands]) {
			const own = ((Math.round(spot.sample) % n) + n) % n;
			const back = [
				spot.x - track.nx[own] * (APRON - BOX_ACROSS),
				spot.y - track.ny[own] * (APRON - BOX_ACROSS)
			];
			expect(back[0]).toBeGreaterThan(0);
			expect(back[0]).toBeLessThan(width);
			expect(back[1]).toBeGreaterThan(0);
			expect(back[1]).toBeLessThan(height);
			let nearest = Infinity;
			for (let j = 0; j < n; j++) {
				if (round(own, j) < APART) continue;
				nearest = Math.min(
					nearest,
					Math.hypot(back[0] - x[j], back[1] - y[j]),
					Math.hypot(spot.x - x[j], spot.y - y[j])
				);
			}
			expect(nearest, `at ${Math.round(spot.sample)}`).toBeGreaterThan(HALF_CORRIDOR + 0.5);
		}
		// and the lane itself
		for (const way of lane.ways) {
			let nearest = Infinity;
			for (let k = 0; k < way.count; k++) {
				for (let j = 0; j < n; j++) {
					if (round(way.sample[k], j) < APART) continue;
					nearest = Math.min(nearest, Math.hypot(way.x[k] - x[j], way.y[k] - y[j]));
				}
			}
			expect(nearest).toBeGreaterThan(RING - 2);
		}
	});

	it('has a straight behind the start line for the whole grid', budget(id, 5_000), () => {
		// as far back as the back of the grid with every car in the roster on it,
		// which on the oval runs a little way into the last bend
		for (let behind = 0; behind <= 6 + 6.5 * (ROSTER.length - 1); behind++) {
			expect(track.bend[(n - behind) % n]).toBeLessThan(1 / 30);
		}
	});

	it(
		'is a lap long enough to race on, and no longer than its world can show',
		budget(id, 5_000),
		() => {
			expect(length).toBeGreaterThan(300);
			expect(length).toBeLessThan(4 * (width + height));
		}
	);

	it('banks only where it says, and never takes grip away', budget(id, 5_000), () => {
		for (let i = 0; i < n; i++) expect(track.bank[i]).toBeGreaterThanOrEqual(1);
		if (!('banking' in LAYOUTS[id])) for (let i = 0; i < n; i++) expect(track.bank[i]).toBe(1);
	});

	it(
		'keeps a recording of the longest race it can have where a race is kept',
		budget(id, 5_000),
		() => {
			// the whole roster, as many laps as the admin can set, with pits: a
			// Durable Object keeps a value of up to 2 MB
			const laps = LIMITS.laps[1];
			const seed = 1;
			const recording = record(seed, drawGrid(seed, ROSTER, ROSTER.length), track, [], {
				...RULES,
				laps
			});
			expect(pack(recording).length).toBeLessThan(2_000_000);
		}
	);
});
