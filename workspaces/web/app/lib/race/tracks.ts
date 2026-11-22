// The tracks /race can run on, as data: each one's shape, how big a world it
// sits in, its banking and where its pits are. track.ts works out the rest
// from these: the centre line, the racing line, the walls and the infield.
// Adding a track is adding an entry here, then running
// `node scripts/race-lines.mjs` to work out its racing line.

/** A point of a track's centre line, in metres from the top left of its world. */
export type Point = [number, number];

export type Layout = {
	/** What the admin's track picker calls it. */
	name: string;
	/** Ovals and road courses are listed apart in the picker. */
	kind: 'oval' | 'road';
	/**
	 * How wide its world is, in metres; it is always 16:9. The whole of it is
	 * shown in the same frame however big it is, so a bigger world has a longer
	 * lap, drawn smaller.
	 */
	world: number;
	/**
	 * The centre line's control points, driven in order. The first is the start
	 * line, with a straight behind it for the grid to form up on. Either way
	 * round will do: the pits and the infield go on whichever side the track
	 * turns towards on the whole.
	 */
	control: Point[];
	/**
	 * Its banking: from one control point to another, how far the road is
	 * banked, in degrees. Unbanked road is flat.
	 */
	banking?: [from: number, to: number, degrees: number][];
	/**
	 * Where its pits are (pits.ts): the sample the way in leaves the track at,
	 * and how long the way in is. The way out joins the track in the bend after
	 * the lane, or with `away`, runs on round the infield in line with the lane,
	 * leaves it at the first of those samples and joins the track at the second.
	 * `thirst` is how much fuel a metre of the track takes next to the next:
	 * more where there is less of it flat out, so that a lap raced burns a lap's
	 * worth of fuel whichever track it is.
	 */
	pits: { from: number; slip: number; thirst: number; away?: [number, number] };
};

/** The world most tracks sit in, metres across. */
export const WORLD = 160;

/**
 * An oval: a bend round each end, (x, radius) of its centre, joined by two
 * straights, as points about every `spacing` metres, in a world `world`
 * metres across. Driven anticlockwise on screen, so every bend is a left;
 * `start` is how far along the bottom straight the line is, as a share of it.
 */
