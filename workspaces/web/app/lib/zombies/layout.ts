import type { WeaponId } from './weapons';

// The map as it's drawn: a corner of a run-down town, laid out in metres with
// x running east and z running south. Main Street bends through the middle,
// with an apartment courtyard, a back alley and a loading yard to the north,
// and a diner, a motel parking lot and a gas station to the south. Players
// start in the parking lot and buy their way out through doors and gates.
//
// Everything here is shapes: buildings and rooms are polygons, walls and
// fences are lines, and doors, windows and wall guns sit on those lines.
// map.ts turns it into collision and a grid for the zombies' route finding;
// scene.ts draws it.

export type Pt = [number, number];

export type GroundKind = 'asphalt' | 'sidewalk' | 'concrete' | 'dirt' | 'grass' | 'tile';
export type Finish = 'brick' | 'brick_red' | 'plaster' | 'concrete' | 'siding' | 'metal';
export type WallKind = 'brick' | 'lowwall' | 'fence' | 'chainlink' | 'hedge' | 'debris';
export type DoorKind = 'door' | 'gate' | 'debris';
export type MachineKind = 'box' | 'jugg' | 'speed' | 'tap' | 'revive';
export type PropKind =
	| 'car'
	| 'truck'
	| 'dumpster'
	| 'barrier'
	| 'tree'
	| 'pine'
	| 'shrub'
	| 'lamp'
	| 'pole'
	| 'hydrant'
	| 'bench'
	| 'barrel'
	| 'crate'
	| 'pallet_rack'
	| 'pump'
	| 'post'
	| 'aircon'
	| 'utility_box'
	| 'trash_can'
	| 'trashbag'
	| 'tyre'
	| 'box'
	| 'generator'
	| 'table'
	| 'counter'
	| 'shelf';

// A solid block: nobody goes in. Windows on its walls open onto a dark room
// that zombies climb out of.
export type Building = {
	poly: Pt[];
	height: number;
	finish: Finish;
	roof?: 'flat' | 'gable';
	sign?: string;
};

// A building players walk into: walls along its outline, a floor and a roof.
export type Room = {
	poly: Pt[];
	height: number;
	finish: Finish;
	floor: GroundKind;
	sign?: string;
};

export type Wall = { kind: WallKind; line: Pt[] };
export type Segment = [Pt, Pt];

export type Layout = {
	// the playable grid covers [0, size[0]] by [0, size[1]]
	size: [number, number];
	ground: { kind: GroundKind; poly: Pt[] }[];
	// drawn under the ground: lane lines, parking bays, the forecourt's paint
	paint: Segment[];
	// kerbs along the road's edges
	curbs: Pt[][];
	buildings: Building[];
	rooms: Room[];
	walls: Wall[];
	// gaps cut in room walls and in other walls, free to walk through
	openings: Segment[];
	doors: { at: Segment; cost: number; kind: DoorKind }[];
	windows: Segment[];
	// `toward` picks the side, for a wall players reach from both
	wallBuys: { at: Segment; weapon: WeaponId; toward?: Pt }[];
	// a cabinet or the box, standing at `at` and facing `face` degrees (0 is
	// south, 90 east)
	machines: { kind: MachineKind; at: Pt; face: number }[];
	props: { kind: PropKind; at: Pt; rot: number }[];
	spawns: Pt[];
	playerSpawns: Pt[];
	// a point in each part of the map, for its name on screen
	names: { at: Pt; name: string }[];
	// canopies and awnings: a roof on posts, drawn only
	canopies: { poly: Pt[]; height: number }[];
};

