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
	 * worth of fuel whichever track it is. With `boxes`, the lane runs on from
	 * the way in, round a bend if need be, and the first box is level with
	 * that sample.
	 */
	pits: {
		from: number;
		slip: number;
		thirst: number;
		away?: [number, number];
		boxes?: number;
	};
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
	},
	/**
	 * The tri-oval: two long, steeply banked bends joined by a straight
	 * behind and a front stretch bent out in the middle, where the start line
	 * is, banked less. The pits are on the infield of the front stretch, in
	 * from the end of the last bend; the way out runs on round the infield of
	 * the first bend and joins on the back straight.
	 */
	daytona: {
		name: 'Daytona tri-oval',
		kind: 'oval',
		world: WORLD,
		...corners(
			[
				[124, 42, 27, 'L', 31],
				[36, 42, 27, 'L', 31],
				[80, 7, 70, 'L', 18]
			],
			0.35
		),
		pits: { from: 224, slip: 40, thirst: 1, away: [115, 155] }
	},
	/**
	 * A rectangle with its corners rounded off: two long straights, two short
	 * ones between the corners at each end, and four corners alike, all of a
	 * quarter turn and hardly banked. The pits are on the infield of the front
	 * straight, in from the short straight before it; the way out runs on round
	 * the infield of the first two corners and joins on the back straight.
	 */
	indianapolis: {
		name: 'Indianapolis',
		kind: 'oval',
		world: WORLD,
		...corners(
			[
				[127, 56, 22, 'L', 9],
				[127, 34, 22, 'L', 9],
				[33, 34, 22, 'L', 9],
				[33, 56, 22, 'L', 9]
			],
			0.6
		),
		pits: { from: 275, slip: 34, thirst: 1, away: [134, 184], boxes: 323 }
	},
	/**
	 * The paperclip: two long straights and a tight, lightly banked hairpin at
	 * each end. The pits run the length of the front straight and on round the
	 * infield of the first hairpin, joining on the back straight.
	 */
	martinsville: {
		name: 'Martinsville',
		kind: 'oval',
		world: WORLD,
		...corners(
			[
				[132.5, 45, 19.5, 'L', 12],
				[27.5, 45, 19.5, 'L', 12]
			],
			0.55
		),
		pits: { from: 204, slip: 42, thirst: 0.99, away: [76, 118], boxes: 287 }
	},
	/**
	 * The fast one: the main straight, the chicane at the end of it and the
	 * long right after, a second chicane, the two right-handers into the
	 * woods, the run down to the left-right-left onto the back straight and
	 * the long, widening last corner onto the main straight again. The pits
	 * are on the infield of the main straight, in from the last corner; the
	 * way out runs on beside the first chicane.
	 */
	monza: {
		name: 'Monza',
		kind: 'road',
		world: 240,
		control: [
			[142, 124.6],
			[128, 124],
			[113, 123],
			[97, 121.5],
			[90, 117],
			[83, 115],
			[76, 116.5],
			[69.0, 117.5],
			[61.0, 116.4],
			[53.5, 113.3],
			[47.1, 108.4],
			[42.2, 102.0],
			[39.1, 94.5],
			[38.0, 86.5],
			[38, 78],
			[38, 70],
			[37.8, 62],
			[36.5, 56],
			[34, 50],
			[33.5, 44],
			[34, 37],
			[33, 29],
			[35.5, 19.5],
			[42.5, 12.5],
			[52, 10],
			[60, 10],
			[69.5, 12.5],
			[76.5, 19],
			[83, 28.5],
			[89, 38],
			[95, 47.5],
			[100.5, 56.5],
			[105, 64],
			[110, 71],
			[116, 76.5],
			[123, 81],
			[131, 84.5],
			[140, 86],
			[152, 86.5],
			[166, 86.5],
			[181, 86.5],
			[196, 86],
			[211, 86],
			[221, 88.7],
			[228.3, 96],
			[231, 106],
			[228.3, 116],
			[221, 123.3],
			[211, 126],
			[196, 126],
			[178, 125.8],
			[160, 125.3]
		],
		pits: { from: 446, slip: 34, thirst: 0.9, away: [66, 92], boxes: 490 }
	},
	/**
	 * The Grand Prix course: the long front straight, the right-hander at the
	 * end of it and the esses climbing away from it, the back straight, the
	 * long loop at the far end, the Boot with its tight toe, and the climb
	 * back to the right-hander onto the front straight. The pits are on the
	 * infield of the front straight; the way out runs on round the inside of
	 * the first corner.
	 */
	glen: {
		name: 'Watkins Glen',
		kind: 'road',
		world: 252,
		control: [
			[166, 24],
			[180, 24],
			[194, 24],
			[208, 24],
			[222.5, 24.0],
			[233.0, 26.8],
			[240.7, 34.5],
			[243.5, 45.0],
			[243, 54],
			[241.5, 62],
			[236, 70],
			[228.5, 79],
			[219, 87],
			[207.5, 95],
			[195, 102],
			[181, 107],
			[167, 110],
			[140, 111.5],
			[125, 112],
			[110, 112.5],
			[95, 113],
			[80, 113],
			[65, 113],
			[53, 112],
			[44, 107],
			[38.5, 99],
			[38, 90],
			[41, 82],
			[46, 75.5],
			[50, 70.5],
			[52.5, 64],
			[51.5, 58],
			[48, 54.3],
			[42.5, 53],
			[28.5, 53.0],
			[18.5, 50.3],
			[11.2, 43.0],
			[8.5, 33.0],
			[11.2, 23.0],
			[18.5, 15.7],
			[28.5, 13.0],
			[40, 14],
			[46, 14],
			[56.0, 14.0],
			[65.9, 18.1],
			[70.0, 28.0],
			[70, 36],
			[70, 42],
			[70.0, 47.0],
			[71.5, 52.8],
			[75.8, 57.0],
			[81.5, 58.5],
			[87.2, 57.0],
			[91.5, 52.8],
			[93.0, 47.0],
			[93, 46],
			[93.0, 43.0],
			[95.5, 33.5],
			[102.5, 26.5],
			[112.0, 24.0],
			[124, 24],
			[136, 24],
			[148, 24],
			[157, 24]
		],
		pits: { from: 584, slip: 24, thirst: 0.96, away: [100, 132], boxes: 619 }
	},
	/**
	 * The long one: the hairpin at the end of the pit straight, the kink and
	 * climb onto the long straight up to the chicane at the top, the long
	 * right round the far end, the double left in the middle, the fast run
	 * down and round the far right, and the long sweep back to the chicane
	 * before the line. The pits are on the infield of the pit straight, in
	 * from before the chicane; the way out runs down the inside of the hairpin.
	 */
	spa: {
		name: 'Spa-Francorchamps',
		kind: 'road',
		world: 240,
		control: [
			[94.2, 107.9],
			[83.4, 109.8],
			[72.5, 111.7],
			[61.7, 113.6],
			[50.9, 115.6],
			[40, 117.5],
			[33.1, 118.7],
			[23.1, 118],
			[14.6, 112.8],
			[9.4, 104.1],
			[8.9, 94.1],
			[13, 85],
			[21, 78.8],
			[43, 67.5],
			[53, 62.5],
			[64, 57.5],
			[80, 50.5],
			[96, 43.5],
			[112, 36.5],
			[128, 29.5],
			[144, 22.5],
			[158, 16.5],
			[168, 13],
			[176, 13],
			[183, 15.5],
			[190, 16],
			[197, 14.5],
			[208.7, 13],
			[219.2, 15.8],
			[226.9, 23.5],
			[229.7, 34],
			[226.9, 44.5],
			[219.2, 52.2],
			[208.7, 55],
			[198, 53.2],
			[189, 51.2],
			[180, 50],
			[166, 51],
			[156.6, 51.2],
			[148.3, 56],
			[145, 65],
			[148.3, 74],
			[156.6, 78.8],
			[164, 80],
			[176, 81],
			[191.2, 82.7],
			[203.3, 92],
			[205.3, 107.2],
			[196, 119.3],
			[184.3, 121.9],
			[176, 120],
			[168, 115],
			[162, 109],
			[156, 103.5],
			[143.4, 99.2],
			[132.6, 101.1],
			[121.8, 103.1],
			[110.9, 105],
			[100.1, 106.9]
		],
		pits: { from: 550, slip: 30, thirst: 1, away: [85, 125], boxes: 642 }
	}
} satisfies Record<string, Layout>;