export function oval(
	left: [number, number],
	right: [number, number],
	start: number,
	{ spacing = 8, world = WORLD } = {}
): Point[] {
	const cy = (world * 9) / 16 / 2;
	const [lx, lr] = left;
	const [rx, rr] = right;
	// where the straights touch each bend, as the angle round its centre
	const touch = Math.acos((lr - rr) / (rx - lx));
	const at = (cx: number, r: number, a: number): Point => [
		cx + r * Math.cos(a),
		cy + r * Math.sin(a)
	];
	const pieces: ((t: number) => Point)[] = [];
	const lengths: number[] = [];
	const straight = (a: Point, b: Point) => {
		pieces.push((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
		lengths.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
	};
	const bend = (cx: number, r: number, from: number, to: number) => {
		pieces.push((t) => at(cx, r, from + (to - from) * t));
		lengths.push(Math.abs(to - from) * r);
	};
	const bottomL = at(lx, lr, touch);
	const bottomR = at(rx, rr, touch);
	const line: Point = [
		bottomL[0] + (bottomR[0] - bottomL[0]) * start,
		bottomL[1] + (bottomR[1] - bottomL[1]) * start
	];
	straight(line, bottomR);
	bend(rx, rr, touch, -touch);
	straight(at(rx, rr, -touch), at(lx, lr, -touch));
	bend(lx, lr, -touch, touch - 2 * Math.PI);
	straight(bottomL, line);
	const points: Point[] = [];
	pieces.forEach((piece, k) => {
		const count = Math.max(1, Math.round(lengths[k] / spacing));
		for (let j = 0; j < count; j++) points.push(piece(j / count));
	});
	return points;
}

/**
 * A corner: the middle of the circle it is an arc of, (x, y), its radius,
 * which way it turns ('L' or 'R', as a driver sees it, on screen) and,
 * optionally, how far it is banked, in degrees.
 */
export type Corner = [x: number, y: number, radius: number, hand: 'L' | 'R', banked?: number];

/**
 * A track as its corners, driven in order, each joined to the next by the
 * straight that leaves one and meets the other square: its control points,
 * about every `spacing` metres, and its banking. It starts `start` of the
 * way along the straight into the first corner, as a share of it.
 */
export function corners(
	list: Corner[],
	start = 0.5,
	spacing = 4
): Pick<Layout, 'control' | 'banking'> {
	const circles = list.map(([x, y, r, hand, banked = 0]) => ({
		x,
		y,
		r,
		// which way round its middle the corner is driven: 1 clockwise on screen
		s: hand === 'R' ? 1 : -1,
		banked
	}));
	type Circle = (typeof circles)[number];
	/** Which way a car on a circle at a point is going. */
	const heading = (c: Circle, [px, py]: Point): Point => [
		(-(py - c.y) * c.s) / c.r,
		((px - c.x) * c.s) / c.r
	];
	/** The straight from one corner to the next: where it leaves the one and meets the other. */
	const straight = (a: Circle, b: Circle): [Point, Point] => {
		const [dx, dy] = [b.x - a.x, b.y - a.y];
		const far = Math.hypot(dx, dy);
		for (const side of [1, -1]) {
			for (const flip of [1, -1]) {
				const [ra, rb] = [a.r * a.s * flip, b.r * b.s * flip];
				if (Math.abs(ra - rb) > far) continue;
				const angle = Math.atan2(dy, dx) + side * Math.acos((ra - rb) / far);
				const [nx, ny] = [Math.cos(angle), Math.sin(angle)];
				const from: Point = [a.x + ra * nx, a.y + ra * ny];
				const to: Point = [b.x + rb * nx, b.y + rb * ny];
				const [tx, ty] = [to[0] - from[0], to[1] - from[1]];
				const long = Math.hypot(tx, ty);
				const [ha, hb] = [heading(a, from), heading(b, to)];
				if (
					long > 0 &&
					(ha[0] * tx + ha[1] * ty) / long > 0.999 &&
					(hb[0] * tx + hb[1] * ty) / long > 0.999
				) {
					return [from, to];
				}
			}
		}
		throw new Error(`No straight joins the corners at ${a.x}, ${a.y} and ${b.x}, ${b.y}`);
	};
	const count = circles.length;
	const straights = circles.map((a, k) => straight(a, circles[(k + 1) % count]));
	const control: Point[] = [];
	const banking: NonNullable<Layout['banking']> = [];
	const line = (a: Point, b: Point) => {
		const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing));
		for (let j = 0; j < steps; j++) {
			control.push([a[0] + ((b[0] - a[0]) * j) / steps, a[1] + ((b[1] - a[1]) * j) / steps]);
		}
	};
	const arc = (c: Circle, a: Point, b: Point) => {
		const from = Math.atan2(a[1] - c.y, a[0] - c.x);
		let sweep = (Math.atan2(b[1] - c.y, b[0] - c.x) - from) * c.s;
		while (sweep < 0) sweep += 2 * Math.PI;
		// a corner the straights either side of it meet nearly in line is barely one at all
		if (sweep > 2 * Math.PI - 1e-6) sweep = 0;
		const first = control.length;
		const steps = Math.max(1, Math.round((sweep * c.r) / spacing));
		for (let j = 0; j < steps; j++) {
			const angle = from + (c.s * sweep * j) / steps;
			control.push([c.x + c.r * Math.cos(angle), c.y + c.r * Math.sin(angle)]);
		}
		if (c.banked) banking.push([first, control.length, c.banked]);
	};
	// from the start line, along the rest of the straight into the first corner
	const [into, at] = straights[count - 1];
	const line0: Point = [into[0] + (at[0] - into[0]) * start, into[1] + (at[1] - into[1]) * start];
	line(line0, at);
	circles.forEach((c, k) => {
		arc(c, straights[(k + count - 1) % count][1], straights[k][0]);
		if (k < count - 1) line(...straights[k]);
	});
	line(into, line0);
	return { control, banking };
}

export const LAYOUTS = {
	/**
	 * A regular oval filling the world: two matching bends as wide as its
	 * height allows, and a straight of about 70 m between them on each side.
	 * The pits' way out runs on round the infield of the first bend and joins
	 * the back straight.
	 */
	oval: {
		name: 'Oval',
		kind: 'oval',
		world: WORLD,
		control: oval([44, 32], [116, 32], 0.5),
		pits: { from: 258, slip: 40, thirst: 1.06, away: [136, 180] }
	},
	/** The winding circuit /race ran on first. */
	circuit: {
		name: 'Circuit',
		kind: 'road',
		world: WORLD,
		control: [
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
		],
		pits: { from: 308, slip: 30, thirst: 1.23 }
	}
} satisfies Record<string, Layout>;
