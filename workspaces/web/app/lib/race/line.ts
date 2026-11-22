// The racing line: the way round a track that takes the least time, for a
// car like the ones in the race, keeping all of the car on the tarmac.
//
// It is worked out in two goes, the way race engineers do it. First the
// line that bends least: each corner spread over as wide an arc as the road
// allows, out wide on the way in, across to the inside at the apex and out
// wide again on the way out. That is close to quickest, since the speed a
// corner can be taken at goes with how wide the arc is, but not quite: it
// puts the apex in the middle of every corner. A car has only so much power,
// though, and is slowest on the way out of a corner, so what it gives up on
// the way in to turn in later and straighten up sooner it gets back, and
// more, all the way down the straight after. So from there the line is
// moved, a stretch at a time, wherever that takes time off a lap as a
// middling car would drive it: as fast as its grip allows round each bend,
// braking at the last moment for the next one and pulling away from it as
// hard as its engine and its tyres let it. That makes the apex late, the
// more so the longer the straight after it.

/** The car the line is worked out for: a middling one, of the race's cars (sim.ts). */
const CAR = {
	/** Cornering grip a driver counts on, m/s²: the tyres' grip, as drivers in the middle of the field use it. */
	grip: 1.9 * 9.81 * 0.76,
	mass: 1000,
	/** The engine, W, and the most it can push, N. */
	power: 110_000,
	push: 11_000,
	/** Rolling resistance, N per m/s, and air, N per (m/s)². */
	roll: 30,
	air: 2.2
};

/** Samples either side that the bend at a sample is measured across, as the race measures it. */
export const SPAN = 4;

/**
 * Where the racing line runs across the road at each sample of a closed
 * centre line (`x`, `y`, sampled `step` metres apart, with `nx`, `ny` the
 * normal across it), no further than `limit` to either side.
 */
export function racingLine(
	x: Float32Array,
	y: Float32Array,
	nx: Float32Array,
	ny: Float32Array,
	step: number,
	limit: number
): Float32Array {
	return Float32Array.from(quicker(x, y, nx, ny, step, limit, leastBend(x, y, nx, ny, limit)));
}

/**
 * The line that bends least: the one that makes the sum of the squares of
 * how much it bends at every sample smallest. Each sample in turn is put
 * where that sum is least, given the line either side of it, as near as the
 * road allows; pass after pass, that settles. Measuring the bend across long
 * stretches first, then shorter and shorter ones, settles the big shapes
 * first, which would take a great many passes a sample at a time.
 */
export function leastBend(
	x: Float32Array,
	y: Float32Array,
	nx: Float32Array,
	ny: Float32Array,
	limit: number
) {
	const n = x.length;
	const line = new Float64Array(n);
	const wrap = (i: number) => ((i % n) + n) % n;
	const px = (i: number) => x[i] + nx[i] * line[i];
	const py = (i: number) => y[i] + ny[i] * line[i];
	for (const k of [32, 16, 8, 4, 2, 1]) {
		for (let pass = 0; pass < 200; pass++) {
			for (let i = 0; i < n; i++) {
				const [a, b, aa, bb] = [wrap(i - k), wrap(i + k), wrap(i - 2 * k), wrap(i + 2 * k)];
				const mx = (4 * (px(a) + px(b)) - px(aa) - px(bb)) / 6;
				const my = (4 * (py(a) + py(b)) - py(aa) - py(bb)) / 6;
				const want = (mx - x[i]) * nx[i] + (my - y[i]) * ny[i];
				line[i] = Math.max(-limit, Math.min(limit, want));
			}
		}
	}
	return line;
}

/**
 * A line made quicker: each stretch of it, long ones first, is pushed a
 * little to one side or the other, eased in and out so the line stays
 * smooth, wherever that makes the lap quicker, until no push does.
 */
