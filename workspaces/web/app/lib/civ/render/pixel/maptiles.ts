import { SEA_LEVEL } from '../../config';
import { Biome, Built, Deposit, Ground, Water, type MapLayers } from '../../types';
import { hash, type Living } from '../scene';
import type { SpriteDef } from './sprite';

// The pixel-art map tiles: every 40 m tile is a 16 x 16 sprite. Land tiles are
// full tiles; water edges (shores) and rivers are drawn as transparent overlays
// on top of a water or land tile, picked from which neighbours are water.
//
// One shared key (below) keeps the letters the same in every tile, so a season
// is just a recolouring of a few letters (leaves turn orange, grass goes white).

export const TILE = 16;

export type Recolor = Record<string, NonNullable<SpriteDef['key'][string]>>;

export const KEY: SpriteDef['key'] = {
	// ground
	g: 'grass',
	l: 'grassLight',
	d: 'leaf',
	m: 'moss',
	s: 'straw',
	y: 'gold',
	// broadleaf foliage, conifer foliage
	t: 'leaf',
	u: 'leafDark',
	j: 'grassLight',
	p: 'leaf',
	P: 'leafDark',
	Q: 'grass',
	// wood
	b: 'bark',
	B: 'barkDark',
	W: 'wood',
	// stone
	r: 'stone',
	R: 'stoneDark',
	c: 'stoneLight',
	h: 'chalk',
	w: 'white',
	// earth
	o: 'soil',
	O: 'soilDark',
	v: 'soilLight',
	Y: 'clay',
	X: 'rust',
	S: 'sand',
	T: 'sandLight',
	// water
	a: 'water',
	A: 'deep',
	e: 'waterLight',
	f: 'foam',
	i: 'ice',
	z: 'waterLight',
	// accents
	C: 'copper',
	N: 'tin',
	H: 'ochre',
	V: 'obsidian',
	F: 'fire',
	L: 'flame',
	E: 'ember',
	n: 'berry',
	q: 'blossom',
	k: 'ink',
	x: 'shadow',
	// a village's cloth
	M: '#c0503c'
};

// Per season (0 spring .. 3 winter): only the letters that change.
export const SEASON_RECOLOR: Recolor[] = [
	{ t: 'grass', u: 'leaf', Q: 'grassLight' },
	{},
	{ t: 'orange', u: 'rust', j: 'gold', g: 'moss', l: 'straw', m: 'straw', s: 'gold' },
	{
		t: 'bark',
		u: 'barkDark',
		j: 'white',
		g: 'white',
		l: 'white',
		d: 'chalk',
		m: 'chalk',
		s: 'chalk',
		Q: 'white',
		S: 'sandLight',
		T: 'white',
		f: 'white',
		z: 'ice',
		e: 'ice'
	}
];

export function seasonRecolor(season: number): Recolor {
	return SEASON_RECOLOR[((season % 4) + 4) % 4];
}

// ------------------------------------------------------------ grid helpers

type Grid = string[][];

const grid = (ch: string): Grid => Array.from({ length: TILE }, () => Array<string>(TILE).fill(ch));
const rowsOf = (g: Grid): string[] => g.map((r) => r.join(''));
const def = (g: Grid): SpriteDef => ({ rows: rowsOf(g), key: KEY });

// Puts a small picture on the grid at (x, y); `.` leaves what is there.
function stamp(g: Grid, rows: string[], x: number, y: number): void {
	for (let j = 0; j < rows.length; j++) {
		const gy = y + j;
		if (gy < 0 || gy >= TILE) continue;
		for (let i = 0; i < rows[j].length; i++) {
			const ch = rows[j][i];
			const gx = x + i;
			if (ch === '.' || gx < 0 || gx >= TILE) continue;
			g[gy][gx] = ch;
		}
	}
}

function scatter(g: Grid, ch: string, n: number, seed: number): void {
	for (let k = 0; k < n; k++) {
		g[Math.floor(hash(seed, k, 1) * TILE)][Math.floor(hash(seed, k, 2) * TILE)] = ch;
	}
}

// two-pixel-wide ticks (waves, ripples)
function ticks(g: Grid, ch: string, n: number, seed: number): void {
	for (let k = 0; k < n; k++) {
		const x = Math.floor(hash(seed, k, 3) * (TILE - 1));
		g[Math.floor(hash(seed, k, 4) * TILE)][x] = ch;
		g[Math.floor(hash(seed, k, 4) * TILE)][x + 1] = ch;
	}
}

