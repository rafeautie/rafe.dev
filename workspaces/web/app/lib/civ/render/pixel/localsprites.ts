import type { ColorName } from './palette';
import { sprite, type Sprite, type SpriteDef } from './sprite';

// The pixel sprites for the close-up (local) view: trees, bushes, rocks, ore,
// buildings, fire. Sizes are in art pixels (6 a metre), see STYLE.md.
//
// The big, round things (tree canopies, boulders, mounds) are painted into a
// small grid by the helpers below, lit from the top left with an ordered
// dither between shades, then turned into plain text rows. So they are still
// ordinary `SpriteDef`s, and every season is just a recolouring of the keys.
// Small, iconic things (flames, pebbles, tufts) are written out by hand.

type Recolor = Record<string, ColorName | `#${string}`>;
type Grid = string[][];

// ----------------------------------------------------------------- painting

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const mk = (w: number, h: number): Grid =>
	Array.from({ length: h }, () => Array<string>(w).fill('.'));
const toRows = (g: Grid): string[] => g.map((r) => r.join(''));
// drop empty rows from the top, so a sprite's height is the thing's real height
const crop = (g: Grid): Grid => {
	while (g.length > 1 && g[0].every((c) => c === '.')) g.shift();
	return g;
};
const put = (g: Grid, x: number, y: number, ch: string) => {
	if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
};
const at = (g: Grid, x: number, y: number) =>
	y >= 0 && y < g.length && x >= 0 && x < g[0].length ? g[y][x] : '.';

// a shaded lump: light from the top left, dark underneath on the right
function lobe(g: Grid, cx: number, cy: number, rx: number, ry: number): void {
	for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
		for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
			const u = (x - cx) / rx;
			const v = (y - cy) / ry;
			if (u * u + v * v > 1) continue;
			const s = u * 0.55 + v * 0.85 + (bay(x, y) - 0.5) * 0.35;
			put(g, x, y, s < -0.4 ? 'h' : s > 0.3 ? 'd' : 'm');
		}
	}
}

// swap the outermost pixels of everything in `of` for an outline colour
function outline(g: Grid, of: string, ch: string): void {
	const edge: [number, number][] = [];
	for (let y = 0; y < g.length; y++) {
		for (let x = 0; x < g[0].length; x++) {
			if (!of.includes(g[y][x])) continue;
			if (
				at(g, x - 1, y) === '.' ||
				at(g, x + 1, y) === '.' ||
				at(g, x, y - 1) === '.' ||
				at(g, x, y + 1) === '.'
			)
				edge.push([x, y]);
		}
	}
	for (const [x, y] of edge) g[y][x] = ch;
}

// scatter single accent pixels over existing pixels of the given kinds
function speckle(g: Grid, rand: () => number, n: number, over: string, ch: string): void {
	const spots: [number, number][] = [];
	for (let y = 0; y < g.length; y++)
		for (let x = 0; x < g[0].length; x++) if (over.includes(g[y][x])) spots.push([x, y]);
	for (let i = 0; i < n && spots.length > 0; i++) {
		const k = Math.floor(rand() * spots.length);
		const [x, y] = spots.splice(k, 1)[0];
		g[y][x] = ch;
	}
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
	const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
	for (let i = 0; i <= n; i++)
		put(g, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), ch);
}

// a trunk four wide: dark edge, light, bark, dark; wider roots at the foot
function trunk(g: Grid, cx: number, y0: number, y1: number): void {
	for (let y = y0; y <= y1; y++) {
		if (y === y1) {
			['T', 'u', 't', 't', 't', 'T'].forEach((ch, i) => put(g, cx - 2 + i, y, ch));
		} else {
			['T', 'u', 't', 'T'].forEach((ch, i) => put(g, cx - 1 + i, y, ch));
			if (y === y1 - 1 && y1 - y0 > 3) put(g, cx - 2, y, 'T');
		}
	}
}

function ovalRows(rx: number, ry: number, ch: string): string[] {
	const g = mk(rx * 2 + 1, ry * 2 + 1);
	for (let y = 0; y <= ry * 2; y++)
		for (let x = 0; x <= rx * 2; x++) {
			const u = (x - rx) / (rx + 0.5);
			const v = (y - ry) / (ry + 0.5);
			if (u * u + v * v <= 1) g[y][x] = ch;
		}
	return toRows(g);
}

// ------------------------------------------------------------------- foliage

const FOLIAGE_KEY: SpriteDef['key'] = {
	o: 'leafDark',
	d: 'leaf',
	m: 'grass',
	h: 'grassLight',
	p: 'moss',
	t: 'bark',
	T: 'barkDark',
	u: 'wood'
};

type Lobes = [number, number, number, number][];

function broadleaf(w: number, h: number, lobes: Lobes, seed: number): SpriteDef {
	const g = mk(w, h);
	const cx = Math.floor(w / 2);
	const lowest = Math.max(...lobes.map((l) => l[1] + l[3]));
	trunk(g, cx - 1, Math.floor(lowest - 3), h - 1);
	for (const [x, y, rx, ry] of [...lobes].sort((a, b) => a[1] - b[1])) lobe(g, x, y, rx, ry);
	speckle(g, rng(seed), 7, 'mh', 'p');
	outline(g, 'hmdp', 'o');
	return { rows: toRows(crop(g)), key: FOLIAGE_KEY, foot: [cx, g.length - 1] };
}

const OAKS: SpriteDef[] = [
	broadleaf(
		30,
		33,
		[
			[15, 9, 8, 8],
			[8, 14, 7, 6],
			[22, 14, 7, 6],
			[15, 17, 10, 7],
			[9, 21, 6, 4],
			[21, 21, 6, 4]
		],
		11
	),
	broadleaf(
		28,
		30,
		[
			[14, 9, 9, 8],
			[7, 15, 6, 5],
			[21, 15, 6, 5],
			[14, 18, 9, 6]
		],
		23
	),
	broadleaf(
		26,
		27,
		[
			[13, 8, 7, 7],
			[7, 13, 6, 5],
			[19, 13, 6, 5],
			[13, 15, 7, 5]
		],
		37
	)
];

