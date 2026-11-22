import { racingLine, SPAN } from './line';
import LINES from './lines.json';
import { LAYOUTS, type Layout, type Point } from './tracks';

// The tracks (tracks.ts): each a closed centre line through its control
// points, resampled about every metre, and the line the drivers aim for.
// Distances are metres. Each track sits in a world of its own size, always
// 16:9, which is drawn whole in the same frame from one fixed overhead view,
// like a slot car layout on a table: a bigger world is drawn smaller. Which
// one a race runs on is the admin's choice (settings.ts).

/** Half the tarmac's width. */
export const HALF_ROAD = 4.5;
/** Centre line to wall: the tarmac plus a strip of low-grip verge. */
export const HALF_CORRIDOR = 7;
/** Half a car's width, over its tyres. */
export const HALF_CAR = 1.07;
/** From the middle of a car to either end of it. */
export const NOSE = 2.1;
/** The track's walls, as the physics tells what touches what: the tow trucks go through them. */
export const WALLS = 0x0002;
/**
 * How far from the centre line a driver will place the middle of the car:
 * as far as keeps all of it on the tarmac, with a little to spare for the
 * way a car going round a bend sweeps out wider than it is, front and back.
 */
export const MAX_OFFSET = HALF_ROAD - HALF_CAR - 0.35;
/**
 * How much more grip a banked bend gives than a flat one, for each unit of
 * the tangent of its angle: the road leans into the turn, so some of what
 * holds a car on it is the road pushing up under it, not the tyres' grip.
 */
const BANKING = 1.2;

export type TrackId = keyof typeof LAYOUTS;
export type Track = ReturnType<typeof build>;

const TRACKS: Record<TrackId, Layout> = LAYOUTS;

/** Every track, ovals first, then road courses, each in the order tracks.ts lists them. */
export const TRACK_IDS = (Object.keys(TRACKS) as TrackId[]).sort(
	(a, b) => Number(TRACKS[a].kind === 'road') - Number(TRACKS[b].kind === 'road')
);

export const trackName = (id: TrackId) => TRACKS[id].name;
export const trackKind = (id: TrackId) => TRACKS[id].kind;

/** How big a track's world is, in metres. */
export const worldOf = (id: TrackId) => ({
	width: TRACKS[id].world,
	height: (TRACKS[id].world * 9) / 16
});

export const isTrackId = (id: unknown): id is TrackId =>
	typeof id === 'string' && Object.hasOwn(TRACKS, id);

const built = new Map<TrackId, Track>();

/** A track by id, worked out the first time it is asked for. */
export function getTrack(id: TrackId): Track {
	let track = built.get(id);
	if (!track) {
		track = build(id, TRACKS[id]);
		built.set(id, track);
	}
	return track;
}

/**
 * A track's centre line, sampled about every metre, with the direction of
 * travel at each sample and the normal across the track, and how much grip
 * its banking adds at each.
 */
export const centreOf = (id: TrackId) => {
	const line = centre(TRACKS[id].control);
	return { ...line, bank: banked(line, TRACKS[id].banking) };
};

function centre(control: Point[]) {
	// a Catmull-Rom spline through the control points, as a fine polyline
	const fine: Point[] = [];
	const count = control.length;
	for (let c = 0; c < count; c++) {
		const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((d) => control[(c + d + count) % count]);
		for (let k = 0; k < 64; k++) {
			const t = k / 64;
			const at = (a: number, b: number, c: number, d: number) =>
				0.5 *
				(2 * b +
					(c - a) * t +
					(2 * a - 5 * b + 4 * c - d) * t * t +
					(3 * b - a - 3 * c + d) * t ** 3);
			fine.push([at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])]);
		}
	}
	const along = [0];
	for (let i = 0; i < fine.length; i++) {
		const [ax, ay] = fine[i];
		const [bx, by] = fine[(i + 1) % fine.length];
		along.push(along[i] + Math.hypot(bx - ax, by - ay));
	}
	const length = along[fine.length];

	// the same line at even spacing, so sample i is i * step metres from the start
	const n = Math.round(length);
	const step = length / n;
	const x = new Float32Array(n);
	const y = new Float32Array(n);
	for (let i = 0, f = 0; i < n; i++) {
		const at = i * step;
		while (along[f + 1] < at) f++;
		const t = (at - along[f]) / (along[f + 1] - along[f]);
		const [ax, ay] = fine[f];
		const [bx, by] = fine[(f + 1) % fine.length];
		x[i] = ax + (bx - ax) * t;
		y[i] = ay + (by - ay) * t;
	}
	/** The sample each control point is at. */
	const knots = control.map((_, c) => Math.round(along[c * 64] / step) % n);

	// Which way round it goes. The infield, where the pits are, is on the side
	// it turns towards on the whole, and everything off the track is placed
	// from the centre line with negative `across` there (service.ts). So the
	// normal across the track points away from the infield: to the right of
	// the way it is driven on one driven anticlockwise on screen, as the first
	// tracks were, and to the left on one driven clockwise.
	let area = 0;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		area += x[i] * y[j] - x[j] * y[i];
	}
	const hand = area < 0 ? 1 : -1;

	// the direction of travel at each sample, and the normal across the track
	const tx = new Float32Array(n);
	const ty = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const a = (i + n - 1) % n;
		const b = (i + 1) % n;
		const d = Math.hypot(x[b] - x[a], y[b] - y[a]);
		tx[i] = (x[b] - x[a]) / d;
		ty[i] = (y[b] - y[a]) / d;
	}
	const nx = ty.map((v) => -v * hand);
	const ny = tx.map((v) => v * hand);
	return { n, step, length, x, y, tx, ty, nx, ny, hand, knots };
}