// grass blades: a light pixel over a dark one
function tufts(g: Grid, n: number, seed: number): void {
	for (let k = 0; k < n; k++) {
		const x = Math.floor(hash(seed, k, 5) * TILE);
		const y = Math.floor(hash(seed, k, 6) * (TILE - 1));
		g[y][x] = 'l';
		g[y + 1][x] = 'd';
	}
}

const flipH = (rows: string[]): string[] => rows.map((r) => [...r].reverse().join(''));
const flipV = (rows: string[]): string[] => [...rows].reverse();
const remap = (rows: string[], to: Record<string, string>): string[] =>
	rows.map((r) => [...r].map((ch) => to[ch] ?? ch).join(''));

// ------------------------------------------------------------------- land

function grassGrid(seed: number): Grid {
	const g = grid('g');
	scatter(g, 'l', 9, seed);
	scatter(g, 'd', 5, seed + 50);
	tufts(g, 4, seed + 90);
	return g;
}

export const GRASS: SpriteDef[] = [11, 23, 37].map((s) => def(grassGrid(s)));
export const MEADOW: SpriteDef = (() => {
	const g = grassGrid(61);
	scatter(g, 'q', 2, 70);
	scatter(g, 'y', 2, 71);
	scatter(g, 'n', 1, 72);
	return def(g);
})();
// grass where plants are thin
export const DRY_GRASS: SpriteDef[] = [5, 6].map((s) => {
	const g = grid('g');
	scatter(g, 's', 14, s);
	scatter(g, 'm', 8, s + 20);
	scatter(g, 'l', 3, s + 40);
	return def(g);
});

export const SAND: SpriteDef[] = [3, 4, 5].map((s) => {
	const g = grid('S');
	scatter(g, 'T', 12, s);
	ticks(g, 'T', 3, s + 30);
	scatter(g, 's', 4, s + 60);
	return def(g);
});

const BUSH = ['.uuu..', 'ujjtu.', 'uttttu', '.uuuu.'];
export const SCRUB: SpriteDef[] = [8, 9].map((s) => {
	const g = grid('m');
	scatter(g, 's', 10, s);
	scatter(g, 'd', 4, s + 20);
	stamp(g, BUSH, 1 + (s % 3), 2);
	stamp(g, BUSH, 8, 7 + (s % 2));
	stamp(g, BUSH, 2, 10);
	scatter(g, 'n', 1, s + 40);
	return def(g);
});

const PUDDLE = ['.aaaa.', 'aaeaaa', '.aaaa.'];
const REED = ['b', 'd', 'l'];
export const MARSH: SpriteDef[] = [12, 13].map((s) => {
	const g = grid('m');
	scatter(g, 'd', 12, s);
	scatter(g, 'l', 5, s + 20);
	stamp(g, PUDDLE, 1 + (s % 2) * 2, 2);
	stamp(g, PUDDLE, 8, 8);
	stamp(g, PUDDLE, 2, 11);
	for (let k = 0; k < 5; k++) {
		stamp(g, REED, Math.floor(hash(s, k, 7) * 15), Math.floor(hash(s, k, 8) * 13));
	}
	return def(g);
});

const HUMP = [
	'...mmmmm....',
	'..mllllgm...',
	'.mllllgggm..',
	'mllllgggggdm',
	'mlllgggggddm',
	'.mgggggddddm',
	'..mmdddddmm.'
];
const HUMP_SMALL = ['..mmmm..', '.mllggm.', 'mlgggdm.', 'mgggddm.', '.mmddmm.'];
export const HILLS: SpriteDef[] = [
	(() => {
		const g = grassGrid(17);
		stamp(g, HUMP_SMALL, 7, 1);
		stamp(g, HUMP, 2, 7);
		return def(g);
	})(),
	(() => {
		const g = grassGrid(19);
		stamp(g, HUMP, 0, 1);
		stamp(g, ['c', 'rc'], 4, 1);
		stamp(g, HUMP_SMALL, 7, 9);
		return def(g);
	})()
];

const PEAK_BIG = [
	'......w......',
	'.....wwc.....',
	'....wwwcR....',
	'...wwcccRR...',
	'..wcccrrRRR..',
	'..cccrrrrRRR.',
	'.ccrrrRrrrRRR',
	'ccrrrrrrRrrRR',
	'crrrRrrrrrRRR',
	'rrrrrrrRrrrRR'
];
const PEAK_SMALL = ['...wc...', '..wccR..', '.cccrRR.', 'ccrrrrRR', 'crrRrrRR'];

