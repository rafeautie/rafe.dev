// The circuit: a closed centre line through the control points, resampled
// about every metre, and the line the drivers aim for. Distances are metres.
// The whole track fits a 160 x 90 world so it can be watched from one fixed
// overhead view, like a slot car layout on a table.

export const WORLD_W = 160;
export const WORLD_H = 90;
/** Half the tarmac's width. */
export const HALF_ROAD = 4.5;
/** Centre line to wall: the tarmac plus a strip of low-grip verge. */
export const HALF_CORRIDOR = 7;
/** How far from the centre line a driver will place the middle of the car. */
export const MAX_OFFSET = HALF_ROAD - 1.3;

// Driven in this order. The first point is the start line, on the long bottom
// straight; the grid forms up behind it.
const CONTROL: [number, number][] = [
	[80, 77],
	[130, 75],
	[148, 60],
	[146, 38],
	[132, 22],
	[108, 16],
	[90, 26],
	[84, 44],
	[68, 52],
	[54, 42],
	[52, 24],
	[36, 13],
	[16, 22],
	[12, 44],
	[14, 60],
	[24, 71],
	[44, 76]
];

function build() {
	// a Catmull-Rom spline through the control points, as a fine polyline
	const fine: [number, number][] = [];
	const count = CONTROL.length;
	for (let c = 0; c < count; c++) {
		const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((d) => CONTROL[(c + d + count) % count]);
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

	// The racing line, as an offset along the normal. Each point is moved
	// until it bends as much as the average of the stretches either side of
	// it, which spreads every corner over as wide an arc as the track allows:
	// out wide on the way in, across the apex, and wide again on the way out.
	// Working from long stretches down to short ones settles the big shapes
	// first.
	const line = new Float32Array(n);
	const at = (i: number): [number, number] => {
		const j = ((i % n) + n) % n;
		return [x[j] + nx[j] * line[j], y[j] + ny[j] * line[j]];
	};
	for (const k of [32, 16, 8, 4, 2, 1]) {
		for (let pass = 0; pass < 150; pass++) {
			for (let i = 0; i < n; i++) {
				const a = at(i - k);
				const b = at(i + k);
				const want = (curve(at(i - 2 * k), a, at(i)) + curve(at(i), b, at(i + 2 * k))) / 2;
				// where on the normal the line would run straight from a to b,
				// and how much each metre from there bends it
				const abx = b[0] - a[0];
				const aby = b[1] - a[1];
				const straight = -((x[i] - a[0]) * aby - (y[i] - a[1]) * abx) / (nx[i] * aby - ny[i] * abx);
				const nudged = straight + 0.01;
				const per = curve(a, [x[i] + nx[i] * nudged, y[i] + ny[i] * nudged], b) / 0.01;
				line[i] = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, straight + want / per));
			}
		}
	}

	// how sharply the racing line bends at each sample, as 1 / radius
	const bend = new Float32Array(n);
	for (let i = 0; i < n; i++) bend[i] = Math.abs(curve(at(i - 4), at(i), at(i + 4)));

	return { n, step, length, x, y, tx, ty, nx, ny, line, bend };
}

/** How sharply the circle through three points bends, as 1 / radius, signed by which way. */
function curve(a: [number, number], b: [number, number], c: [number, number]) {
	const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	return (
		(2 * cross) /
		(Math.hypot(b[0] - a[0], b[1] - a[1]) *
			Math.hypot(c[0] - b[0], c[1] - b[1]) *
			Math.hypot(c[0] - a[0], c[1] - a[1]))
	);
}

export const TRACK = build();

/**
 * The centre-line sample nearest a point. With `hint` (the sample the point
 * was last at) only the stretch around it is searched, so a car is never
 * matched to a different part of the track that happens to pass close by.
 */
export function nearest(px: number, py: number, hint = -1): number {
	const { n, x, y } = TRACK;
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
export function lateral(px: number, py: number, i: number): number {
	return (px - TRACK.x[i]) * TRACK.nx[i] + (py - TRACK.y[i]) * TRACK.ny[i];
}