// winter: bare branches against the sky
function bareOak(w: number, h: number, top: number, twigs: [number, number][]): SpriteDef {
	const g = mk(w, h);
	const cx = Math.floor(w / 2);
	trunk(g, cx - 1, top, h - 1);
	for (const [x, y] of twigs) {
		line(g, cx, top + 1, x, y, 'T');
		line(g, cx, top + 1, x + 1, y + 1, 'T');
	}
	for (const [x, y] of twigs) {
		const mx = Math.round((cx + x) / 2);
		const my = Math.round((top + y) / 2);
		line(g, mx, my, x + (x < cx ? -4 : 4), y + 3, 'T');
	}
	return {
		rows: toRows(crop(g)),
		key: { t: 'bark', T: 'barkDark', u: 'wood' },
		foot: [cx, g.length - 1]
	};
}

const BARE_OAKS: SpriteDef[] = [
	bareOak(30, 33, 18, [
		[5, 5],
		[15, 1],
		[25, 5],
		[9, 11],
		[21, 11]
	]),
	bareOak(28, 30, 17, [
		[4, 8],
		[11, 2],
		[19, 2],
		[24, 8]
	]),
	bareOak(26, 27, 15, [
		[4, 6],
		[13, 1],
		[22, 6],
		[8, 10]
	])
];

function conifer(
	w: number,
	h: number,
	tiers: [number, number, number][],
	trunkFrom: number
): SpriteDef {
	const g = mk(w, h);
	const cx = Math.floor(w / 2);
	for (let y = trunkFrom; y < h; y++) {
		put(g, cx - 1, y, 'u');
		put(g, cx, y, 't');
		put(g, cx + 1, y, 'T');
	}
	// lowest tier first, so the higher ones hang over it
	for (let k = tiers.length - 1; k >= 0; k--) {
		const [apex, base, half] = tiers[k];
		for (let y = apex; y <= base; y++) {
			const t = (y - apex) / (base - apex);
			let hw = Math.round(1 + t * (half - 1));
			if (y === base) hw -= 1;
			for (let x = cx - hw; x <= cx + hw; x++) {
				// ragged skirt along the bottom
				if (y === base && (x - cx) % 2 === 0 && Math.abs(x - cx) === hw) continue;
				const u = (x - cx) / half;
				const s = u * 0.8 + t * 0.25 + (bay(x, y) - 0.5) * 0.4;
				let ch = s < -0.35 ? 'h' : s > 0.2 ? 'd' : 'm';
				if (k < tiers.length - 1 && y >= base - 1) ch = 'd';
				else if (t < 0.5 && s < 0.35 && bay(x, y) < 0.9 - t * 1.2) ch = 's';
				put(g, x, y, ch);
			}
		}
	}
	outline(g, 'hmds', 'o');
	return {
		rows: toRows(g),
		key: {
			o: 'ink',
			d: 'leafDark',
			m: 'leaf',
			h: 'grass',
			s: 'leaf',
			t: 'bark',
			T: 'barkDark',
			u: 'wood'
		},
		foot: [cx, h - 1]
	};
}

const CONIFERS: SpriteDef[] = [
	conifer(
		20,
		38,
		[
			[0, 12, 5],
			[8, 22, 7],
			[16, 32, 9]
		],
		31
	),
	conifer(
		16,
		31,
		[
			[0, 10, 4],
			[7, 19, 6],
			[14, 27, 7]
		],
		26
	),
	conifer(
		22,
		40,
		[
			[0, 10, 4],
			[6, 17, 6],
			[12, 24, 8],
			[18, 34, 10]
		],
		33
	)
];

function scrubTree(seed: number, flip: boolean): SpriteDef {
	const w = 16;
	const h = 18;
	const g = mk(w, h);
	const dir = flip ? -1 : 1;
	const cx = 8;
	// a bent trunk
	for (let y = 8; y < h; y++) {
		const bend = Math.round(((h - 1 - y) / 10) * 1.6) * dir;
		put(g, cx + bend - 1, y, 'u');
		put(g, cx + bend, y, 't');
		put(g, cx + bend + 1, y, 'T');
	}
	const lobes: Lobes = [
		[cx - 3 * dir, 5, 4, 3.5],
		[cx + 3 * dir, 4, 4, 3.5],
		[cx + 1 * dir, 8, 5, 3.5]
	];
	for (const [x, y, rx, ry] of lobes) lobe(g, x, y, rx, ry);
	speckle(g, rng(seed), 3, 'mh', 'p');
	outline(g, 'hmdp', 'o');
	return { rows: toRows(crop(g)), key: FOLIAGE_KEY, foot: [cx, g.length - 1] };
}
const SCRUBS = [scrubTree(5, false), scrubTree(9, true), scrubTree(13, false)];

function bushDef(seed: number, w: number, h: number, lobes: Lobes, berries: boolean): SpriteDef {
	const g = mk(w, h);
	for (const [x, y, rx, ry] of lobes) lobe(g, x, y, rx, ry);
	speckle(g, rng(seed), berries ? 6 : 3, 'mhd', 'p');
	outline(g, 'hmdp', 'o');
	// a dark base line so it sits in the grass
	return { rows: toRows(crop(g)), key: FOLIAGE_KEY, foot: [Math.floor(w / 2), g.length - 1] };
}
const BUSHES: SpriteDef[] = [
	bushDef(
		3,
		11,
		9,
		[
			[3.5, 5, 3.5, 3.2],
			[7.5, 5, 3.5, 3.2],
			[5.5, 4, 3.6, 3.2]
		],
		false
	),
	bushDef(
		4,
		10,
		9,
		[
			[3, 5, 3.2, 3.2],
			[6.5, 4.5, 3.4, 3.7]
		],
		false
	),
	bushDef(
		5,
		12,
		10,
		[
			[3.5, 6, 3.5, 3.5],
			[8.5, 6, 3.5, 3.5],
			[6, 4.5, 4, 3.8]
		],
		false
	)
];
const BERRIES: SpriteDef[] = [
	bushDef(
		6,
		11,
		9,
		[
			[3.5, 5, 3.5, 3.2],
			[7.5, 5, 3.5, 3.2],
			[5.5, 4, 3.6, 3.2]
		],
		true
	),
	bushDef(
		7,
		10,
		9,
		[
			[3, 5, 3.2, 3.2],
			[6.5, 4.5, 3.4, 3.7]
		],
		true
	),
	bushDef(
		8,
		12,
		10,
		[
			[3.5, 6, 3.5, 3.5],
			[8.5, 6, 3.5, 3.5],
			[6, 4.5, 4, 3.8]
		],
		true
	)
];