function rockGrid(seed: number): Grid {
	const g = grid('r');
	scatter(g, 'R', 10, seed);
	scatter(g, 'c', 5, seed + 30);
	return g;
}

export const MOUNTAIN: SpriteDef[] = [
	(() => {
		const g = rockGrid(21);
		stamp(g, PEAK_BIG, 1, 2);
		stamp(g, PEAK_SMALL, 8, 10);
		return def(g);
	})(),
	(() => {
		const g = rockGrid(22);
		stamp(g, PEAK_SMALL, 0, 1);
		stamp(g, PEAK_BIG, 2, 5);
		return def(g);
	})()
];

const SNOW_REMAP = { r: 'h', c: 'w', R: 'i' };
export const SNOW_PEAK: SpriteDef[] = [
	(() => {
		const g = grid('w');
		scatter(g, 'h', 8, 31);
		scatter(g, 'i', 5, 32);
		stamp(g, remap(PEAK_BIG, SNOW_REMAP), 1, 3);
		stamp(g, remap(PEAK_SMALL, SNOW_REMAP), 8, 10);
		scatter(g, 'R', 2, 33);
		return def(g);
	})(),
	(() => {
		const g = grid('w');
		scatter(g, 'h', 8, 34);
		scatter(g, 'i', 5, 35);
		stamp(g, remap(PEAK_SMALL, SNOW_REMAP), 1, 1);
		stamp(g, remap(PEAK_BIG, SNOW_REMAP), 2, 5);
		return def(g);
	})()
];

// ------------------------------------------------------------------ trees

const BROAD = ['..uuuu..', '.ujjttu.', 'ujjtttuu', 'ujtttttu', 'utttttuu', '.uuttuu.', '..ubbu..'];
const BROAD_SHADOW = ['.dddddd.', '..dddd..'];
const CONIFER = [
	'...P...',
	'..PQP..',
	'..QppP.',
	'.PQpppP',
	'..QppP.',
	'.PQpppP',
	'PQppppP',
	'...bB..'
];
const CONIFER_SHADOW = ['.ddddd.', '..ddd..'];

type Spot = [number, number];

// Shadows go down first so a nearer tree is never cut by a farther one's.
function planted(g: Grid, conifer: boolean, spots: Spot[]): SpriteDef {
	const crown = conifer ? CONIFER : BROAD;
	const shade = conifer ? CONIFER_SHADOW : BROAD_SHADOW;
	const drop = crown.length - 1;
	const sorted = [...spots].sort((a, b) => a[1] - b[1]);
	for (const [x, y] of sorted) stamp(g, shade, x + (conifer ? 0 : 1), y + drop);
	for (const [x, y] of sorted) stamp(g, crown, x, y);
	return def(g);
}

function treeGrid(dense: boolean, seed: number): Grid {
	const g = grid(dense ? 'd' : 'g');
	scatter(g, dense ? 'u' : 'l', dense ? 3 : 7, seed);
	if (!dense) tufts(g, 3, seed + 9);
	return g;
}

const SPARSE_SPOTS: Spot[][] = [
	[
		[1, 1],
		[8, 6]
	],
	[
		[7, 1],
		[2, 7]
	]
];
const DENSE_SPOTS: Spot[][] = [
	[
		[0, 0],
		[8, 0],
		[4, 4],
		[0, 8],
		[8, 9]
	],
	[
		[1, 0],
		[8, 1],
		[0, 5],
		[8, 6],
		[4, 9]
	]
];
const CONIFER_SPARSE_SPOTS: Spot[][] = [
	[
		[1, 0],
		[8, 7]
	],
	[
		[8, 0],
		[2, 7]
	]
];
const CONIFER_DENSE_SPOTS: Spot[][] = [
	[
		[0, 0],
		[8, 0],
		[4, 4],
		[0, 8],
		[9, 8]
	],
	[
		[1, 1],
		[9, 1],
		[0, 6],
		[8, 6],
		[4, 9]
	]
];

