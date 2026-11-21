import { HALF_CORRIDOR, lateral, nearest, type Track, type TrackId } from './track';

// The recovery crews' side of a track: a service road round the infield just
// inside the wall, gates in that wall onto the track, three garages, each on
// a lay-by off the road, and bays on the grass where wrecks are left. The
// road runs one way, the way the race does. All of it is placed by track
// sample, like everything else, with the same `across` the cars use: negative
// is the infield, so the wall is at -HALF_CORRIDOR and the service road
// further in, at -RING.
//
// A truck cannot turn on the spot, so nothing here asks it to: the road, and
// every way on and off it, bends no tighter than a truck steers.

/** Centre line to the middle of the service road. */
export const RING = 10;
/** Half the service road's width. */
export const HALF_LANE = 1.5;
/** How far inside the service road the garage's lay-by runs, and a wreck is left. */
export const LAYBY = 6;
export const BAY = 3.8;

/** A lay-by leaves the service road this far before its garage and is back on it this far after. */
export const LAYBY_IN = 26;
export const LAYBY_OUT = 22;
/** A garage: how long it is, along the lay-by, and how wide. */
export const GARAGE = { length: 9, width: 6 };

/** Half a gate's opening, along the wall. */
export const HALF_GATE = 4;
/** A truck coming through a gate leaves the service road this far before it and is on the track this far after. */
export const SLIP = 10;
/** Where across the track a truck runs when it has just come on, or is about to go off. */
export const NEARSIDE = -3.8;
/** A truck is off the service road for a bay from BAY_IN before it to BAY_OUT after. */
export const BAY_IN = 14;
export const BAY_OUT = 20;

/**
 * The truck from above, x forward: half its length and width, how far behind
 * its middle the hook is, and how far either side of it the axles are.
 */
export const TRUCK = { long: 3, wide: 1.2, hook: 3.2, axle: 1.8 };
/** The tightest the service road bends, as a radius in metres, and the tightest any way on or off it does. */
export const TIGHTEST = 9;
export const STEER = 6.5;

/** Where on each track the garages, gates and bays are, as track samples. */
const LAYOUTS: Record<TrackId, { homes: number[]; gates: number[]; bays: number[] }> = {
	// At the end of the main straight, a little before the hairpin and the
	// corners after it, where most of the wrecks are, and on the far side.
	circuit: {
		homes: [36, 128, 310],
		gates: [8, 38, 74, 100, 126, 166, 196, 222, 244, 284, 314, 348, 374],
		bays: [68, 86, 168, 232, 346]
	},
	// Evenly round the lap, a third of it apart: one off the start line, one
	// as the right-hand bend opens out, one at the top of the left-hand bend.
	// Gates every 29 samples or so, one close after each garage, and bays in
	// pairs between the garages.
	oval: {
		homes: [0, 115, 230],
		gates: [11, 40, 69, 98, 126, 155, 184, 213, 241, 270, 299, 328],
		bays: [50, 70, 165, 185, 280, 300]
	}
};

export type Service = ReturnType<typeof build>;

const built = new Map<TrackId, Service>();