// ------------------------------------------------------------ grass and reeds

const TUFT_KEY: SpriteDef['key'] = { d: 'leaf', m: 'grass', h: 'grassLight' };
const TUFTS: SpriteDef[] = [
	{ key: TUFT_KEY, rows: ['.h..h', '.m.hm', 'mdmmd', '.dmd.'] },
	{ key: TUFT_KEY, rows: ['..h..', 'h.m.h', '.mmm.', 'mdmdm'] },
	{ key: TUFT_KEY, rows: ['.h.', 'mhm', 'mdm'] }
];

const FLOWER: SpriteDef = {
	key: { p: 'blossom', q: 'gold', m: 'grass' },
	rows: ['.p.', 'pqp', '.p.', '.m.', '.m.']
};
const FLOWER_COLORS: ColorName[] = ['blossom', 'berry', 'gold', 'white'];

function reeds(stalks: [number, number, number][], w: number, h: number): SpriteDef {
	const g = mk(w, h);
	for (const [x, ht, lean] of stalks) {
		for (let i = 0; i < ht; i++) {
			const y = h - 1 - i;
			const lx = x + (i > ht / 2 ? lean : 0);
			put(g, lx, y, i === ht - 1 || i === ht - 2 ? 'k' : i % 3 === 1 ? 'h' : 'm');
		}
		put(g, x, h - 1, 'd');
	}
	return { rows: toRows(g), key: { d: 'leaf', m: 'moss', h: 'grass', k: 'bark' } };
}
const REEDS = [
	reeds(
		[
			[1, 6, 0],
			[3, 9, 1],
			[5, 7, -1],
			[7, 5, 0]
		],
		8,
		9
	),
	reeds(
		[
			[1, 7, 1],
			[3, 6, 0],
			[5, 9, 0],
			[6, 6, 1]
		],
		8,
		9
	)
];

// ------------------------------------------------------------------- rocks

const ROCK_KEY: SpriteDef['key'] = {
	o: 'ink',
	h: 'stoneLight',
	m: 'stone',
	d: 'stoneDark',
	s: 'stoneLight',
	g: 'moss'
};

type Deco = (g: Grid, rand: () => number) => void;

function rock(w: number, h: number, seed: number, key: SpriteDef['key'], deco?: Deco): SpriteDef {
	const g = mk(w, h);
	const rand = rng(seed);
	const rx = w / 2;
	const ry = h / 2;
	for (let y = 0; y < h; y++) {
		const wob = 1 + (rand() - 0.5) * 0.14;
		for (let x = 0; x < w; x++) {
			const u = (x + 0.5 - rx) / (rx * wob);
			const v = (y + 0.5 - ry) / ry;
			// a flattened, blocky ball
			if (Math.pow(Math.abs(u), 2.6) + Math.pow(Math.abs(v), 2.6) > 1) continue;
			const s = u * 0.5 + v * 0.8 + (bay(x, y) - 0.5) * 0.3;
			put(g, x, y, s < -0.35 ? 'h' : s > 0.25 ? 'd' : 'm');
		}
	}
	deco?.(g, rand);
	outline(g, 'hmdsgcknbw', 'o');
	return { rows: toRows(g), key, foot: [Math.floor(w / 2), h - 2] };
}

// snow caps and moss: swap some of the top-left pixels for 's'
function snowCap(g: Grid): void {
	const h = g.length;
	for (let y = 0; y < h * 0.45; y++)
		for (let x = 0; x < g[0].length; x++)
			if ('hm'.includes(g[y][x]) && bay(x, y) < 0.8 - (y / h) * 1.2) g[y][x] = 's';
}
const mossy: Deco = (g, rand) => {
	snowCap(g);
	const h = g.length;
	for (let i = 0; i < 4; i++) {
		const x = Math.floor(rand() * g[0].length);
		const y = h - 3 - Math.floor(rand() * 2);
		if ('md'.includes(at(g, x, y))) g[y][x] = 'g';
	}
};

const BOULDERS: SpriteDef[] = [
	rock(7, 6, 1, ROCK_KEY, mossy),
	rock(9, 7, 2, ROCK_KEY, mossy),
	rock(11, 8, 3, ROCK_KEY, mossy),
	rock(12, 9, 4, ROCK_KEY, mossy)
];

const STONES: SpriteDef[] = [
	{ key: ROCK_KEY, rows: ['.oo.', 'ohmo', '.ood'], foot: [2, 2] },
	{ key: ROCK_KEY, rows: ['..oo.', '.ohmo', 'ommdo'], foot: [2, 2] },
	{ key: ROCK_KEY, rows: ['.oo', 'ohd'], foot: [1, 1] }
];

// ore outcrops: rock with its tell-tale colour
const dots =
	(ch: string, n: number): Deco =>
	(g, rand) =>
		speckle(g, rand, n, 'hmd', ch);

const blobs =
	(ch: string, n: number): Deco =>
	(g, rand) => {
		for (let i = 0; i < n; i++) {
			const x = 2 + Math.floor(rand() * (g[0].length - 5));
			const y = 2 + Math.floor(rand() * (g.length - 5));
			for (const [dx, dy] of [
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1]
			])
				if ('hmd'.includes(at(g, x + dx, y + dy))) g[y + dy][x + dx] = ch;
		}
	};

const strata: Deco = (g) => {
	for (let y = 0; y < g.length; y++)
		for (let x = 0; x < g[0].length; x++)
			if ('hmd'.includes(g[y][x]) && (y + (x >> 2)) % 3 === 0 && bay(x, y) < 0.7) g[y][x] = 'd';
};

function obsidianShards(seed: number): SpriteDef {
	const g = mk(13, 12);
	const rand = rng(seed);
	const spikes: [number, number, number, number][] = [
		[3, 4, 11, 2],
		[7, 0, 11, 3],
		[10, 3, 11, 2]
	];
	for (const [cx, apex, base, half] of spikes) {
		for (let y = apex; y <= base; y++) {
			const hw = Math.round(((y - apex) / (base - apex)) * half);
			for (let x = cx - hw; x <= cx + hw; x++)
				put(g, x, y, x <= cx - hw / 2 ? 'h' : x > cx ? 'd' : 'm');
		}
	}
	speckle(g, rand, 3, 'hm', 'k');
	outline(g, 'hmdk', 'o');
	return {
		rows: toRows(g),
		key: { o: 'ink', h: 'stoneDark', m: 'obsidian', d: 'shadow', k: 'waterLight' },
		foot: [6, 10]
	};
}