export const FOREST_SPARSE: SpriteDef[] = SPARSE_SPOTS.map((s, n) =>
	planted(treeGrid(false, 40 + n), false, s)
);
export const FOREST_DENSE: SpriteDef[] = DENSE_SPOTS.map((s, n) =>
	planted(treeGrid(true, 44 + n), false, s)
);
export const CONIFER_SPARSE: SpriteDef[] = CONIFER_SPARSE_SPOTS.map((s, n) =>
	planted(treeGrid(false, 48 + n), true, s)
);
export const CONIFER_DENSE: SpriteDef[] = CONIFER_DENSE_SPOTS.map((s, n) =>
	planted(treeGrid(true, 52 + n), true, s)
);
// a felled wood: grass with stumps
export const CLEARING: SpriteDef = (() => {
	const g = grassGrid(57);
	stamp(g, ['WW', 'bb'], 3, 4);
	stamp(g, ['WW', 'bb'], 10, 10);
	return def(g);
})();

// ------------------------------------------------------------------ water

function waterGrid(base: string, wave: string, n: number, seed: number): Grid {
	const g = grid(base);
	ticks(g, wave, n, seed);
	return g;
}

export const SEA_SHALLOW: SpriteDef[] = [60, 61, 62].map((s) => def(waterGrid('a', 'e', 5, s)));
export const SEA_DEEP: SpriteDef[] = [63, 64, 65].map((s) => def(waterGrid('A', 'a', 6, s)));
export const LAKE: SpriteDef[] = [66, 67, 68].map((s) => def(waterGrid('a', 'e', 7, s)));

// Shores: land flags of the 8 neighbours, as bits.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const NE = 16;
export const SE = 32;
export const SW = 64;
export const NW = 128;

export type ShoreKind = 'none' | 'edgeV' | 'edgeH' | 'corner' | 'notch';

// A corner only matters when both sides next to it are water, so the mask is
// cleaned up to keep the set of different tiles small.
export function normalizeShore(mask: number): number {
	let m = mask;
	if (m & (N | E)) m &= ~NE;
	if (m & (S | E)) m &= ~SE;
	if (m & (S | W)) m &= ~SW;
	if (m & (N | W)) m &= ~NW;
	return m;
}

// quarter 0 top left, 1 top right, 2 bottom left, 3 bottom right
export function shoreQuarter(mask: number, quarter: number): ShoreKind {
	const v = quarter < 2 ? N : S;
	const h = quarter % 2 === 0 ? W : E;
	const d = quarter === 0 ? NW : quarter === 1 ? NE : quarter === 2 ? SW : SE;
	if (mask & v && mask & h) return 'corner';
	if (mask & v) return 'edgeV';
	if (mask & h) return 'edgeH';
	if (mask & d) return 'notch';
	return 'none';
}

// Top-left quarter pieces: sand bank, foam, a ring of lighter water. The
// others are mirrored from these.
const EDGE_V = [
	'SSSSSSSS',
	'ffffffff',
	'zzz.zzzz',
	'........',
	'........',
	'........',
	'........',
	'........'
];
const EDGE_H = EDGE_V.map((_, y) => [...EDGE_V].map((row) => row[y]).join(''));
const CORNER = [
	'SSSSSSSS',
	'SSSSffff',
	'SSfffzzz',
	'SSfzz...',
	'Sfzz....',
	'Sfz.....',
	'Sfz.....',
	'Sfz.....'
];
const NOTCH = [
	'SSf.....',
	'Sff.....',
	'ff......',
	'........',
	'........',
	'........',
	'........',
	'........'
];
const BLANK_Q = Array<string>(8).fill('........');

const PIECE: Record<ShoreKind, string[]> = {
	none: BLANK_Q,
	edgeV: EDGE_V,
	edgeH: EDGE_H,
	corner: CORNER,
	notch: NOTCH
};

function quarterRows(kind: ShoreKind, quarter: number): string[] {
	let rows = PIECE[kind];
	if (quarter % 2 === 1) rows = flipH(rows);
	if (quarter >= 2) rows = flipV(rows);
	return rows;
}

const shoreCache = new Map<number, SpriteDef | null>();

// The shoreline overlay for a water tile with these land neighbours.
export function shoreTile(mask: number): SpriteDef | null {
	const m = normalizeShore(mask);
	if (m === 0) return null;
	const hit = shoreCache.get(m);
	if (hit !== undefined) return hit;
	const q = [0, 1, 2, 3].map((n) => quarterRows(shoreQuarter(m, n), n));
	const rows: string[] = [];
	for (let y = 0; y < 8; y++) rows.push(q[0][y] + q[1][y]);
	for (let y = 0; y < 8; y++) rows.push(q[2][y] + q[3][y]);
	const made: SpriteDef = { rows, key: KEY };
	shoreCache.set(m, made);
	return made;
}