// A street-aligned frame: s runs along the street, t across it, positive t
// to the right of travel (south, for a street running east).
function frame(origin: Pt, toward: Pt) {
	const dx = toward[0] - origin[0];
	const dz = toward[1] - origin[1];
	const len = Math.hypot(dx, dz);
	const ux = dx / len;
	const uz = dz / len;
	const at = (s: number, t: number): Pt => [
		round(origin[0] + ux * s - uz * t),
		round(origin[1] + uz * s + ux * t)
	];
	return {
		at,
		angle: (Math.atan2(uz, ux) * 180) / Math.PI,
		rect: (s0: number, t0: number, s1: number, t1: number): Pt[] => [
			at(s0, t0),
			at(s1, t0),
			at(s1, t1),
			at(s0, t1)
		],
		seg: (s0: number, t0: number, s1: number, t1: number): Segment => [at(s0, t0), at(s1, t1)]
	};
}

const round = (v: number) => Math.round(v * 100) / 100;

// A rectangle turned about its middle.
function box(cx: number, cz: number, w: number, d: number, deg: number): Pt[] {
	const a = (deg * Math.PI) / 180;
	const c = Math.cos(a);
	const s = Math.sin(a);
	return (
		[
			[-w / 2, -d / 2],
			[w / 2, -d / 2],
			[w / 2, d / 2],
			[-w / 2, d / 2]
		] as Pt[]
	).map(([x, z]) => [round(cx + x * c - z * s), round(cz + x * s + z * c)]);
}

// The point a share t of the way along a segment.
const lerp = (a: Pt, b: Pt, t: number): Pt => [
	round(a[0] + (b[0] - a[0]) * t),
	round(a[1] + (b[1] - a[1]) * t)
];
// The piece of a segment between shares t0 and t1.
const part = (a: Pt, b: Pt, t0: number, t1: number): Segment => [lerp(a, b, t0), lerp(a, b, t1)];

// Main Street's middle line, and where it bends. West of B it climbs a
// little to the north; east of C it falls away south.
const A: Pt = [-12, 61.1];
const B: Pt = [32, 50];
const C: Pt = [64, 50];
const D: Pt = [90, 58];
const E: Pt = [122, 74];
const W = frame(B, [B[0] + (B[0] - A[0]), B[1] + (B[1] - A[1])]); // s < 0 runs west
const E1 = frame(C, D);
const E2 = frame(D, E);
const ROAD = 4.5; // half the road's width
const WALK = 7.5; // to the building line

// Offsets a line sideways, mitring the corners.
function offset(line: Pt[], d: number): Pt[] {
	return line.map((p, i) => {
		const prev = line[i - 1];
		const next = line[i + 1];
		const n = (a: Pt, b: Pt): Pt => {
			const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
			return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
		};
		const n0 = prev ? n(prev, p) : n(p, next!);
		const n1 = next ? n(p, next) : n0;
		let mx = n0[0] + n1[0];
		let mz = n0[1] + n1[1];
		const ml = Math.hypot(mx, mz);
		mx /= ml;
		mz /= ml;
		const k = d / (mx * n0[0] + mz * n0[1]);
		return [round(p[0] + mx * k), round(p[1] + mz * k)];
	});
}

const street = [A, B, C, D, E];
const band = (d0: number, d1: number): Pt[] => [
	...offset(street, d0),
	...offset(street, d1).reverse()
];
// where the building lines bend, north and south
const NB: Pt = offset(street, -WALK)[1];
const NC: Pt = offset(street, -WALK)[2];
const ND: Pt = offset(street, -WALK)[3];
const SB: Pt = offset(street, WALK)[1];
const SC: Pt = offset(street, WALK)[2];
const SD: Pt = offset(street, WALK)[3];

// ---- the parking lot, where everyone starts ------------------------------
const LOT_W = 37; // the diner's east wall
const LOT_E = 63; // the chain-link to the gas station
const LOT_N = 58; // the low wall along the sidewalk
const MOTEL_A: Pt = [LOT_W, 80];
const MOTEL_B: Pt = [LOT_E, 83];

// ---- the diner, on the bend ----------------------------------------------
const DINER_BACK_W = W.at(-15, 22);
const DINER: Pt[] = [W.at(-15, WALK), SB, [LOT_W, SC[1]], [LOT_W, 72], DINER_BACK_W];
const KITCHEN: Pt[] = [DINER_BACK_W, [LOT_W, 72], [LOT_W, 80], W.at(-15, 30)];