type OreSpec = { key: SpriteDef['key']; make: (seed: number, w: number, h: number) => SpriteDef };
const oreRock =
	(key: SpriteDef['key'], deco: Deco): OreSpec['make'] =>
	(seed, w, h) =>
		rock(w, h, seed, key, deco);
const ORE: Record<string, OreSpec> = {
	flint: {
		key: { o: 'ink', h: 'white', m: 'chalk', d: 'stoneLight', n: 'stoneDark' },
		make: oreRock(
			{ o: 'ink', h: 'white', m: 'chalk', d: 'stoneLight', n: 'stoneDark' },
			blobs('n', 4)
		)
	},
	clay: {
		key: { o: 'rust', h: 'ochre', m: 'clay', d: 'rust' },
		make: oreRock({ o: 'soilDark', h: 'ochre', m: 'clay', d: 'rust' }, strata)
	},
	copper: {
		key: { o: 'ink', h: 'stoneLight', m: 'stone', d: 'stoneDark', c: 'copper', k: 'foam' },
		make: oreRock(
			{ o: 'ink', h: 'stoneLight', m: 'stone', d: 'stoneDark', c: 'copper', k: 'foam' },
			(g, r) => {
				blobs('c', 4)(g, r);
				speckle(g, r, 2, 'c', 'k');
			}
		)
	},
	tin: {
		key: { o: 'ink', h: 'stoneLight', m: 'stone', d: 'stoneDark', c: 'tin', k: 'white' },
		make: oreRock(
			{ o: 'ink', h: 'stoneLight', m: 'stone', d: 'stoneDark', c: 'tin', k: 'white' },
			(g, r) => {
				blobs('c', 4)(g, r);
				speckle(g, r, 3, 'c', 'k');
			}
		)
	},
	bogIron: {
		key: { o: 'soilDark', h: 'clay', m: 'rust', d: 'soilDark', w: 'waterLight' },
		make: oreRock({ o: 'ink', h: 'clay', m: 'rust', d: 'soilDark', w: 'waterLight' }, dots('w', 3))
	},
	obsidian: {
		key: { o: 'ink', h: 'stoneDark', m: 'obsidian', d: 'shadow', k: 'waterLight' },
		make: (seed) => obsidianShards(seed)
	},
	salt: {
		key: { o: 'stone', h: 'white', m: 'chalk', d: 'stoneLight', k: 'foam' },
		make: oreRock({ o: 'stone', h: 'white', m: 'chalk', d: 'stoneLight', k: 'foam' }, dots('k', 4))
	},
	ochre: {
		key: { o: 'rust', h: 'gold', m: 'ochre', d: 'rust' },
		make: oreRock({ o: 'soilDark', h: 'gold', m: 'ochre', d: 'rust' }, strata)
	},
	meteorite: {
		key: { o: 'ink', h: 'stone', m: 'stoneDark', d: 'obsidian', c: 'tin' },
		make: oreRock({ o: 'ink', h: 'stone', m: 'stoneDark', d: 'obsidian', c: 'tin' }, dots('c', 4))
	}
};

function oreDefs(name: string): SpriteDef[] {
	const spec = ORE[name];
	return [spec.make(21, 14, 10), spec.make(22, 12, 9)];
}

// small loose chunks round an outcrop, in the outcrop's colours
function chunkOf(ore: SpriteDef): SpriteDef {
	return { key: ore.key, rows: ['.oo.', 'ohmo', '.odo'], foot: [2, 2] };
}

// ---------------------------------------------------------------- buildings

// a hide tent: two poles crossing at the top, a dark doorway
function tent(): SpriteDef {
	const w = 22;
	const h = 18;
	const cx = 11;
	const g = mk(w, h);
	for (let y = 2; y <= 16; y++) {
		const half = Math.round(((y - 1) * 10) / 15);
		for (let x = cx - half; x <= cx + half; x++) {
			let ch = x < cx - half + 2 ? 'h' : x < cx ? 'c' : 'C';
			if (x >= cx && x <= cx + 1 && y < 7) ch = 'C';
			if (ch === 'c' && (x * 3 + y * 5) % 11 === 0) ch = 'C';
			put(g, x, y, ch);
		}
	}
	for (let y = 8; y <= 16; y++) {
		const eh = Math.floor((y - 7) * 0.5);
		for (let x = cx - eh; x <= cx + eh; x++) put(g, x, y, 'n');
		put(g, cx - eh - 1, y, 'h');
	}
	outline(g, 'hcC', 'o');
	put(g, cx - 1, 0, 'w');
	put(g, cx, 0, 'w');
	put(g, cx - 1, 1, 'w');
	put(g, cx, 1, 'w');
	put(g, cx + 1, 1, 'w');
	put(g, 0, 17, 'w');
	put(g, 21, 17, 'w');
	put(g, cx - 1, 17, 'w');
	return {
		rows: toRows(g),
		key: {
			o: 'ink',
			h: 'sandLight',
			c: 'sand',
			C: 'straw',
			w: 'wood',
			n: 'barkDark'
		},
		foot: [cx, 17]
	};
}
const TENT = tent();
const TENT_RECOLORS: Recolor[] = [
	{},
	{ h: 'soilLight', c: 'wood', C: 'soil' },
	{ h: 'sand', c: 'clay', C: 'rust' }
];

