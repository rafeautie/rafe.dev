import { curvature, SPAN } from './line';
import type { Track } from './track';

// What a driver plans, a few seconds of road ahead: the path the car is going
// to take, as how far across the road it will be at each track sample, and
// from that the speed it can hold along it. The racing line's own speeds
// (the pace, in sim.ts) are only right on the racing line: a car going round
// the outside of another, or kept to the inside by one alongside, is on a
// different arc through the bend, tighter or wider, and has to slow for the
// one it is on, early enough to be down to it by the time it gets there.

/** The furthest ahead a plan looks, in track samples. */
export const FAR = 200;
/** The path being planned, as points, with SPAN more at either end to tell how it bends there. */
const xs = new Float64Array(FAR + 2 * SPAN + 1);
const ys = new Float64Array(FAR + 2 * SPAN + 1);

/**
 * Works out the speeds (m/s) at which a car at track sample `from`, doing
 * `speed`, can take the path it means to: `across(k)` is where across the
 * road that is, `k` samples on. They are written to `speeds`, one for each
 * sample from here on, as far as the plan goes, which is as far as the car
 * would take to stop and a little more: how many samples that is, is
 * returned. `limit` is the cornering the car has the grip for (m/s²), and
 * `pace` the speed the racing line takes at each sample, which is what the
 * plan comes down to at its far end, times `fade` for a car with less grip
 * than it had new.
 */
export function speedsAlong(
	track: Track,
	from: number,
	speed: number,
	across: (k: number) => number,
	limit: number,
	pace: Float32Array,
	fade: number,
	speeds: Float32Array
) {
	const { n, step, x, y, nx, ny } = track;
	const reach = Math.min((speed * speed) / (1.5 * limit) + 30, FAR * step);
	const far = Math.min(FAR, Math.max(SPAN, Math.ceil(reach / step)));
	for (let k = -SPAN, i = (from - SPAN + n) % n; k <= far + SPAN; k++, i = i + 1 === n ? 0 : i + 1) {
		const a = across(k);
		xs[k + SPAN] = x[i] + nx[i] * a;
		ys[k + SPAN] = y[i] + ny[i] * a;
	}
	// backwards from the far end, as the pace is worked out (paceFor in sim.ts)
	let v = pace[(from + far) % n] * fade;
	speeds[far] = v;
	for (let k = far - 1; k >= 0; k--) {
		const j = k + SPAN;
		const bend = Math.abs(
			curvature(xs[j - SPAN], ys[j - SPAN], xs[j], ys[j], xs[j + SPAN], ys[j + SPAN])
		);
		const braking = 0.9 * Math.sqrt(Math.max(0, limit * limit - (v * v * bend) ** 2));
		v = Math.min(60, Math.sqrt(limit / Math.max(bend, 1e-4)), Math.sqrt(v * v + 2 * braking * step));
		speeds[k] = v;
	}
	return far;
}