// ----------------------------------------------------------------- rivers

// A river tile's channel, drawn from a code (see `riverCode`), cached by code.
const riverCache = new Map<number, SpriteDef>();

export function riverTile(code: number): SpriteDef {
	const arms = code & 15;
	const diag = code & 240;
	const flare = (code >> 8) & arms;
	const id = arms | diag | (flare << 8);
	const hit = riverCache.get(id);
	if (hit) return hit;

	const wet: boolean[][] = Array.from({ length: TILE }, () => Array<boolean>(TILE).fill(false));
	const fill = (x0: number, y0: number, x1: number, y1: number) => {
		for (let y = Math.max(0, y0); y <= Math.min(TILE - 1, y1); y++) {
			for (let x = Math.max(0, x0); x <= Math.min(TILE - 1, x1); x++) wet[y][x] = true;
		}
	};
	fill(6, 6, 9, 9);
	if (arms & N) fill(6, 0, 9, 5);
	if (arms & E) fill(10, 6, 15, 9);
	if (arms & S) fill(6, 10, 9, 15);
	if (arms & W) fill(0, 6, 5, 9);
	if (flare & N) fill(5, 0, 10, 2);
	if (flare & E) fill(13, 5, 15, 10);
	if (flare & S) fill(5, 13, 10, 15);
	if (flare & W) fill(0, 5, 2, 10);
	// a diagonal arm steps from the middle out to the shared corner, where the
	// diagonal neighbour's mirrored arm picks it up
	for (const [bit, dx, dy] of [
		[NE, 1, -1],
		[SE, 1, 1],
		[SW, -1, 1],
		[NW, -1, -1]
	]) {
		if (!(diag & bit)) continue;
		for (let t = 0; t <= 6; t++) {
			const x = dx > 0 ? 8 + t : 5 - t;
			const y = dy > 0 ? 8 + t : 5 - t;
			fill(x, y, x + 2, y + 2);
		}
	}
	// round the corners of the middle that no river leaves through
	if (!(arms & (N | W)) && !(diag & NW)) wet[6][6] = false;
	if (!(arms & (N | E)) && !(diag & NE)) wet[6][9] = false;
	if (!(arms & (S | W)) && !(diag & SW)) wet[9][6] = false;
	if (!(arms & (S | E)) && !(diag & SE)) wet[9][9] = false;

	// a darker rim, lighter water inside and a sand bank, so it reads at 1x
	const g = grid('.');
	const open = (x: number, y: number) => x >= 0 && y >= 0 && x < TILE && y < TILE && !wet[y][x];
	for (let y = 0; y < TILE; y++) {
		for (let x = 0; x < TILE; x++) {
			if (wet[y][x]) {
				const rim = open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1);
				g[y][x] = rim ? 'a' : (x * 3 + y * 5) % 7 === 0 ? 'f' : 'e';
				continue;
			}
			for (let dy = -1; dy <= 1 && g[y][x] === '.'; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (wet[y + dy]?.[x + dx]) {
						g[y][x] = 'S';
						break;
					}
				}
			}
		}
	}
	const made = def(g);
	riverCache.set(id, made);
	return made;
}

// ------------------------------------------------------------------ icons

// Little marks for what is in the ground, a few pixels each.
export const DEPOSIT_ICON: Partial<Record<number, SpriteDef>> = {
	[Deposit.flint]: { rows: ['.cr..', 'crRr.', '.RRr.'], key: KEY },
	[Deposit.clay]: { rows: ['.YYY.', 'YYvYY', '.YYY.'], key: KEY },
	[Deposit.copper]: { rows: ['.CC..', 'CNCC.', '.CCC.'], key: KEY },
	[Deposit.tin]: { rows: ['.NN..', 'NwNN.', '.NNr.'], key: KEY },
	[Deposit.bogIron]: { rows: ['.OO..', 'OXOO.', '.OOo.'], key: KEY },
	[Deposit.obsidian]: { rows: ['..V..', '.VcV.', 'VVVV.'], key: KEY },
	[Deposit.salt]: { rows: ['.w..w', 'whwh.', '.hw..'], key: KEY },
	[Deposit.ochre]: { rows: ['.HH..', 'HHXH.', '.HH..'], key: KEY },
	[Deposit.meteorite]: { rows: ['..L..', '.RR..', 'RkRR.'], key: KEY }
};