// a round hut: thatched cone on a daubed wall
function hut(): SpriteDef {
	const w = 34;
	const h = 29;
	const cx = 17;
	const g = mk(w, h);
	for (let y = 1; y <= 17; y++) {
		const half = Math.round(1 + ((y - 1) * 15) / 16);
		for (let x = cx - half; x <= cx + half; x++) {
			if (y === 17 && (x - cx) % 2 !== 0) continue;
			let ch = x < cx - 3 ? 'a' : x > cx + 3 ? 'c' : 'b';
			if ((x + y * 2) % 5 === 0 && bay(x, y) < 0.8) ch = ch === 'a' ? 'b' : 'c';
			put(g, x, y, ch);
		}
	}
	for (let y = 18; y <= 28; y++) {
		for (let x = cx - 11; x <= cx + 11; x++) {
			let ch = x < cx + 3 ? 'w' : 'W';
			if (y === 18 || (y === 19 && x % 2 === 0)) ch = 'W';
			if (x % 5 === 0 && y > 20 && y < 27 && bay(x, y) < 0.5) ch = 'W';
			if (y === 28) ch = x % 3 === 0 ? 'z' : 'y';
			put(g, x, y, ch);
		}
	}
	// doorway with a wooden frame
	for (let y = 20; y <= 28; y++) {
		for (let x = cx - 3; x <= cx + 2; x++) {
			const corner = y === 20 && (x === cx - 3 || x === cx + 2);
			if (corner) continue;
			const frame = y === 20 || x === cx - 3 || x === cx + 2;
			put(g, x, y, frame ? 'f' : 'n');
		}
	}
	put(g, cx, 0, 'n');
	put(g, cx - 1, 1, 'n');
	put(g, cx + 1, 1, 'n');
	outline(g, 'abcwWfnzy', 'o');
	return {
		rows: toRows(g),
		key: {
			o: 'ink',
			a: 'straw',
			b: 'gold',
			c: 'wood',
			w: 'clay',
			W: 'rust',
			f: 'bark',
			n: 'barkDark',
			z: 'stone',
			y: 'stoneDark'
		},
		foot: [cx, 28]
	};
}
const HUT = hut();
const HUT_RECOLORS: Recolor[] = [
	{},
	{ a: 'straw', b: 'moss', c: 'bark', w: 'sand', W: 'straw' },
	{ a: 'sandLight', b: 'straw', c: 'soilLight', w: 'soilLight', W: 'soil' }
];

// A kiln: a clay dome with a stoke hole. The mouth (`g`) is dark here; the
// glow frames repaint just those pixels.
const KILN_MOUTH: [number, number][] = [];
function kiln(): SpriteDef {
	const w = 16;
	const h = 14;
	const g = mk(w, h);
	for (let y = 0; y < h; y++) {
		const t = (y + 1) / h;
		const half = Math.round(Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2))) * 7.5);
		for (let x = 8 - half; x < 8 + half; x++) {
			const s = (x - 7.5) / 8 + (y / h) * 0.3 + (bay(x, y) - 0.5) * 0.3;
			let ch = s < -0.3 ? 'h' : s > 0.18 ? 'd' : 'm';
			if (y % 3 === 2 && (x + (y >> 1)) % 4 === 0) ch = 'd';
			put(g, x, y, ch);
		}
	}
	// chimney hole at the top and the stoke hole at the foot
	put(g, 7, 0, 'n');
	put(g, 8, 0, 'n');
	for (let y = 9; y <= 13; y++) {
		const hw = y === 9 ? 1 : 2;
		for (let x = 8 - hw; x < 8 + hw; x++) {
			put(g, x, y, 'n');
			if (y >= 10) KILN_MOUTH.push([x, y]);
		}
	}
	outline(g, 'hmd', 'o');
	return {
		rows: toRows(g),
		key: { o: 'soilDark', h: 'sand', m: 'clay', d: 'rust', n: 'ink' },
		foot: [8, 13]
	};
}
const KILN = kiln();

function glowOverlay(base: SpriteDef, spots: [number, number][]): SpriteDef {
	const g = mk(base.rows[0].length, base.rows.length);
	for (const [x, y] of spots) g[y][x] = 'g';
	return { rows: toRows(g), key: { g: 'fire' }, foot: base.foot };
}
const KILN_GLOW = glowOverlay(KILN, KILN_MOUTH);
const GLOW_FRAMES: Recolor[] = [{ g: 'fire' }, { g: 'flame' }, { g: 'ember' }];

// a stone and clay furnace with a chimney stack
const FURNACE_MOUTH: [number, number][] = [];
function furnace(): SpriteDef {
	const w = 18;
	const h = 24;
	const g = mk(w, h);
	for (let y = 0; y < h; y++) {
		const half = Math.round(5 + (y / (h - 1)) * 4);
		for (let x = 9 - half; x < 9 + half; x++) {
			const s = (x - 8.5) / 9 + (bay(x, y) - 0.5) * 0.3;
			let ch = s < -0.25 ? 'h' : s > 0.2 ? 'd' : 'm';
			// courses of stone
			if (y % 4 === 3) ch = 'd';
			else if ((x + (y >> 2) * 3) % 5 === 0) ch = 'd';
			put(g, x, y, ch);
		}
	}
	for (let x = 6; x < 12; x++) put(g, x, 0, 'n');
	for (let y = 17; y <= 23; y++) {
		for (let x = 6; x < 12; x++) {
			if (y === 17 && (x === 6 || x === 11)) continue;
			put(g, x, y, 'n');
			if (y >= 18 && x > 6 && x < 11) FURNACE_MOUTH.push([x, y]);
		}
	}
	outline(g, 'hmd', 'o');
	return {
		rows: toRows(g),
		key: { o: 'ink', h: 'stoneLight', m: 'stone', d: 'stoneDark', n: 'ink' },
		foot: [9, 23]
	};
}
const FURNACE = furnace();
const FURNACE_GLOW = glowOverlay(FURNACE, FURNACE_MOUTH);