/** How many times the grip of a flat road each sample has, for its banking. */
function banked(
	{ n, knots }: { n: number; knots: number[] },
	banking: Layout['banking'] = []
): Float32Array {
	const degrees = new Float32Array(n);
	for (const [from, to, angle] of banking) {
		const [a, b] = [knots[from], knots[to]];
		for (let i = a; i !== b; i = (i + 1) % n) degrees[i] = angle;
	}
	// eased in and out of over a few metres, as a banked bend is
	const reach = 8;
	const bank = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		let sum = 0;
		for (let d = -reach; d <= reach; d++) sum += degrees[(i + d + n) % n];
		bank[i] = 1 + BANKING * Math.tan(((sum / (2 * reach + 1)) * Math.PI) / 180);
	}
	return bank;
}

function build(id: TrackId, layout: Layout) {
	const centred = centre(layout.control);
	const { n, step, length, x, y, tx, ty, nx, ny, hand, knots } = centred;
	const bank = banked(centred, layout.banking);
	const { width, height } = worldOf(id);

	// The racing line, as an offset along the normal (line.ts). It takes a
	// while to work out, so it is worked out ahead of time and kept, in
	// centimetres (scripts/race-lines.mjs); and now, if the track has changed since.
	const kept: number[] | undefined = (LINES as Record<string, number[]>)[id];
	const line =
		kept?.length === n
			? Float32Array.from(kept, (cm) => cm / 100)
			: racingLine(x, y, nx, ny, step, MAX_OFFSET, bank);
	const at = (i: number): [number, number] => {
		const j = ((i % n) + n) % n;
		return [x[j] + nx[j] * line[j], y[j] + ny[j] * line[j]];
	};

	// how sharply the racing line bends at each sample, as 1 / radius
	const bend = new Float32Array(n);
	for (let i = 0; i < n; i++) bend[i] = Math.abs(curve(at(i - SPAN), at(i), at(i + SPAN)));

	// which way the track bends at each sample: 1 towards the normal, -1 away from it
	const turn = new Int8Array(n);
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		turn[i] = Math.sign(tx[i] * ty[j] - ty[i] * tx[j]) * hand;
	}

	return {
		id,
		n,
		step,
		length,
		x,
		y,
		tx,
		ty,
		nx,
		ny,
		line,
		bend,
		turn,
		/** Which way round it is driven: 1 anticlockwise on screen, -1 clockwise. */
		hand,
		bank,
		knots,
		/** Its world, in metres. */
		width,
		height,
		/** Where its pits are (pits.ts). */
		pits: layout.pits
	};
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The race is worked out in metres and seconds; it is shown in miles an hour and feet. */
export const MPH = 3600 / 1609.344;
export const FEET = 1 / 0.3048;

/**
 * The triangle three points make, as what says how sharply the circle through
 * them bends: twice its area, signed by which way it turns, and its three
 * sides multiplied together. The circle's radius is the sides over twice that
 * area.
 */
export function triangle(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	cx: number,
	cy: number
): [number, number] {
	const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
	const sides =
		Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay);
	return [cross, sides];
}

/** How sharply the circle through three points bends, as 1 / radius, signed by which way. */
function curve(a: [number, number], b: [number, number], c: [number, number]) {
	const [cross, sides] = triangle(a[0], a[1], b[0], b[1], c[0], c[1]);
	return (2 * cross) / sides;
}

/**
 * The centre-line sample nearest a point. With `hint` (the sample the point
 * was last at) only the stretch around it is searched, so a car is never
 * matched to a different part of the track that happens to pass close by.
 */
export function nearest(track: Track, px: number, py: number, hint = -1): number {
	const { n, x, y } = track;
	const from = hint < 0 ? 0 : hint - 20;
	const to = hint < 0 ? n : hint + 20;
	let best = 0;
	let bestD = Infinity;
	for (let k = from; k < to; k++) {
		const i = ((k % n) + n) % n;
		const d = (px - x[i]) ** 2 + (py - y[i]) ** 2;
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

/** How far a point sits across the track from the centre line at sample i. */
export function lateral(track: Track, px: number, py: number, i: number): number {
	return (px - track.x[i]) * track.nx[i] + (py - track.y[i]) * track.ny[i];
}