function quicker(
	x: Float32Array,
	y: Float32Array,
	nx: Float32Array,
	ny: Float32Array,
	step: number,
	limit: number,
	start: Float64Array
) {
	const n = x.length;
	const line = start.slice();
	const lap = lapTime(x, y, nx, ny, step);
	let best = lap(line);
	const tried = new Float64Array(n);
	for (const [width, nudge] of [
		[24, 0.4],
		[16, 0.25],
		[10, 0.15],
		[6, 0.08],
		[4, 0.04],
		[3, 0.02]
	]) {
		for (let round = 0; round < 40; round++) {
			let better = false;
			for (let centre = 0; centre < n; centre += Math.max(2, Math.round(width / 3))) {
				for (const way of [1, -1]) {
					tried.set(line);
					for (let d = -width; d <= width; d++) {
						const j = (((centre + d) % n) + n) % n;
						const ease = 0.5 + 0.5 * Math.cos((Math.PI * d) / (width + 1));
						tried[j] = Math.max(-limit, Math.min(limit, line[j] + way * nudge * ease));
					}
					const time = lap(tried);
					if (time < best - 1e-6) {
						best = time;
						line.set(tried);
						better = true;
						break;
					}
				}
			}
			if (!better) break;
		}
	}
	return line;
}

/**
 * How long a lap takes along a line, as the middling car would drive it:
 * as fast round each bend as its grip allows, braking for the next one as
 * late as it can and pulling away as hard as it can, with whatever grip the
 * bend is not using.
 */
export function lapTime(
	x: Float32Array,
	y: Float32Array,
	nx: Float32Array,
	ny: Float32Array,
	step: number
) {
	const n = x.length;
	const px = new Float64Array(n);
	const py = new Float64Array(n);
	const bend = new Float64Array(n);
	const gap = new Float64Array(n);
	const top = new Float64Array(n);
	const v = new Float64Array(n);
	const { grip, mass, power, push, roll, air } = CAR;
	/** What is left of the grip, as m/s², with `side` of it taken going round the bend. */
	const spare = (side: number) => Math.sqrt(Math.max(0, grip * grip - side * side));
	return (line: Float64Array) => {
		for (let i = 0; i < n; i++) {
			px[i] = x[i] + nx[i] * line[i];
			py[i] = y[i] + ny[i] * line[i];
		}
		for (let i = 0; i < n; i++) {
			const a = (i + n - SPAN) % n;
			const b = (i + SPAN) % n;
			bend[i] = Math.abs(curvature(px[a], py[a], px[i], py[i], px[b], py[b]));
			const j = (i + 1) % n;
			gap[i] = Math.hypot(px[j] - px[i], py[j] - py[i]) || step;
			top[i] = Math.min(60, Math.sqrt(grip / Math.max(bend[i], 1e-4)));
		}
		// pulling away, round the lap twice so it carries across the line,
		// then braking, backwards round it twice
		v.set(top);
		for (let k = 0; k < 2 * n; k++) {
			const i = k % n;
			const j = (i + 1) % n;
			const s = v[i];
			const drive = Math.min(push, power / Math.max(s, 8)) / mass;
			const drag = (roll * s + air * s * s) / mass;
			const most = Math.min(drive, spare(s * s * bend[i]) / 2) - drag;
			v[j] = Math.min(v[j], Math.sqrt(Math.max(0, s * s + 2 * most * gap[i])));
		}
		for (let k = 2 * n - 1; k >= 0; k--) {
			const i = k % n;
			const j = (i + 1) % n;
			const s = v[j];
			const drag = (roll * s + air * s * s) / mass;
			const most = 0.9 * spare(s * s * bend[j]) + drag;
			v[i] = Math.min(v[i], Math.sqrt(s * s + 2 * most * gap[i]));
		}
		let time = 0;
		for (let i = 0; i < n; i++) time += (2 * gap[i]) / (v[i] + v[(i + 1) % n]);
		return time;
	};
}

/** How sharply the circle through three points bends, as 1 / radius, signed by which way. */
export function curvature(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
	const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
	const sides =
		Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay);
	return (2 * cross) / (sides || 1e-9);
}