// A raised granary: a basket with a thatched cap on four posts
function store(variant: number): SpriteDef {
	const w = 22;
	const h = 26;
	const cx = 11;
	const g = mk(w, h);
	// posts and a cross-brace
	for (const px of [4, 9, 12, 17])
		for (let y = 17; y <= 25; y++) put(g, px, y, y % 5 === 0 ? 'T' : 't');
	for (let x = 4; x <= 17; x++) put(g, x, 21, 'T');
	// basket
	for (let y = 10; y <= 16; y++)
		for (let x = 3; x <= 18; x++) {
			const wick = (x + (y % 2) * 2) % 4 < 2;
			let ch = wick ? 'w' : 'W';
			if (x > 13) ch = wick ? 'W' : 'V';
			if (x < 6 && wick) ch = 'x';
			put(g, x, y, ch);
		}
	for (let x = 3; x <= 18; x++) put(g, x, 17, 'T');
	// door hatch
	if (variant === 0) for (let y = 12; y <= 14; y++) for (let x = 9; x <= 12; x++) put(g, x, y, 'n');
	// thatched cap
	for (let y = 2; y <= 9; y++) {
		const half = Math.round(2 + ((y - 2) * 9) / 7);
		for (let x = cx - half; x <= cx + half; x++) {
			let ch = x < cx - 2 ? 'a' : x > cx + 2 ? 'c' : 'b';
			if ((x + y * 2) % 4 === 0) ch = ch === 'a' ? 'b' : 'c';
			put(g, x, y, ch);
		}
	}
	put(g, cx, 1, 'c');
	put(g, cx, 0, 'c');
	outline(g, 'abcwWVxtTn', 'o');
	return {
		rows: toRows(g),
		key: {
			o: 'ink',
			a: 'straw',
			b: 'gold',
			c: 'wood',
			w: 'wood',
			W: 'bark',
			V: 'barkDark',
			x: 'soilLight',
			t: 'bark',
			T: 'barkDark',
			n: 'barkDark'
		},
		foot: [cx, 25]
	};
}
const STORES = [store(0), store(1)];

// ---------------------------------------------------------- pens and shrines

// Pens are fenced along the diamond axes. A run of two rails goes from one
// post down and to the right (the x axis, 2 across and 1 down); mirrored, it
// goes down and to the left (the y axis). Posts are separate sprites, so they
// sort with whatever stands beside them.
export const FENCE_RUN = 48; // art pixels across a run, which is 24 down
function fenceRun(): SpriteDef {
	const top = 8; // the ground at the run's start sits this far down the sprite
	const g = mk(FENCE_RUN + 1, top + FENCE_RUN / 2 - 2);
	for (let i = 0; i <= FENCE_RUN; i++) {
		const ground = top + (i >> 1);
		put(g, i, ground - 8, 'u');
		put(g, i, ground - 7, 'T');
		put(g, i, ground - 4, 't');
		put(g, i, ground - 3, 'T');
	}
	return {
		rows: toRows(g),
		key: { u: 'wood', t: 'bark', T: 'barkDark' },
		foot: [0, top]
	};
}
const FENCE_RUN_DEF = fenceRun();

function fencePost(): SpriteDef {
	const h = 12;
	const g = mk(3, h);
	for (let y = 0; y < h; y++) {
		put(g, 0, y, 'u');
		put(g, 1, y, 't');
		put(g, 2, y, 'T');
	}
	put(g, 0, 0, 'k');
	put(g, 1, 0, 'u');
	return {
		rows: toRows(g),
		key: { u: 'wood', t: 'bark', T: 'barkDark', k: 'soilLight' },
		foot: [1, h - 1]
	};
}
const FENCE_POST = fencePost();

// standing stones: tall slabs, each a bit different
const STANDING: SpriteDef[] = [
	[
		'.oooo..',
		'ohhhmo.',
		'ohhmmdo',
		'ohmmmdo',
		'ohmmddo',
		'ohmmmdo',
		'ohgmmdo',
		'ohmmddo',
		'ohmmmdo',
		'ommmddo',
		'oooooo.'
	],
	[
		'..ooo...',
		'.ohhmo..',
		'ohhmmdo.',
		'ohmmmdo.',
		'ohmgmdo.',
		'ohmmmddo',
		'ohmmmddo',
		'ohmmmddo',
		'ohmmddo.',
		'oommddo.',
		'.ooooo..'
	],
	[
		'.oo...',
		'ohmoo.',
		'ohhmdo',
		'ohmmdo',
		'ohmmdo',
		'ohmmdo',
		'ohmgdo',
		'ommmdo',
		'ommddo',
		'oooooo'
	],
	[
		'..ooooo..',
		'.ohhhmmo.',
		'ohhmmmddo',
		'ohmmmmddo',
		'ohmmgmddo',
		'ohmmmmddo',
		'ohmmmdddo',
		'ohmmmmddo',
		'ommmmdddo',
		'ommddddoo',
		'.ooooooo.',
		'.........'
	].slice(0, 11)
].map((rows) => ({ key: { ...ROCK_KEY, h: 'stoneLight' }, rows, foot: [3, rows.length - 2] }));

const ALTAR: SpriteDef = {
	key: { ...ROCK_KEY, r: 'berry', c: 'ochre' },
	rows: [
		'...oooooooooo...',
		'..ohhhhhhhhhhmo.',
		'.ohhrhhhcchhhmmo',
		'ohhhhhhhhhhhmmdo',
		'ommmmmmmmmmmdddo',
		'odddddddddddddoo',
		'.oooooooooooooo.'
	],
	foot: [8, 5]
};

// ---------------------------------------------------------------------- fire

function fireRing(): SpriteDef {
	const rx = 6;
	const ry = 2.5;
	const w = 14;
	const h = 7;
	const g = mk(w, h);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const u = (x - 6.5) / (rx + 0.6);
			const v = (y - 3) / (ry + 0.6);
			const d = u * u + v * v;
			if (d > 1) continue;
			g[y][x] = d > 0.62 ? ((x + y) % 3 === 0 ? 'Z' : 'z') : 'e';
		}
	for (const [x, y, ch] of [
		[4, 3, 'b'],
		[5, 3, 'b'],
		[6, 2, 'b'],
		[7, 3, 'b'],
		[8, 3, 'b'],
		[6, 4, 'B'],
		[7, 4, 'b'],
		[5, 2, 'B']
	] as [number, number, string][])
		put(g, x, y, ch);
	outline(g, 'zZ', 'o');
	return {
		rows: toRows(g),
		key: { o: 'ink', z: 'stone', Z: 'stoneDark', e: 'ember', b: 'bark', B: 'barkDark' },
		foot: [6, 5]
	};
}
const FIRE_RING = fireRing();