// ---- the alley, north of the middle of Main Street ----------------------
const ALLEY_W = 44; // its mouth on Main Street
const ALLEY_E = 48;
const SHOP_A_BACK: Segment = [W.at(-4, -18.6), [ALLEY_W, 33.5]];
const LANE_W_N: Pt = W.at(-4, -23);
const LANE_E: Segment = [
	[ALLEY_E, 33],
	[LOT_E, 26.3]
];
const LANE_E_N: Segment = [
	[ALLEY_E, 29.5],
	[LOT_E, 22.8]
];

// ---- the loading yard and warehouse --------------------------------------
const WAREHOUSE = E1.rect(2, -30, 24, -46);

// ---- the gas station -------------------------------------------------------
const STORE = E2.rect(2, 12, 16, 24);

export const LAYOUT: Layout = {
	size: [112, 100],
	ground: [
		// everything is rough ground to start with, then paved over
		{ kind: 'dirt', poly: box(56, 50, 160, 140, 0) },
		{ kind: 'sidewalk', poly: band(-WALK, WALK) },
		{ kind: 'asphalt', poly: band(-ROAD, ROAD) },
		// the parking lot
		{ kind: 'asphalt', poly: [[LOT_W, LOT_N], [LOT_E, LOT_N], MOTEL_B, MOTEL_A] },
		// the courtyard's lawn and its paths
		{ kind: 'grass', poly: W.rect(-25, -7.5, -4, -31) },
		{ kind: 'sidewalk', poly: W.rect(-17, -7.5, -14, -31) },
		{ kind: 'sidewalk', poly: W.rect(-25, -20.5, -4, -18.5) },
		// the backyards
		{ kind: 'grass', poly: W.rect(-40, WALK, -15, 44) },
		{ kind: 'sidewalk', poly: W.rect(-24.5, WALK, -21.5, 13) },
		// the alley
		{
			kind: 'asphalt',
			poly: [
				[ALLEY_W, 42.5],
				[ALLEY_E, 42.5],
				[ALLEY_E, 29],
				[ALLEY_W, 29]
			]
		},
		{ kind: 'asphalt', poly: [SHOP_A_BACK[0], SHOP_A_BACK[1], [ALLEY_W, 28.5], LANE_W_N] },
		{ kind: 'asphalt', poly: [LANE_E[0], LANE_E[1], LANE_E_N[1], LANE_E_N[0]] },
		// the loading yard, and the gas station's forecourt
		{ kind: 'concrete', poly: [[LOT_E, 42.5], NC, E1.at(26, -7.5), E1.at(26, -46), [LOT_E, 4]] },
		{ kind: 'concrete', poly: [SC, SD, E2.at(18, WALK), E2.at(18, 34), [LOT_E, 92]] },
		// inside
		{ kind: 'tile', poly: DINER },
		{ kind: 'concrete', poly: WAREHOUSE },
		{ kind: 'tile', poly: STORE }
	],
	curbs: [offset(street, -ROAD), offset(street, ROAD)],
	paint: [
		// the middle line, broken
		...dashes(street, 3, 3),
		// parking bays along the lot's north wall and down the middle
		...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(
			(i): Segment => [
				[39 + i * 2.6, LOT_N + 0.4],
				[39 + i * 2.6, LOT_N + 5.4]
			]
		),
		...[0, 1, 2, 3, 4, 5, 6].map(
			(i): Segment => [
				[42 + i * 2.6, 67],
				[42 + i * 2.6, 72]
			]
		),
		[
			[42, 69.5],
			[57.6, 69.5]
		]
	],
	buildings: [
		// the apartments wrap the courtyard on two sides
		{ poly: W.rect(-38, -7.5, -25, -44), height: 10.5, finish: 'brick_red', sign: 'APARTMENTS' },
		{ poly: W.rect(-25, -31, -4, -44), height: 10.5, finish: 'brick_red' },
		// the corner shop and the shops along the alley
		{
			poly: [
				W.at(-6, -7.5),
				NB,
				[ALLEY_W, 42.5],
				SHOP_A_BACK[1],
				SHOP_A_BACK[0],
				W.at(-4, -13),
				W.at(-6, -13)
			],
			height: 7,
			finish: 'plaster',
			sign: 'HARDWARE'
		},
		{
			poly: [[ALLEY_E, 42.5], [LOT_E, 42.5], LANE_E[1], LANE_E[0]],
			height: 6,
			finish: 'brick',
			sign: 'PAWN'
		},
		{
			poly: [LANE_W_N, [ALLEY_W, 28.5], LANE_E_N[0], LANE_E_N[1], [LOT_E, 2], W.at(-4, -44)],
			height: 9,
			finish: 'concrete'
		},
		// the corner at D, and the block beyond the yard
		{
			poly: [E1.at(26, -7.5), ND, E2.at(24, -7.5), E2.at(24, -30), E1.at(26, -30)],
			height: 8,
			finish: 'brick'
		},
		{
			poly: [E1.at(26, -30), E2.at(24, -30), E2.at(30, -60), E1.at(24, -60)],
			height: 11,
			finish: 'concrete'
		},
		{ poly: [[LOT_E, 22.8], E1.at(2, -30), E1.at(2, -46), [LOT_E, 2]], height: 5, finish: 'metal' },
		// the diner's kitchen and the motel behind the lot
		{ poly: KITCHEN, height: 4, finish: 'plaster' },
		{
			poly: [MOTEL_A, MOTEL_B, [LOT_E, 96], [LOT_W - 4, 96]],
			height: 6.5,
			finish: 'plaster',
			sign: 'MOTEL'
		},
		// two houses in the backyards
		{ poly: box(...W.at(-27, 19), 8, 9, W.angle + 4), height: 5, finish: 'siding', roof: 'gable' },
		{ poly: box(...W.at(-21, 34), 9, 7, W.angle - 6), height: 5, finish: 'siding', roof: 'gable' },
		// behind the gas station
		{
			poly: [E2.at(16, 12), E2.at(30, 12), E2.at(30, 40), E2.at(16, 40)],
			height: 7,
			finish: 'brick'
		}
	],
	rooms: [
		{ poly: DINER, height: 4.2, finish: 'plaster', floor: 'tile', sign: 'DINER' },
		{ poly: WAREHOUSE, height: 7, finish: 'metal', floor: 'concrete' },
		{ poly: STORE, height: 4, finish: 'brick', floor: 'tile', sign: 'GAS' }
	],
	walls: [
		// the street's ends, blocked with barriers and wrecks
		{ kind: 'debris', line: [W.at(-29, -WALK), W.at(-29, WALK)] },
		{ kind: 'debris', line: [E2.at(20, -WALK), E2.at(20, 12)] },
		// and blocked between its parts, each with a way cleared through
		{
			kind: 'debris',
			line: [
				[34.5, 42.5],
				[34.5, 57.5]
			]
		},
		{
			kind: 'debris',
			line: [
				[LOT_E, 42.5],
				[LOT_E, 57.5]
			]
		},
		// the lot's low wall, and the chain-link down its east side
		{
			kind: 'lowwall',
			line: [
				[LOT_W, LOT_N],
				[LOT_E, LOT_N]
			]
		},
		{ kind: 'chainlink', line: [[LOT_E, LOT_N], MOTEL_B] },
		// the courtyard's railings onto the street and its wall onto the alley
		{ kind: 'chainlink', line: [W.at(-25, -WALK), W.at(-6, -WALK)] },
		{ kind: 'brick', line: [W.at(-4, -18.6), W.at(-4, -31)] },
		// the backyards' fences
		{ kind: 'fence', line: [W.at(-31, 8), W.at(-15, 8)] },
		{ kind: 'fence', line: [W.at(-31, 8), W.at(-31, 40), W.at(-15, 40), W.at(-15, 30)] },
		{ kind: 'fence', line: [W.at(-31, 28), W.at(-26, 28)] },
		{ kind: 'fence', line: [W.at(-19.5, 28), W.at(-15, 28)] },
		{ kind: 'hedge', line: [W.at(-18, 12), W.at(-18, 21)] },
		// the loading yard's fence onto the street, and its east wall
		{ kind: 'chainlink', line: [[LOT_E, 42.5], NC, E1.at(26, -WALK)] },
		// the gas station's back wall
		{ kind: 'brick', line: [[LOT_E, 88], STORE[3]] }
	],
	openings: [
		// the warehouse's roller door, up
		part(WAREHOUSE[0], WAREHOUSE[1], 0.4, 0.62),
		// the store's front door
		part(STORE[3], STORE[0], 0.5, 0.68),
		// gaps in the backyard fences
		[W.at(-26, 28), W.at(-19.5, 28)]
	],
	doors: [
		{
			at: [
				[47, LOT_N],
				[51, LOT_N]
			],
			cost: 750,
			kind: 'gate'
		},
		{
			at: [
				[LOT_W, 63],
				[LOT_W, 65]
			],
			cost: 750,
			kind: 'door'
		},
		{ at: W.seg(-10, WALK, -8, WALK), cost: 1000, kind: 'door' },
		{
			at: [
				[34.5, 47.5],
				[34.5, 51.5]
			],
			cost: 1000,
			kind: 'debris'
		},
		{
			at: [
				[LOT_E, 48],
				[LOT_E, 52]
			],
			cost: 1250,
			kind: 'debris'
		},
		{ at: W.seg(-24.5, 8, -21.5, 8), cost: 1000, kind: 'gate' },
		{ at: W.seg(-17, -WALK, -14, -WALK), cost: 1250, kind: 'gate' },
		{
			at: [
				[ALLEY_W, 42.5],
				[ALLEY_E, 42.5]
			],
			cost: 1000,
			kind: 'gate'
		},
		{ at: W.seg(-4, -21.5, -4, -19.5), cost: 1000, kind: 'door' },
		{
			at: [
				[LOT_E, 22.8],
				[LOT_E, 26.3]
			],
			cost: 1250,
			kind: 'gate'
		},
		{ at: E1.seg(10, -WALK, 14, -WALK), cost: 1250, kind: 'gate' },
		{
			at: [
				[LOT_E, 68],
				[LOT_E, 71]
			],
			cost: 1500,
			kind: 'gate'
		}
	],
	windows: [
		// the motel's rooms onto the lot
		part(MOTEL_A, MOTEL_B, 0.14, 0.2),
		part(MOTEL_A, MOTEL_B, 0.46, 0.52),
		part(MOTEL_A, MOTEL_B, 0.8, 0.86),
		// the kitchen, from the diner
		part(DINER_BACK_W, [LOT_W, 72], 0.45, 0.55),
		// the apartments
		W.seg(-25, -14, -25, -12.5),
		W.seg(-21, -31, -19.5, -31),
		W.seg(-11, -31, -9.5, -31),
		W.seg(-28, -WALK, -26.5, -WALK),
		// the shops, front and back
		[
			[36, 42.5],
			[37.5, 42.5]
		],
		[
			[55, 42.5],
			[56.5, 42.5]
		],
		[
			[LOT_E, 34],
			[LOT_E, 35.5]
		],
		part(SHOP_A_BACK[0], SHOP_A_BACK[1], 0.5, 0.57),
		[
			[ALLEY_W, 37],
			[ALLEY_W, 38.5]
		],
		// a house in the backyards
		part(...(box(...W.at(-27, 19), 8, 9, W.angle + 4).slice(0, 2) as Segment), 0.4, 0.6),
		// the warehouse's back and side
		part(WAREHOUSE[3], WAREHOUSE[2], 0.6, 0.67),
		part(WAREHOUSE[1], WAREHOUSE[2], 0.4, 0.5),
		// the gas station: its store and its back wall
		part(STORE[1], STORE[2], 0.5, 0.6),
		part([LOT_E, 88], STORE[3], 0.45, 0.53)
	],
	wallBuys: [
		{ at: part(MOTEL_A, MOTEL_B, 0.6, 0.67), weapon: 'm14' },
		{
			at: [
				[LOT_W, 59.5],
				[LOT_W, 61.5]
			],
			weapon: 'olympia',
			toward: [40, 60]
		},
		{ at: part(DINER[4], DINER[0], 0.35, 0.5), weapon: 'mp5', toward: [30, 65] },
		{ at: W.seg(-25, -24, -25, -22), weapon: 'ak74u' },
		{
			at: [
				[ALLEY_E, 36],
				[ALLEY_E, 38]
			],
			weapon: 'remington'
		},
		{ at: W.seg(-15, 24, -15, 26), weapon: 'olympia' },
		{ at: W.seg(-5.5, -WALK, -3.5, -WALK), weapon: 'm14' },
		{ at: part(WAREHOUSE[0], WAREHOUSE[3], 0.4, 0.55), weapon: 'galil' },
		{ at: part(STORE[0], STORE[1], 0.4, 0.55), weapon: 'mp5', toward: E2.at(9, 18) }
	],
	machines: [
		{ kind: 'box', at: [49, 80.75], face: 180 - 6.7 },
		{ kind: 'revive', at: [LOT_W + 0.55, 75], face: 90 },
		{ kind: 'speed', at: [LOT_W - 0.6, 68.5], face: -90 },
		{ kind: 'jugg', at: E1.at(18, -45.4), face: -E1.angle },
		{ kind: 'tap', at: E2.at(15.4, 18), face: -90 - E2.angle }
	],
	props: [
		// the lot: parked cars, one crashed, a dumpster by the motel
		{ kind: 'car', at: [40.3, 61], rot: 88 },
		{ kind: 'car', at: [42.9, 60.8], rot: 93 },
		{ kind: 'car', at: [55.9, 61.1], rot: 86 },
		{ kind: 'car', at: [61.1, 60.9], rot: 91 },
		{ kind: 'car', at: [43.3, 68.2], rot: 92 },
		{ kind: 'car', at: [51.1, 70.8], rot: 88 },
		{ kind: 'car', at: [56.2, 68.3], rot: 84 },
		{ kind: 'car', at: [58.6, 76.4], rot: 31 },
		{ kind: 'dumpster', at: [40.5, 79.2], rot: 6.6 },
		{ kind: 'lamp', at: [45, 58.8], rot: 90 },
		{ kind: 'lamp', at: [62.2, 74], rot: 180 },
		{ kind: 'trash_can', at: [53.8, 81.6], rot: 0 },
		{ kind: 'trashbag', at: [41.9, 79.8], rot: 20 },
		{ kind: 'aircon', at: [44.4, 80.5], rot: 6.6 },
		{ kind: 'aircon', at: [57.6, 82.1], rot: 6.6 },
		// Main Street: lamps, hydrants, abandoned cars
		{ kind: 'lamp', at: W.at(-20, -6.6), rot: 90 + W.angle },
		{ kind: 'lamp', at: W.at(-6, 6.6), rot: -90 + W.angle },
		{ kind: 'lamp', at: [40, 43.4], rot: 90 },
		{ kind: 'lamp', at: [56, 56.6], rot: -90 },
		{ kind: 'lamp', at: E1.at(6, -6.6), rot: 90 + E1.angle },
		{ kind: 'lamp', at: E1.at(20, 6.6), rot: -90 + E1.angle },
		{ kind: 'lamp', at: E2.at(12, -6.6), rot: 90 + E2.angle },
		{ kind: 'hydrant', at: W.at(-12, 6.8), rot: 0 },
		{ kind: 'hydrant', at: [58, 43.2], rot: 0 },
		{ kind: 'car', at: W.at(-19, -1.8), rot: W.angle + 9 },
		{ kind: 'car', at: [41, 47.6], rot: 12 },
		{ kind: 'car', at: [56.5, 52.3], rot: 187 },
		{ kind: 'car', at: E1.at(17, 2.6), rot: E1.angle - 11 },
		{ kind: 'car', at: E2.at(9, -2.2), rot: E2.angle + 17 },
		// the alley
		{ kind: 'dumpster', at: [44.7, 35.6], rot: 90 },
		{ kind: 'dumpster', at: [31, 30.6], rot: 1.5 },
		{ kind: 'dumpster', at: [57.5, 26.4], rot: -24.6 },
		{ kind: 'pole', at: [47.6, 31], rot: 0 },
		{ kind: 'barrel', at: [27, 30.2], rot: 0 },
		{ kind: 'trashbag', at: [46.9, 40.8], rot: 0 },
		{ kind: 'trashbag', at: [32.6, 30.1], rot: 40 },
		{ kind: 'crate', at: [61.2, 23.9], rot: -25 },
		// the courtyard
		{ kind: 'tree', at: W.at(-20.5, -13), rot: 0 },
		{ kind: 'tree', at: W.at(-9, -13.5), rot: 0 },
		{ kind: 'tree', at: W.at(-21, -26), rot: 0 },
		{ kind: 'tree', at: W.at(-9.5, -25.5), rot: 0 },
		{ kind: 'bench', at: W.at(-12, -17.6), rot: W.angle },
		{ kind: 'bench', at: W.at(-18.4, -23), rot: W.angle + 90 },
		{ kind: 'shrub', at: W.at(-24, -9), rot: 0 },
		{ kind: 'shrub', at: W.at(-6, -16), rot: 0 },
		{ kind: 'shrub', at: W.at(-23.5, -17), rot: 0 },
		{ kind: 'lamp', at: W.at(-14.5, -20), rot: W.angle },
		// the backyards
		{ kind: 'tree', at: W.at(-17.5, 36.5), rot: 0 },
		{ kind: 'pine', at: W.at(-29.3, 31), rot: 0 },
		{ kind: 'pine', at: W.at(-29.5, 10), rot: 0 },
		{ kind: 'tree', at: W.at(-21.5, 19.5), rot: 0 },
		{ kind: 'shrub', at: W.at(-16.5, 9.5), rot: 0 },
		{ kind: 'shrub', at: W.at(-30, 22), rot: 0 },
		{ kind: 'generator', at: W.at(-23, 25), rot: W.angle },
		{ kind: 'tyre', at: W.at(-28, 37.5), rot: 0 },
		{ kind: 'trash_can', at: W.at(-16, 23), rot: 0 },
		{ kind: 'trash_can', at: W.at(-16, 21.6), rot: 0 },
		{ kind: 'pole', at: W.at(-30.2, 20), rot: 0 },
		// the diner: booths along the windows, a counter at the back
		{ kind: 'table', at: W.at(-12.5, 9.6), rot: W.angle },
		{ kind: 'table', at: W.at(-5, 9.6), rot: W.angle },
		{ kind: 'table', at: [35.6, 60.5], rot: 90 },
		{ kind: 'counter', at: [29, 70.2], rot: -12.6 },
		{ kind: 'counter', at: [26.3, 70.8], rot: -12.6 },
		// the loading yard and the warehouse
		{ kind: 'truck', at: E1.at(8, -19), rot: E1.angle + 78 },
		{ kind: 'crate', at: E1.at(20, -28.6), rot: E1.angle },
		{ kind: 'crate', at: E1.at(21.5, -27.2), rot: E1.angle + 8 },
		{ kind: 'barrel', at: E1.at(24.6, -9), rot: 0 },
		{ kind: 'barrel', at: E1.at(24.2, -10.2), rot: 0 },
		{ kind: 'pallet_rack', at: E1.at(8, -36.5), rot: E1.angle + 90 },
		{ kind: 'pallet_rack', at: E1.at(8, -41.5), rot: E1.angle + 90 },
		{ kind: 'pallet_rack', at: E1.at(13, -36.5), rot: E1.angle + 90 },
		{ kind: 'pallet_rack', at: E1.at(13, -41.5), rot: E1.angle + 90 },
		{ kind: 'generator', at: E1.at(22.8, -33), rot: E1.angle },
		{ kind: 'crate', at: E1.at(3.2, -44.5), rot: E1.angle },
		// the gas station
		{ kind: 'post', at: E1.at(8.5, 15), rot: 0 },
		{ kind: 'post', at: E1.at(19.5, 15), rot: 0 },
		{ kind: 'post', at: E1.at(8.5, 21), rot: 0 },
		{ kind: 'post', at: E1.at(19.5, 21), rot: 0 },
		{ kind: 'pump', at: E1.at(11.5, 18), rot: E1.angle },
		{ kind: 'pump', at: E1.at(16.5, 18), rot: E1.angle },
		{ kind: 'shelf', at: E2.at(7, 20), rot: E2.angle },
		{ kind: 'shelf', at: E2.at(11, 20), rot: E2.angle },
		{ kind: 'utility_box', at: E2.at(15, 12.6), rot: E2.angle },
		{ kind: 'trash_can', at: E2.at(1.4, 13), rot: 0 },
		{ kind: 'lamp', at: [66, 82], rot: -60 }
	],
	spawns: [
		// the lot
		[38, 65],
		[61.6, 65],
		[39, 78],
		[61, 80],
		// the diner
		[34, 60],
		W.at(-13, 18),
		// the streets
		W.at(-27, 0),
		W.at(-27, 6),
		W.at(-2, -6),
		[40, 44],
		[60, 56],
		E2.at(17, -5),
		E2.at(17, 5),
		E1.at(4, 6),
		// the courtyard, the alley and the yard
		W.at(-22, -28),
		W.at(-6, -29),
		W.at(-22, -10),
		[25, 31],
		[61, 25],
		[46, 31],
		E1.at(4, -28),
		E1.at(22, -28),
		E1.at(22, -44),
		// the backyards and the gas station
		W.at(-29, 38),
		W.at(-17, 38),
		W.at(-29, 10),
		E2.at(15, 10),
		[68, 84]
	],
	playerSpawns: [
		[48, 64],
		[50, 64],
		[48, 66],
		[50, 66]
	],
	names: [
		{ at: [50, 66], name: 'Parking Lot' },
		{ at: [30, 65], name: 'Diner' },
		{ at: W.at(-18, 0), name: 'West Street' },
		{ at: [48, 50], name: 'Main Street' },
		{ at: E1.at(20, 0), name: 'East Street' },
		{ at: W.at(-15, -20), name: 'Courtyard' },
		{ at: [46, 36], name: 'Alley' },
		{ at: E1.at(14, -20), name: 'Loading Yard' },
		{ at: E1.at(14, -38), name: 'Warehouse' },
		{ at: E1.at(14, 18), name: 'Gas Station' },
		{ at: E2.at(9, 18), name: 'Gas Station' },
		{ at: W.at(-23, 24), name: 'Backyards' }
	],
	canopies: [{ poly: box(...E1.at(14, 18), 13, 8, E1.angle), height: 4.6 }]
};

// Short dashes along a line.
function dashes(line: Pt[], on: number, gap: number): Segment[] {
	const out: Segment[] = [];
	for (let i = 0; i < line.length - 1; i++) {
		const [a, b] = [line[i], line[i + 1]];
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		for (let s = gap / 2; s + on <= len; s += on + gap)
			out.push(part(a, b, s / len, (s + on) / len));
	}
	return out;
}
