import {
	HALF_CORRIDOR,
	HALF_ROAD,
	clamp,
	lateral,
	nearest,
	triangle,
	type Track,
	type TrackId
} from './track';

// What is off the track on its infield side, and the ways there are to drive
// about it: the pit lane and all that is on it (pits.ts), which the tow
// trucks use too (recovery.ts). All of it is placed by track sample, like
// everything else, with the same `across` the cars use: negative is the
// infield, so the wall is at -HALF_CORRIDOR and the pit lane further in, at
// -RING.
//
// A truck cannot turn on the spot, so nothing here asks it to: every way
// worked out for one bends no tighter than a truck steers.

/** Centre line to the middle of the pit lane. */
export const RING = 10;
/** Half the pit lane's width: it runs from the wall to the boxes. */
export const HALF_LANE = 2.2;
/**
 * The truck from above, x forward: half its length and width, how far behind
 * its middle the hook is, and how far either side of it the axles are.
 */
export const TRUCK = { long: 3, wide: 1.2, hook: 3.2, axle: 1.8 };
/** Half the truck's width over its tyres. */
export const TRUCK_HALF = TRUCK.wide + 0.22;
/**
 * The furthest from the centre line the middle of a truck out on the track
 * runs if all of it is to stay on the tarmac, with some to spare: round a
 * bend its back wheels follow a little inside its front ones.
 */
export const KERBSIDE = HALF_ROAD - TRUCK_HALF - 0.45;
/** Where across the track a truck runs when it has just come on, or is about to go off: on the infield side, all of it on the tarmac. */
export const NEARSIDE = -KERBSIDE;
/** The tightest the line the pit lane is on bends, as a radius in metres, and the tightest any way worked out for a truck does. */
export const TIGHTEST = 9;
const STEER = 6.5;

export type Service = ReturnType<typeof build>;

const built = new Map<TrackId, Service>();

/** The ways about the infield of a track, worked out the first time they are asked for. */
export function serviceFor(track: Track): Service {
	let service = built.get(track.id);
	if (!service) {
		service = build(track);
		built.set(track.id, service);
	}
	return service;
}

/** Somewhere, facing some way. */
export type Pose = { x: number; y: number; angle: number };

export type Route = {
	/** How many points, about a metre apart. */
	count: number;
	x: Float64Array;
	y: Float64Array;
	/** The sample each point is at, and how far across. */
	sample: Int32Array;
	across: Float64Array;
	/** Metres from the start to each point, and to the end. */
	along: Float64Array;
	length: number;
};

/**
 * Whether any of the five points from `from` on bends too tightly. On a way
 * that is a loop of `loop` points, they are counted on round it.
 */
function nearTight(tight: Uint8Array, from: number, loop = 0) {
	for (let k = from; k < from + 5; k++) if (tight[loop ? k % loop : k]) return true;
	return false;
}

/** A way of `count` points, none of them placed yet. */
const blank = (count: number): Route => ({
	count,
	x: new Float64Array(count),
	y: new Float64Array(count),
	sample: new Int32Array(count),
	across: new Float64Array(count),
	along: new Float64Array(count),
	length: 0
});

/** Measures a way once its points are placed: how far along it each is, and how long it is. */
function measure(out: Route) {
	for (let k = 1; k < out.count; k++) {
		out.along[k] = out.along[k - 1] + Math.hypot(out.x[k] - out.x[k - 1], out.y[k] - out.y[k - 1]);
	}
	out.length = out.along[out.count - 1];
	return out;
}

/**
 * A curve from one place and heading to another, as points a step apart: it
 * leaves the first the way that faces and arrives at the second the way that
 * does, bending as little as it can between.
 */