function compose(parts: [string[], number, number][]): SpriteDef {
	const g = grid('.');
	for (const [rows, x, y] of parts) stamp(g, rows, x, y);
	return def(g);
}

const TENT = ['....W....', '...whr...', '..whhhr..', '.whhBBhr.', 'whhhBBhhr'];
const FIRE = ['.L.', 'LFL', 'bEb'];
const HUT = [
	'....TTTT....',
	'..TTTTssss..',
	'.TTTsssssWW.',
	'TTssssssssWW',
	'sssssssssWWW',
	'WWWWWWWWWWWW',
	'.bbbbbbbbbb.',
	'.bbbbBBbbbB.',
	'.bbbbBBbbbB.',
	'.OOOOOOOOOO.'
];
const STONE = ['.cc.', 'crrR', 'crrR', 'rrrR', 'rrRR', 'RRRR'];

const fieldIcon = (): SpriteDef => {
	const g = grid('.');
	for (let y = 1; y <= 14; y++) {
		for (let x = 1; x <= 14; x++) {
			if (y % 3 === 0) g[y][x] = 'O';
			else if (y % 3 === 1) g[y][x] = x % 3 === 0 ? 'l' : 'g';
			else g[y][x] = 'o';
		}
	}
	return def(g);
};

const penIcon = (): SpriteDef => {
	const g = grid('.');
	for (let x = 1; x <= 14; x++) {
		g[3][x] = x % 3 === 1 ? 'b' : 'W';
		g[13][x] = x % 3 === 1 ? 'b' : 'W';
	}
	for (let y = 3; y <= 13; y++) {
		g[y][1] = y % 3 === 0 ? 'b' : 'W';
		g[y][14] = y % 3 === 0 ? 'b' : 'W';
	}
	for (let k = 0; k < 14; k++) {
		g[4 + Math.floor(hash(3, k, 1) * 9)][2 + Math.floor(hash(3, k, 2) * 12)] =
			k % 4 === 0 ? 'y' : 's';
	}
	return def(g);
};

export const BUILT_ICON: Partial<Record<number, SpriteDef>> = {
	[Built.camp]: compose([
		[TENT, 1, 5],
		[FIRE, 11, 10]
	]),
	[Built.hut]: compose([[HUT, 2, 3]]),
	[Built.field]: fieldIcon(),
	[Built.kiln]: compose([
		[
			[
				'...YYYY...',
				'..YvvYYX..',
				'.YvvYYYYX.',
				'YvYYYYYYXX',
				'YYYkkkkYXX',
				'YYkEFFEkXX',
				'XXXXXXXXXX'
			],
			3,
			6
		],
		[['.c', 'c.', '.c'], 11, 1]
	]),
	[Built.pen]: penIcon(),
	[Built.shrine]: compose([
		[STONE, 1, 6],
		[STONE, 6, 3],
		[STONE, 11, 7],
		[['rr', 'Rr'], 7, 11],
		[['n'], 7, 10]
	]),
	[Built.store]: compose([
		[
			[
				'.TTssssssss.',
				'TTssssssssWW',
				'ssssssssssWW',
				'WWWWWWWWWWWW',
				'.WWWWWWWWWW.',
				'.WbWWWWWWbW.',
				'.WbWWBBWWbW.',
				'.bb......bb.',
				'.b........b.'
			],
			2,
			4
		]
	]),
	[Built.furnace]: compose([
		[
			[
				'...cc.....',
				'....cc....',
				'..rrrrrr..',
				'.rcrrrrRr.',
				'.rrrrrrRR.',
				'.rrkkkkRR.',
				'.rrkFFkRR.',
				'.rrkELkRR.',
				'.rrrrrrRR.',
				'RRRRRRRRRR'
			],
			3,
			3
		]
	])
};

// A village's centre: huts, a tent, a flag in the village's colour.
export const VILLAGE_ICON: SpriteDef = compose([
	[TENT, 7, 1],
	[HUT, 0, 6],
	[['W', 'W', 'W', 'W', 'W', 'W', 'W'], 13, 7],
	[['MM', 'MM'], 14, 7],
	[FIRE, 12, 13]
]);

// ------------------------------------------------------------ picking tiles