const FLAME_KEY: SpriteDef['key'] = { f: 'fire', F: 'flame', e: 'ember', W: 'white' };
const FLAMES: SpriteDef[] = [
	[
		'....f.....',
		'....ff....',
		'...fff.f..',
		'...ffFf...',
		'..fffFff..',
		'..ffFFff..',
		'.fffFWFff.',
		'.ffFFWFff.',
		'.fefFFFef.',
		'..eeeeee..'
	],
	[
		'.....f....',
		'....fff...',
		'.f..ffF...',
		'..ffFFff..',
		'..fffFff..',
		'.ffFFFFf..',
		'.ffFWWFff.',
		'.fFFWWFFf.',
		'.fefFFFef.',
		'..eeeeee..'
	],
	[
		'...f......',
		'...ff..f..',
		'..fff.ff..',
		'..fFffff..',
		'..fFFfff..',
		'.ffFFFff..',
		'.fffFWFff.',
		'.ffFWWFff.',
		'.fefFFFef.',
		'..eeeeee..'
	],
	[
		'.....f....',
		'..f..ff...',
		'..ff.fff..',
		'..fffFff..',
		'.ffFFFFff.',
		'.ffFFWFff.',
		'.ffFWWFff.',
		'.fFFWWFFf.',
		'.fefFFFef.',
		'..eeeeee..'
	]
].map((rows) => ({ key: FLAME_KEY, rows, foot: [5, 9] }));

const SMOKE_KEY: SpriteDef['key'] = { s: 'stoneLight', k: 'stone' };
const PUFFS: SpriteDef[] = [
	{ key: SMOKE_KEY, rows: ['.s.', 'sss', '.k.'] },
	{ key: SMOKE_KEY, rows: ['.ss.', 'ssss', 'sskk', '.kk.'] },
	{ key: SMOKE_KEY, rows: ['.sss.', 'sssss', 'sssks', 'sskkk', '.kkk.'] }
];

// ------------------------------------------------------------------- the table

