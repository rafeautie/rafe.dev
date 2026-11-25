import { racingLine, SPAN } from './line';
import LINES from './lines.json';

// The tracks: each a closed centre line through its control points,
// resampled about every metre, and the line the drivers aim for. Distances
// are metres. Every track fits the same 160 x 90 world so it can be watched
// from one fixed overhead view, like a slot car layout on a table. Which one
// a race runs on is the admin's choice (settings.ts).

export const WORLD_W = 160;
export const WORLD_H = 90;
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

// Each track is its control points, driven in order. The first point is the
// start line, on the bottom straight; the grid forms up behind it.

/** The winding circuit /race ran on first. */
const CIRCUIT: [number, number][] = [
	[80, 77],
	[130, 75],
	[148, 60],
	[146, 38],
	[132, 22],
	[108, 16],
	[90, 26],
	[84, 42],
	[68, 49],
	[54, 40],
	[52, 24],
	[36, 13],
	[16, 22],
	[12, 44],
	[14, 60],
	[24, 71],
	[44, 76]
];

/**
 * A tri-oval, after Daytona's: a straight across the back, a long banked turn
 * at each end, and a front stretch bent out in the middle, where the line
 * is. Driven anticlockwise on screen, so every bend is a left. `turn` is the
 * radius of the turns at the ends; the front stretch is two straight `leg`s,
 * each set `kink` (radians) off level and bent into the other through a
 * curve of radius `apex`; `top` is how far down the world the back straight
 * runs. The back straight is as long as makes the ends meet. As points about
 * every `spacing` metres, from the line.
 */
function triOval(turn: number, leg: number, kink: number, apex: number, top: number, spacing = 8) {
	const back =
		2 * apex * Math.sin(kink) + 2 * leg * Math.cos(kink) - 2 * turn * Math.sin(kink);
	const points: [number, number][] = [];
	// driven from the line on, heading right along the bottom of the screen
	let [x, y, heading] = [0, 0, 0];
	const straight = (length: number) => {
		const count = Math.max(1, Math.round(length / spacing));
		for (let j = 0; j < count; j++) {
			points.push([x, y]);
			x += (Math.cos(heading) * length) / count;
			y += (Math.sin(heading) * length) / count;
		}
	};
	/** A bend to the left, which on a screen, y down, turns the heading back. */
	const bend = (radius: number, sweep: number) => {
		const count = Math.max(1, Math.round((radius * sweep) / spacing));
		const [cx, cy] = [x + radius * Math.sin(heading), y - radius * Math.cos(heading)];
		for (let j = 0; j < count; j++) {
			points.push([x, y]);
			heading -= sweep / count;
			[x, y] = [cx - radius * Math.sin(heading), cy + radius * Math.cos(heading)];
		}
	};
	bend(apex, kink);
	straight(leg);
	bend(turn, Math.PI - kink);
	straight(back);
	bend(turn, Math.PI - kink);
	straight(leg);
	bend(apex, kink);
	const high = Math.min(...points.map(([, py]) => py));
	return points.map(([px, py]): [number, number] => [WORLD_W / 2 + px, top + py - high]);
}

// Daytona, made small: a back straight about two and a half times as long
// as the turns are tight, and the front stretch bent out about seven
// metres past where the turns end, its point at the bottom of the world.
const OVAL = triOval(30, 37, (11 * Math.PI) / 180, 40, 11);

/** The tracks there are, by id. */
const TRACKS = {
	oval: { name: 'Daytona', control: OVAL },
	circuit: { name: 'Circuit', control: CIRCUIT }
};

export type TrackId = keyof typeof TRACKS;
export type Track = ReturnType<typeof build>;

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

export const trackName = (id: TrackId) => TRACKS[id].name;

export const isTrackId = (id: unknown): id is TrackId =>
	typeof id === 'string' && Object.hasOwn(TRACKS, id);

const built = new Map<TrackId, Track>();

/** A track by id, worked out the first time it is asked for. */
export function getTrack(id: TrackId): Track {
	let track = built.get(id);
	if (!track) {
		track = build(id, TRACKS[id].control);
		built.set(id, track);
	}
	return track;
}

/**
 * A track's centre line, sampled about every metre, with the direction of
 * travel at each sample and the normal across the track.
 */
export const centreOf = (id: TrackId) => centre(TRACKS[id].control);

function centre(control: [number, number][]) {
	// a Catmull-Rom spline through the control points, as a fine polyline
	const fine: [number, number][] = [];
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
	const nx = ty.map((v) => -v);
	const ny = tx.slice();
	return { n, step, length, x, y, tx, ty, nx, ny };
}

function build(id: TrackId, control: [number, number][]) {
	const { n, step, length, x, y, tx, ty, nx, ny } = centre(control);

	// The racing line, as an offset along the normal (line.ts). It takes a
	// while to work out, so it is worked out ahead of time and kept, in
	// centimetres (scripts/race-lines.mjs); and now, if the track has changed since.
	const kept: number[] | undefined = (LINES as Record<string, number[]>)[id];
	const line =
		kept?.length === n
			? Float32Array.from(kept, (cm) => cm / 100)
			: racingLine(x, y, nx, ny, step, MAX_OFFSET);
	const at = (i: number): [number, number] => {
		const j = ((i % n) + n) % n;
		return [x[j] + nx[j] * line[j], y[j] + ny[j] * line[j]];
	};

	// how sharply the racing line bends at each sample, as 1 / radius
	const bend = new Float32Array(n);
	for (let i = 0; i < n; i++) bend[i] = Math.abs(curve(at(i - SPAN), at(i), at(i + SPAN)));

	// which way the track bends at each sample: 1 to the left, -1 to the right
	const turn = new Int8Array(n);
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		turn[i] = Math.sign(tx[i] * ty[j] - ty[i] * tx[j]);
	}

	return { id, n, step, length, x, y, tx, ty, nx, ny, line, bend, turn };
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