export function curve(from: Pose, to: Pose): [number, number][] {
	const far = Math.hypot(to.x - from.x, to.y - from.y);
	const arm = far * 0.4;
	const [bx, by] = [from.x + Math.cos(from.angle) * arm, from.y + Math.sin(from.angle) * arm];
	const [cx, cy] = [to.x - Math.cos(to.angle) * arm, to.y - Math.sin(to.angle) * arm];
	const steps = Math.max(2, Math.ceil(far * 4));
	return Array.from({ length: steps + 1 }, (_, k) => {
		const t = k / steps;
		const [a, b, c, d] = [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
		return [a * from.x + b * bx + c * cx + d * to.x, a * from.y + b * by + c * cy + d * to.y];
	});
}

function build(track: Track) {
	const { n, x, y, nx, ny } = track;

	/** How far round the lap it is from one sample on to another. */
	const ahead = (from: number, to: number) => (((to - from) % n) + n) % n;

	// The line the pit lane is on, all the way round the lap, though the lane
	// is only on it where the pits are: the centre line moved RING into the
	// infield, then eased until it bends no tighter than a truck can turn and
	// is nowhere nearer the track than it set out. Whatever is further into
	// the infield is placed from it.
	const ring = (() => {
		const rx = Float64Array.from(x, (v, i) => v - nx[i] * RING);
		const ry = Float64Array.from(y, (v, i) => v - ny[i] * RING);
		for (let pass = 0; pass < 60; pass++) {
			const [ax, ay] = [rx.slice(), ry.slice()];
			for (let i = 0; i < n; i++) {
				const [a, b] = [(i + n - 1) % n, (i + 1) % n];
				rx[i] = (ax[a] + 2 * ax[i] + ax[b]) / 4;
				ry[i] = (ay[a] + 2 * ay[i] + ay[b]) / 4;
				// back out to its distance from the nearest of the track
				for (let k = i - 40; k <= i + 40; k++) {
					const j = ((k % n) + n) % n;
					// nearly all of the track is nowhere near, which can be told without a square root
					if ((rx[i] - x[j]) ** 2 + (ry[i] - y[j]) ** 2 > RING * RING + 0.01) continue;
					const d = Math.hypot(rx[i] - x[j], ry[i] - y[j]);
					if (d < RING) {
						rx[i] = x[j] + ((rx[i] - x[j]) * RING) / d;
						ry[i] = y[j] + ((ry[i] - y[j]) * RING) / d;
					}
				}
			}
		}
		// Where the track bends tightly with the infield inside it, so does that:
		// those stretches are eased further, off the wall, until a truck can take
		// them without slowing to a crawl.
		const tight = new Uint8Array(n);
		for (let pass = 0; pass < 2000; pass++) {
			for (let i = 0; i < n; i++) {
				const [a, b] = [(i + n - 3) % n, (i + 3) % n];
				const [cross, sides] = triangle(rx[a], ry[a], rx[i], ry[i], rx[b], ry[b]);
				tight[i] = Number(sides / Math.abs(2 * cross || 1e-9) < TIGHTEST);
			}
			if (!tight.includes(1)) break;
			const [ax, ay] = [rx.slice(), ry.slice()];
			for (let i = 0; i < n; i++) {
				// the bend itself and a little either side of it, so it stays one curve
				if (!nearTight(tight, i + n - 2, n)) continue;
				const [a, b] = [(i + n - 1) % n, (i + 1) % n];
				rx[i] = (ax[a] + 2 * ax[i] + ax[b]) / 4;
				ry[i] = (ay[a] + 2 * ay[i] + ay[b]) / 4;
			}
		}
		// which way is further into the infield from each point of it
		const ix = new Float64Array(n);
		const iy = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			const [a, b] = [(i + n - 1) % n, (i + 1) % n];
			const d = Math.hypot(rx[b] - rx[a], ry[b] - ry[a]);
			ix[i] = (ry[b] - ry[a]) / d;
			iy[i] = -(rx[b] - rx[a]) / d;
		}
		return { x: rx, y: ry, ix, iy };
	})();

	/** Where in the world a sample is, `across` from the centre line: on the track, through the wall, or in the infield. */
	function place(sample: number, across: number): [number, number] {
		const i = ((Math.round(sample) % n) + n) % n;
		const edge: [number, number] = [x[i] - nx[i] * HALF_CORRIDOR, y[i] - ny[i] * HALF_CORRIDOR];
		if (across >= -HALF_CORRIDOR) return [x[i] + nx[i] * across, y[i] + ny[i] * across];
		const inside = Math.max(0, -RING - across);
		const road: [number, number] = [
			ring.x[i] + ring.ix[i] * inside,
			ring.y[i] + ring.iy[i] * inside
		];
		if (across <= -RING) return road;
		// through the wall, from the one to the other
		const t = (-HALF_CORRIDOR - across) / (RING - HALF_CORRIDOR);
		return [edge[0] + (road[0] - edge[0]) * t, edge[1] + (road[1] - edge[1]) * t];
	}

	/**
	 * A way to drive: through each `[sample, across]` in turn, easing across
	 * between one and the next. Samples count on round the lap and past the line
	 * without starting again, so the way is always forwards.
	 */
	function route(keys: [number, number][]): Route {
		const first = Math.round(keys[0][0]);
		const count = Math.round(keys[keys.length - 1][0]) - first + 1;
		const out = blank(count);
		let key = 0;
		for (let k = 0; k < count; k++) {
			const s = first + k;
			while (key + 2 < keys.length && s >= keys[key + 1][0]) key++;
			const [[s0, a0], [s1, a1]] = [keys[key], keys[key + 1]];
			const t = clamp((s - s0) / Math.max(1, s1 - s0), 0, 1);
			out.sample[k] = ((s % n) + n) % n;
			out.across[k] = a0 + (a1 - a0) * t * t * (3 - 2 * t);
			[out.x[k], out.y[k]] = place(s, out.across[k]);
		}
		// The corners taken off, both ends left where they are. Then it is eased
		// further wherever it still bends tighter than a truck steers, which it
		// does where a way across is laid over a bend of the road's own.
		const ease = (only?: Uint8Array) => {
			const [ax, ay] = [out.x.slice(), out.y.slice()];
			for (let k = 1; k + 1 < count; k++) {
				if (only && !nearTight(only, k - 2)) continue;
				out.x[k] = (ax[k - 1] + 2 * ax[k] + ax[k + 1]) / 4;
				out.y[k] = (ay[k - 1] + 2 * ay[k] + ay[k + 1]) / 4;
			}
		};
		for (let pass = 0; pass < 3; pass++) ease();
		const tight = new Uint8Array(count);
		for (let pass = 0; pass < 300; pass++) {
			for (let k = 3; k + 3 < count; k++) {
				const [a, b] = [k - 3, k + 3];
				const [cross, sides] = triangle(out.x[a], out.y[a], out.x[k], out.y[k], out.x[b], out.y[b]);
				tight[k] = Number(sides < STEER * Math.abs(2 * cross));
			}
			if (!tight.includes(1)) break;
			ease(tight);
		}
		return measure(out);
	}

	/** A way to drive made of points on the track, each put at the sample it is nearest. */
	function trace(points: [number, number][], hint: number): Route {
		const out = blank(points.length);
		points.forEach(([px, py], k) => {
			[out.x[k], out.y[k]] = [px, py];
			hint = out.sample[k] = nearest(track, px, py, hint);
			out.across[k] = lateral(track, px, py, hint);
		});
		return measure(out);
	}

	/**
	 * The way through `keys` for a truck that is at `from`, which may be a little
	 * off it or not facing along it: it curves onto the way over the first
	 * `joining` metres, and is on it from there.
	 */
	function drive(from: Pose, keys: [number, number][], joining = 9): Route {
		const way = route(keys);
		let join = 1;
		while (join + 1 < way.count && way.along[join] < joining) join++;
		const onto = Math.atan2(way.y[join] - way.y[join - 1], way.x[join] - way.x[join - 1]);
		const lead = curve(from, { x: way.x[join], y: way.y[join], angle: onto }).slice(0, -1);
		const out = blank(lead.length + way.count - join);
		for (let k = 0; k < out.count; k++) {
			// a point of the curve is where the way would have been by then
			const at = k < lead.length ? Math.round((k / lead.length) * join) : k - lead.length + join;
			[out.x[k], out.y[k]] = k < lead.length ? lead[k] : [way.x[at], way.y[at]];
			out.sample[k] = way.sample[at];
			out.across[k] = way.across[at];
		}
		return measure(out);
	}

	return { ahead, place, route, trace, drive };
}