export const Kind = {
	oak: 0,
	conifer: 1,
	scrub: 2,
	bush: 3,
	berry: 4,
	tuft: 5,
	flower: 6,
	reed: 7,
	boulder: 8,
	stone: 9,
	flint: 10,
	clay: 11,
	copper: 12,
	tin: 13,
	bogIron: 14,
	obsidian: 15,
	salt: 16,
	ochre: 17,
	meteorite: 18,
	tent: 19,
	hut: 20,
	kiln: 21,
	fenceH: 22, // a run of two rails along the x axis (mirrored: the y axis)
	fenceV: 23, // a fence post
	altar: 24,
	standing: 25,
	store: 26,
	furnace: 27,
	fireRing: 28,
	chunk: 29
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

const ORE_NAMES: [Kind, string][] = [
	[Kind.flint, 'flint'],
	[Kind.clay, 'clay'],
	[Kind.copper, 'copper'],
	[Kind.tin, 'tin'],
	[Kind.bogIron, 'bogIron'],
	[Kind.obsidian, 'obsidian'],
	[Kind.salt, 'salt'],
	[Kind.ochre, 'ochre'],
	[Kind.meteorite, 'meteorite']
];
const ORES: Record<number, SpriteDef[]> = {};
for (const [kind, name] of ORE_NAMES) ORES[kind] = oreDefs(name);

// the base definitions of each kind, by variant (for lookups and for tests)
export const DEFS: Record<number, SpriteDef[]> = {
	[Kind.oak]: OAKS,
	[Kind.conifer]: CONIFERS,
	[Kind.scrub]: SCRUBS,
	[Kind.bush]: BUSHES,
	[Kind.berry]: BERRIES,
	[Kind.tuft]: TUFTS,
	[Kind.flower]: [FLOWER],
	[Kind.reed]: REEDS,
	[Kind.boulder]: BOULDERS,
	[Kind.stone]: STONES,
	...ORES,
	[Kind.tent]: [TENT],
	[Kind.hut]: [HUT],
	[Kind.kiln]: [KILN],
	[Kind.fenceH]: [FENCE_RUN_DEF],
	[Kind.fenceV]: [FENCE_POST],
	[Kind.altar]: [ALTAR],
	[Kind.standing]: STANDING,
	[Kind.store]: STORES,
	[Kind.furnace]: [FURNACE],
	[Kind.fireRing]: [FIRE_RING],
	[Kind.chunk]: [chunkOf(ORES[Kind.flint][0])]
};

// Everything else with a fixed look, for tests to walk through
export const EXTRA_DEFS: Record<string, SpriteDef[]> = {
	bareOak: BARE_OAKS,
	flame: FLAMES,
	puff: PUFFS,
	kilnGlow: [KILN_GLOW],
	furnaceGlow: [FURNACE_GLOW]
};

// ----------------------------------------------------------------- seasons

// Recolourings by season (0 spring, 1 summer, 2 autumn, 3 winter). The defs
// are written in their summer colours.
const FOLIAGE: (Recolor | undefined)[] = [
	{ p: 'blossom', h: 'grassLight', m: 'grass' },
	undefined,
	{ o: 'rust', d: 'orange', m: 'gold', h: 'straw', p: 'ember' },
	{ o: 'barkDark', d: 'bark', m: 'wood', h: 'soilLight', p: 'white' }
];
const AUTUMN_ALT: Recolor = { o: 'rust', d: 'rust', m: 'orange', h: 'gold', p: 'straw' };
const CONIFER_COLORS: (Recolor | undefined)[] = [
	{ h: 'grassLight' },
	undefined,
	{ h: 'moss' },
	{ s: 'white', h: 'ice', m: 'leaf' }
];
const BUSH_COLORS: (Recolor | undefined)[] = [
	{ p: 'blossom' },
	undefined,
	{ o: 'rust', d: 'rust', m: 'orange', h: 'gold', p: 'berry' },
	{ o: 'barkDark', d: 'bark', m: 'wood', h: 'white', p: 'berry' }
];
const BERRY_COLORS: (Recolor | undefined)[] = [
	{ p: 'blossom' },
	{ p: 'berry' },
	{ o: 'rust', d: 'rust', m: 'orange', h: 'gold', p: 'berry' },
	{ o: 'barkDark', d: 'bark', m: 'wood', h: 'white', p: 'berry' }
];
const TUFT_COLORS: (Recolor | undefined)[] = [
	{ m: 'grassLight', h: 'sandLight' },
	undefined,
	{ d: 'soilLight', m: 'straw', h: 'sandLight' },
	{ d: 'soilLight', m: 'sand', h: 'white' }
];
const REED_COLORS: (Recolor | undefined)[] = [
	{ m: 'grass', h: 'grassLight' },
	undefined,
	{ d: 'soilLight', m: 'straw', h: 'sandLight' },
	{ d: 'soil', m: 'sand', h: 'sandLight', k: 'bark' }
];
const BOULDER_COLORS: (Recolor | undefined)[] = [
	{ g: 'grass' },
	undefined,
	{ g: 'straw' },
	{ s: 'white', g: 'stone' }
];

// which key characters change with the season, for each kind (empty: none do)
export const SEASONAL: Partial<Record<number, (Recolor | undefined)[]>> = {
	[Kind.oak]: FOLIAGE,
	[Kind.conifer]: CONIFER_COLORS,
	[Kind.scrub]: FOLIAGE,
	[Kind.bush]: BUSH_COLORS,
	[Kind.berry]: BERRY_COLORS,
	[Kind.tuft]: TUFT_COLORS,
	[Kind.reed]: REED_COLORS,
	[Kind.boulder]: BOULDER_COLORS
};

// ---------------------------------------------------------------- looks

// A def with the recolouring to draw it in, and its sprite once made.
export type Look = { def: SpriteDef; recolor?: Recolor; made?: Sprite };

const looks = new Map<number, Look>();

export function variantCount(kind: number): number {
	if (kind === Kind.tent || kind === Kind.hut) return 3;
	if (kind === Kind.flower) return 4;
	return DEFS[kind]?.length ?? 1;
}

export function lookOf(kind: number, variant: number, season: number): Look {
	const s = ((season % 4) + 4) % 4;
	const v = ((variant % 8) + 8) % 8;
	const id = kind * 1000 + v * 10 + s;
	const hit = looks.get(id);
	if (hit) return hit;
	const defs = DEFS[kind];
	if (!defs) throw new Error(`no sprite for kind ${kind}`);
	let def = defs[v % defs.length];
	let recolor: Recolor | undefined = SEASONAL[kind]?.[s];
	if (kind === Kind.oak) {
		if (s === 3) def = BARE_OAKS[v % BARE_OAKS.length];
		else if (s === 2 && v % 2 === 1) recolor = AUTUMN_ALT;
	} else if (kind === Kind.tent) {
		recolor = TENT_RECOLORS[v % 3];
	} else if (kind === Kind.hut) {
		recolor = HUT_RECOLORS[v % 3];
	} else if (kind === Kind.flower) {
		recolor = { p: FLOWER_COLORS[v % 4] };
	}
	const made: Look = { def, recolor };
	looks.set(id, made);
	return made;
}

export function spriteOf(look: Look): Sprite {
	return (look.made ??= sprite(look.def, look.recolor));
}

// loose chunks round an outcrop use the outcrop's own colours
const chunkLooks = new Map<number, Look>();
export function chunkLook(ore: number): Look {
	let look = chunkLooks.get(ore);
	if (!look) {
		look = { def: chunkOf(ORES[ore][0]) };
		chunkLooks.set(ore, look);
	}
	return look;
}

// ------------------------------------------------------------ shadows, fire

// flat 2:1 oval shadows [rx, ry] under things that stand, in art pixels (a
// round footprint on the ground is a 2:1 oval in the isometric view)
export const SHADOW: Partial<Record<number, [number, number]>> = {
	[Kind.oak]: [9, 4],
	[Kind.conifer]: [6, 3],
	[Kind.scrub]: [5, 2],
	[Kind.bush]: [4, 2],
	[Kind.berry]: [4, 2],
	[Kind.boulder]: [5, 2],
	[Kind.flint]: [8, 4],
	[Kind.clay]: [8, 4],
	[Kind.copper]: [8, 4],
	[Kind.tin]: [8, 4],
	[Kind.bogIron]: [8, 4],
	[Kind.obsidian]: [6, 3],
	[Kind.salt]: [8, 4],
	[Kind.ochre]: [8, 4],
	[Kind.meteorite]: [8, 4],
	[Kind.tent]: [11, 5],
	[Kind.hut]: [16, 8],
	[Kind.kiln]: [8, 4],
	[Kind.standing]: [4, 2],
	[Kind.altar]: [8, 4],
	[Kind.store]: [10, 5],
	[Kind.furnace]: [9, 4],
	[Kind.fenceV]: [2, 1]
};

const shadows = new Map<number, Look>();
export function shadowLook(kind: number): Look | null {
	const r = SHADOW[kind];
	if (!r) return null;
	let look = shadows.get(kind);
	if (!look) {
		look = {
			def: { key: { s: 'shadow' }, rows: ovalRows(r[0], r[1], 's'), foot: [r[0], r[1]] }
		};
		shadows.set(kind, look);
	}
	return look;
}

export const FIRE_FRAMES = FLAMES.length;
const flameLooks = FLAMES.map((def) => ({ def }) as Look);
export const flameLook = (frame: number): Look => flameLooks[((frame % 4) + 4) % 4];

export const GLOW_COUNT = GLOW_FRAMES.length;
const kilnGlowLooks = GLOW_FRAMES.map((recolor) => ({ def: KILN_GLOW, recolor }) as Look);
const furnaceGlowLooks = GLOW_FRAMES.map((recolor) => ({ def: FURNACE_GLOW, recolor }) as Look);
export const kilnGlowLook = (frame: number): Look => kilnGlowLooks[frame % GLOW_COUNT];
export const furnaceGlowLook = (frame: number): Look => furnaceGlowLooks[frame % GLOW_COUNT];
const puffLooks = PUFFS.map((def) => ({ def }) as Look);
export const puffAt = (size: number): Look => puffLooks[Math.min(2, Math.max(0, size))];

// The light a fire throws on the ground: an oval of solid pixels in the
// middle and a checkerboard round it, drawn faintly over the ground.
const glowLooks = new Map<number, Look>();
export function glowLook(rx: number, ry: number): Look {
	const id = rx * 100 + ry;
	let look = glowLooks.get(id);
	if (!look) {
		const g = mk(rx * 2 + 1, ry * 2 + 1);
		for (let y = 0; y < g.length; y++)
			for (let x = 0; x < g[0].length; x++) {
				const u = (x - rx) / (rx + 0.5);
				const v = (y - ry) / (ry + 0.5);
				const d = u * u + v * v;
				if (d <= 0.35 || (d <= 1 && (x + y) % 2 === 0)) g[y][x] = 'g';
			}
		look = { def: { key: { g: 'fire' }, rows: toRows(g), foot: [rx, ry] } };
		glowLooks.set(id, look);
	}
	return look;
}