/** The service road and all on it for a track, worked out the first time it is asked for. */
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
 * A curve from one place and heading to another, as points a step apart: it leaves the first the way that faces and arrives at the second the
 * way that does, bending as little as it can between.
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
	const { homes, gates, bays } = LAYOUTS[track.id];

	/** How far round the lap it is from one sample on to another. */
	const ahead = (from: number, to: number) => (((to - from) % n) + n) % n;

	// The service road: the centre line moved RING into the infield, then eased
	// until it bends no tighter than a truck can turn and is nowhere nearer the
	// track than it set out.
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
		const radius = (i: number) => {
			const [a, b] = [(i + n - 3) % n, (i + 3) % n];
			const cross = (rx[i] - rx[a]) * (ry[b] - ry[a]) - (ry[i] - ry[a]) * (rx[b] - rx[a]);
			const sides =
				Math.hypot(rx[i] - rx[a], ry[i] - ry[a]) *
				Math.hypot(rx[b] - rx[i], ry[b] - ry[i]) *
				Math.hypot(rx[b] - rx[a], ry[b] - ry[a]);
			return sides / Math.abs(2 * cross || 1e-9);
		};
		for (let pass = 0; pass < 2000; pass++) {
			const tight = Array.from({ length: n }, (_, i) => radius(i) < TIGHTEST);
			if (!tight.includes(true)) break;
			const [ax, ay] = [rx.slice(), ry.slice()];
			for (let i = 0; i < n; i++) {
				// the bend itself and a little either side of it, so it stays one curve
				if (![-2, -1, 0, 1, 2].some((d) => tight[(i + d + n) % n])) continue;
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

	/** Where in the world a sample is, `across` from the centre line: on the track, through a gate, or in the infield. */
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

	/** Where a truck is parked, in the garage at `home`, and which way it faces. */
	function parked(home: number) {
		const [px, py] = place(home, -RING - LAYBY);
		const [ax, ay] = place(home - 2, -RING - LAYBY);
		const [bx, by] = place(home + 2, -RING - LAYBY);
		return { x: px, y: py, angle: Math.atan2(by - ay, bx - ax) };
	}

	/** The lay-by through the garage at `home`, from the service road and back to it. */
	const layby = (home: number) =>
		route([
			[home - LAYBY_IN, -RING],
			[home - 4, -RING - LAYBY],
			[home + 2, -RING - LAYBY],
			[home + LAYBY_OUT, -RING]
		]);

	/**
	 * A way to drive: through each `[sample, across]` in turn, easing across
	 * between one and the next. Samples count on round the lap and past the line
	 * without starting again, so the way is always forwards.
	 */
	function route(keys: [number, number][]): Route {
		const first = Math.round(keys[0][0]);
		const count = Math.round(keys[keys.length - 1][0]) - first + 1;
		const out: Route = {
			count,
			x: new Float64Array(count),
			y: new Float64Array(count),
			sample: new Int32Array(count),
			across: new Float64Array(count),
			along: new Float64Array(count),
			length: 0
		};
		let key = 0;
		for (let k = 0; k < count; k++) {
			const s = first + k;
			while (key + 2 < keys.length && s >= keys[key + 1][0]) key++;
			const [[s0, a0], [s1, a1]] = [keys[key], keys[key + 1]];
			const t = Math.max(0, Math.min(1, (s - s0) / Math.max(1, s1 - s0)));
			out.sample[k] = ((s % n) + n) % n;
			out.across[k] = a0 + (a1 - a0) * t * t * (3 - 2 * t);
			[out.x[k], out.y[k]] = place(s, out.across[k]);
		}
		// The corners taken off, both ends left where they are. Then it is eased
		// further wherever it still bends tighter than a truck steers, which it
		// does where a way across is laid over a bend of the road's own.
		const ease = (only?: boolean[]) => {
			const [ax, ay] = [out.x.slice(), out.y.slice()];
			for (let k = 1; k + 1 < count; k++) {
				if (only && ![-2, -1, 0, 1, 2].some((d) => only[k + d])) continue;
				out.x[k] = (ax[k - 1] + 2 * ax[k] + ax[k + 1]) / 4;
				out.y[k] = (ay[k - 1] + 2 * ay[k] + ay[k + 1]) / 4;
			}
		};
		for (let pass = 0; pass < 3; pass++) ease();
		for (let pass = 0; pass < 300; pass++) {
			const tight = Array.from({ length: count }, (_, k) => {
				if (k < 3 || k + 3 >= count) return false;
				const [a, b] = [k - 3, k + 3];
				const cross =
					(out.x[k] - out.x[a]) * (out.y[b] - out.y[a]) -
					(out.y[k] - out.y[a]) * (out.x[b] - out.x[a]);
				const sides =
					Math.hypot(out.x[k] - out.x[a], out.y[k] - out.y[a]) *
					Math.hypot(out.x[b] - out.x[k], out.y[b] - out.y[k]) *
					Math.hypot(out.x[b] - out.x[a], out.y[b] - out.y[a]);
				return sides < STEER * Math.abs(2 * cross);
			});
			if (!tight.includes(true)) break;
			ease(tight);
		}
		for (let k = 1; k < count; k++) {
			out.along[k] =
				out.along[k - 1] + Math.hypot(out.x[k] - out.x[k - 1], out.y[k] - out.y[k - 1]);
		}
		out.length = out.along[count - 1];
		return out;
	}

	/** A way to drive made of points on the track, each put at the sample it is nearest. */
	function trace(points: [number, number][], hint: number): Route {
		const count = points.length;
		const out: Route = {
			count,
			x: Float64Array.from(points, (point) => point[0]),
			y: Float64Array.from(points, (point) => point[1]),
			sample: new Int32Array(count),
			across: new Float64Array(count),
			along: new Float64Array(count),
			length: 0
		};
		for (let k = 0; k < count; k++) {
			hint = out.sample[k] = nearest(track, out.x[k], out.y[k], hint);
			out.across[k] = lateral(track, out.x[k], out.y[k], hint);
			if (k)
				out.along[k] =
					out.along[k - 1] + Math.hypot(out.x[k] - out.x[k - 1], out.y[k] - out.y[k - 1]);
		}
		out.length = out.along[count - 1];
		return out;
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
		const count = lead.length + way.count - join;
		const out: Route = {
			count,
			x: new Float64Array(count),
			y: new Float64Array(count),
			sample: new Int32Array(count),
			across: new Float64Array(count),
			along: new Float64Array(count),
			length: 0
		};
		for (let k = 0; k < count; k++) {
			// a point of the curve is where the way would have been by then
			const at = k < lead.length ? Math.round((k / lead.length) * join) : k - lead.length + join;
			[out.x[k], out.y[k]] = k < lead.length ? lead[k] : [way.x[at], way.y[at]];
			out.sample[k] = way.sample[at];
			out.across[k] = way.across[at];
			if (k)
				out.along[k] =
					out.along[k - 1] + Math.hypot(out.x[k] - out.x[k - 1], out.y[k] - out.y[k - 1]);
		}
		out.length = out.along[count - 1];
		return out;
	}

	return { homes, gates, bays, ahead, place, parked, layby, route, trace, drive };
}