const inside = (layers: MapLayers, x: number, y: number): boolean =>
	x >= 0 && y >= 0 && x < layers.size && y < layers.size;

function waterAt(layers: MapLayers, x: number, y: number): boolean {
	const i = y * layers.size + x;
	return layers.water[i] !== Water.none || layers.biome[i] === Biome.ocean;
}

const DIRS: [number, number, number][] = [
	[0, -1, N],
	[1, 0, E],
	[0, 1, S],
	[-1, 0, W],
	[1, -1, NE],
	[1, 1, SE],
	[-1, 1, SW],
	[-1, -1, NW]
];

// Which of the 8 neighbours are dry land. Off the map counts as water so the
// edge of the world doesn't grow a beach.
export function shoreMask(layers: MapLayers, tx: number, ty: number): number {
	let mask = 0;
	for (const [dx, dy, bit] of DIRS) {
		const x = tx + dx;
		const y = ty + dy;
		if (inside(layers, x, y) && !waterAt(layers, x, y)) mask |= bit;
	}
	return mask;
}

const isRiver = (layers: MapLayers, i: number): boolean =>
	layers.water[i] === Water.river || layers.water[i] === Water.spring;

// The tile a river tile flows into: the lowest of its 8 neighbours that is any
// kind of water and lower than itself (equal heights broken by tile index, so
// following the flow can never loop). -1 for a river that ends. Level ground
// between two candidates prefers the straight neighbour over the diagonal.
export function downstreamOf(layers: MapLayers, i: number): number {
	const size = layers.size;
	const tx = i % size;
	const ty = (i - tx) / size;
	const mine = layers.height[i];
	let best = -1;
	let bestHeight = Infinity;
	for (let d = 0; d < 8; d++) {
		const x = tx + DIRS[d][0];
		const y = ty + DIRS[d][1];
		if (!inside(layers, x, y) || !waterAt(layers, x, y)) continue;
		const j = y * size + x;
		const h = layers.height[j];
		if (h > mine || (h === mine && j > i)) continue;
		if (h < bestHeight) {
			best = d;
			bestHeight = h;
		}
	}
	return best < 0 ? -1 : (ty + DIRS[best][1]) * size + tx + DIRS[best][0];
}

const opposite = (d: number): number => (d < 4 ? (d + 2) % 4 : 4 + ((d - 2) % 4));

const linkCache = new WeakMap<object, Uint16Array>();

// For every tile, the channel code of a river tile (0 elsewhere): N/E/S/W arms
// in the low bits, NE/SE/SW/NW arms next, and in bits 8.. which orthogonal
// arms run into a lake or the sea and so open out. A river is a tree, so a
// tile links to the one it flows into and to each tile that flows into it,
// and nothing else; two neighbours that merely touch are not joined.
export function riverLinks(layers: MapLayers): Uint16Array {
	const hit = linkCache.get(layers);
	if (hit) return hit;
	const size = layers.size;
	const codes = new Uint16Array(size * size);
	for (let i = 0; i < codes.length; i++) {
		if (!isRiver(layers, i)) continue;
		const to = downstreamOf(layers, i);
		if (to < 0) continue;
		const dx = (to % size) - (i % size);
		const dy = Math.floor(to / size) - Math.floor(i / size);
		const d = DIRS.findIndex((dir) => dir[0] === dx && dir[1] === dy);
		codes[i] |= DIRS[d][2];
		if (isRiver(layers, to)) codes[to] |= DIRS[opposite(d)][2];
		else if (d < 4) codes[i] |= DIRS[d][2] << 8;
	}
	linkCache.set(layers, codes);
	return codes;
}

export const riverCode = (layers: MapLayers, tx: number, ty: number): number =>
	riverLinks(layers)[ty * layers.size + tx];

export type TilePick = {
	base: SpriteDef;
	// shoreline or river laid over the base
	over: SpriteDef | null;
	deposit: SpriteDef | null;
	depositX: number;
	depositY: number;
	built: SpriteDef | null;
};

export const newPick = (): TilePick => ({
	base: GRASS[0],
	over: null,
	deposit: null,
	depositX: 0,
	depositY: 0,
	built: null
});

const choose = <T>(list: T[], tx: number, ty: number, salt: number): T =>
	list[Math.floor(hash(tx, ty, salt) * list.length)];

