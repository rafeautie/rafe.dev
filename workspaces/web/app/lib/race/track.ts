import { racingLine, SPAN } from './line';
import LINES from './lines.json';

// The tracks: each a closed centre line through its control points,
// resampled about every metre, and the line the drivers aim for. Distances
// are metres. Each track is watched whole from one fixed overhead view, like
// a slot car layout on a table: most fit a 160 x 90 world, and a bigger one
// is drawn smaller to fill the same view. Which one a race runs on is the
// admin's choice (settings.ts).

/** The world most tracks fit, and every track's is this shape. */
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

/**
 * A road course after the Watkins Glen Grand Prix circuit, in a world a good
 * deal bigger than the rest: run clockwise, the start line on the front
 * straight, then the 90, up through the Esses, down the back straight, the
 * Inner Loop, round the Outer Loop and the Boot, and through the last two
 * corners back onto the front straight. Its pits are on the infield, on the
 * driver's right.
 */
const CIRCUIT: [number, number][] = [
	[100, 124.1],
	[95, 124.0],
	[74, 123.5],
	[59, 122.5],
	[44, 121.3],
	[25.1, 120.1],
	[16.7, 117.7],
	[10.7, 109.9],
	[12.3, 96.7],
	[15, 82.0],
	[22.2, 69.5],
	[35.6, 63.0],
	[50.0, 60.1],
	[61.6, 50.3],
	[70.2, 41.0],
	[81, 32.8],
	[94, 31.3],
	[128.5, 30.5],
	[143.5, 30.0],
	[156, 29.5],
	[166, 30.3],
	[176, 35],
	[185, 39.5],
	[195, 40],
	[204, 36.5],
	[213, 31.5],
	[222, 30],
	[229.5, 32.8],
	[234.5, 38.0],
	[236.5, 45.0],
	[235, 52.0],
	[230, 58.0],
	[215.5, 66.0],
	[207, 74.0],
	[203.5, 78.8],
	[202, 84.5],
	[204, 89.8],
	[209.5, 93.2],
	[215, 94.2],
	[229, 94.5],
	[241, 94.3],
	[252, 94.3],
	[259, 96.3],
	[263, 102.0],
	[262.5, 109.0],
	[257.5, 114.5],
	[249.5, 116.8],
	[238, 117.5],
	[226, 117.8],
	[214, 118.1],
	[202.5, 118.5],
	[189.5, 118.8],
	[179.5, 116.8],
	[175.5, 107.5],
	[181.1, 91.9],
	[185.1, 80.2],
	[179.2, 71.7],
	[166.2, 72.1],
	[157, 74.8],
	[152, 79.5],
	[149, 89],
	[148.6, 103.5],
	[146.8, 114.5],
	[140.5, 121.6],
	[131, 124.2],
	[108, 124.1]
];

/**
 * A tri-oval, after Daytona's: a straight across the back, a long turn at
 * each end, and a front stretch bent out in the middle, where the line
 * is. Driven anticlockwise on screen, so every bend is a left. `turn` is the
 * radius of the turns at the ends; the front stretch is two straight `leg`s,
 * each set `kink` (radians) off level and bent into the other through a
 * curve of radius `apex`; `top` is how far down the world the back straight
 * runs. The back straight is as long as makes the ends meet. As points about
 * every `spacing` metres, from the line.
 */
function triOval(turn: number, leg: number, kink: number, apex: number, top: number, spacing = 4) {
	const back = 2 * apex * Math.sin(kink) + 2 * leg * Math.cos(kink) - 2 * turn * Math.sin(kink);
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
// as the radius of the turns, and the front stretch bent out about seven
// metres past where the turns end, its point at the bottom of the world.
const OVAL = triOval(32, 34, (10 * Math.PI) / 180, 50, 10);

/**
 * A track's layout: its name, its control points, how many times wider than
 * the usual world its world is, and which side of a driver the infield is on,
 * which is where the pits and everything else off the track are (service.ts):
 * the left, unless it is run clockwise; and on a track too twisty to line up
 * two by two for a restart just anywhere, the sample after which the field
 * does, on the run to the line.
 */
type Layout = {
	name: string;
	control: [number, number][];
	world?: number;
	infield?: 'left' | 'right';
	lineup?: number;
};

/** The tracks there are, by id. */
const TRACKS: Record<'oval' | 'circuit', Layout> = {
	oval: { name: 'Daytona', control: OVAL },
	circuit: {
		name: 'Watkins Glen',
		control: CIRCUIT,
		world: 272 / WORLD_W,
		infield: 'right',
		lineup: 612
	}
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
		track = build(id, TRACKS[id]);
		built.set(id, track);
	}
	return track;
}

/**
 * A track's centre line, sampled about every metre, with the direction of
 * travel at each sample and the normal across the track.
 */
export const centreOf = (id: TrackId) => centre(TRACKS[id].control, TRACKS[id].infield);

function centre(control: [number, number][], infield: Layout['infield'] = 'left') {
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

	// the direction of travel at each sample, and the normal across the track,
	// which points away from the infield
	const tx = new Float32Array(n);
	const ty = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const a = (i + n - 1) % n;
		const b = (i + 1) % n;
		const d = Math.hypot(x[b] - x[a], y[b] - y[a]);
		tx[i] = (x[b] - x[a]) / d;
		ty[i] = (y[b] - y[a]) / d;
	}
	const away = infield === 'left' ? 1 : -1;
	const nx = ty.map((v) => -v * away);
	const ny = tx.map((v) => v * away);
	return { n, step, length, x, y, tx, ty, nx, ny };
}

function build(id: TrackId, { control, world = 1, infield, lineup }: Layout) {
	const { n, step, length, x, y, tx, ty, nx, ny } = centre(control, infield);

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

	// which way the track bends at each sample, as across counts: 1 away from
	// the infield, -1 towards it (on most tracks, to the left and the right)
	const turn = new Int8Array(n);
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		turn[i] = Math.sign((tx[j] - tx[i]) * nx[i] + (ty[j] - ty[i]) * ny[i]);
	}

	/** The world the track is in, in metres, and how many of the view's pixels a metre is drawn as. */
	const [width, height] = [WORLD_W * world, WORLD_H * world];
	const scale = 4 / world;

	/** 1 if the normal points to the driver's right, as on most tracks, -1 if to the left. */
	const hand = infield === 'right' ? -1 : 1;

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
		width,
		height,
		scale,
		hand,
		lineup: lineup ?? null
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