function landBase(layers: MapLayers, living: Living, i: number, tx: number, ty: number): SpriteDef {
	const biome = layers.biome[i];
	const wood = living.wood[i];
	const plants = living.plants[i];
	const tree = (sparse: SpriteDef[], dense: SpriteDef[], conifers: [SpriteDef[], SpriteDef[]]) => {
		// high ground and a share of the rest grow conifers
		const pine = layers.height[i] > 0.62 || hash(tx >> 2, ty >> 2, 21) < 0.3;
		const list = wood < 0.4 ? (pine ? conifers[0] : sparse) : pine ? conifers[1] : dense;
		return choose(list, tx, ty, 22);
	};
	switch (biome) {
		case Biome.coast:
			return choose(SAND, tx, ty, 1);
		case Biome.forest:
			if (wood < 0.12) return plants < 0.3 ? choose(DRY_GRASS, tx, ty, 2) : CLEARING;
			return tree(FOREST_SPARSE, FOREST_DENSE, [CONIFER_SPARSE, CONIFER_DENSE]);
		case Biome.wetland:
			return choose(MARSH, tx, ty, 3);
		case Biome.scrub:
			return wood > 0.55
				? choose(FOREST_SPARSE, tx, ty, 4)
				: plants < 0.2
					? choose(DRY_GRASS, tx, ty, 4)
					: choose(SCRUB, tx, ty, 5);
		case Biome.hills:
			return choose(HILLS, tx, ty, 6);
		case Biome.mountain:
			return choose(MOUNTAIN, tx, ty, 7);
		case Biome.snow:
			return choose(SNOW_PEAK, tx, ty, 8);
		default:
			if (layers.ground[i] === Ground.sand) return choose(SAND, tx, ty, 1);
			if (wood > 0.55) return choose(FOREST_SPARSE, tx, ty, 4);
			if (plants < 0.3) return choose(DRY_GRASS, tx, ty, 9);
			return hash(tx, ty, 10) < 0.12 ? MEADOW : choose(GRASS, tx, ty, 11);
	}
}

// What to draw for one tile, written into `out` (no allocation per tile).
export function pickTile(
	layers: MapLayers,
	living: Living,
	tx: number,
	ty: number,
	out: TilePick
): void {
	const i = ty * layers.size + tx;
	out.over = null;
	out.deposit = null;
	out.built = null;
	const water = layers.water[i];

	if (water === Water.river || water === Water.spring) {
		out.base = landBase(layers, living, i, tx, ty);
		out.over = riverTile(riverCode(layers, tx, ty));
		return;
	}
	if (water !== Water.none || layers.biome[i] === Biome.ocean) {
		const mask = shoreMask(layers, tx, ty);
		if (water === Water.lake) out.base = choose(LAKE, tx, ty, 12);
		else if (mask !== 0 || layers.height[i] > SEA_LEVEL * 0.7) {
			out.base = choose(SEA_SHALLOW, tx, ty, 13);
		} else out.base = choose(SEA_DEEP, tx, ty, 14);
		out.over = shoreTile(mask);
		return;
	}

	out.base = landBase(layers, living, i, tx, ty);
	const deposit = DEPOSIT_ICON[layers.deposit[i]];
	if (deposit) {
		const w = deposit.rows[0].length;
		out.deposit = deposit;
		out.depositX = hash(tx, ty, 15) < 0.5 ? 1 : TILE - w - 1;
		out.depositY = hash(tx, ty, 16) < 0.5 ? 1 : TILE - deposit.rows.length - 1;
	}
	out.built = BUILT_ICON[living.built[i]] ?? null;
}

// Every tile-sized sprite, for tests and tools.
export function allTileSprites(): SpriteDef[] {
	const list = [
		...GRASS,
		MEADOW,
		...DRY_GRASS,
		...SAND,
		...SCRUB,
		...MARSH,
		...HILLS,
		...MOUNTAIN,
		...SNOW_PEAK,
		...FOREST_SPARSE,
		...FOREST_DENSE,
		...CONIFER_SPARSE,
		...CONIFER_DENSE,
		CLEARING,
		...SEA_SHALLOW,
		...SEA_DEEP,
		...LAKE,
		VILLAGE_ICON
	];
	for (let m = 0; m < 256; m++) {
		const shore = shoreTile(m);
		if (shore) list.push(shore);
	}
	for (let c = 0; c < 256; c++) list.push(riverTile(c | ((c & 15) << 8)));
	for (const icon of Object.values(BUILT_ICON)) if (icon) list.push(icon);
	return list;
}
