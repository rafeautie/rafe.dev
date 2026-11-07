import { SEA_LEVEL } from '../../config';
import { Biome, Built, Deposit, Ground, Water, type MapLayers } from '../../types';
import { hash, type Living } from '../scene';
import { levelsOf } from './iso';
import { riverOverlay, shoreOverlay, type FaceMat } from './mapiso';
import {
	E,
	KEY,
	N,
	NE,
	NW,
	RISE,
	S,
	SE,
	SW,
	TILE_H,
	TILE_W,
	W,
	def,
	inDiamond,
	scatterIn,
	seasonRecolor,
	standGrid,
	standStamp,
	stamp,
	ticksIn,
	topGrid,
	tuftsIn,
	SEASON_RECOLOR,
	type Grid,
	type Recolor
} from './mapisokit';
import type { SpriteDef } from './sprite';

// The pixel-art map tiles, isometric: every 40 m tile is a 32 x 16 diamond.
// A tile is a flat top face (ground texture) plus, for forest and mountains,
// a standing sprite of trees or peaks that reaches above the diamond. Shores
// and rivers are overlays on the diamond; cliff faces under raised tiles come
// from mapiso.ts.
//
// The sprite letters are shared (mapisokit.ts), so a season is just a
// recolouring of a few letters (leaves turn orange, grass goes white).

export { E, KEY, N, NE, NW, S, SE, SW, W, SEASON_RECOLOR, seasonRecolor, type Recolor };

// What a terrain tile is made of: its top face, what stands on it and the
// stuff its cliffs are made of.
export type Look = { top: SpriteDef; stand: SpriteDef | null; face: FaceMat };

const look = (top: Grid, face: FaceMat, stand: SpriteDef | null = null): Look => ({
	top: def(top),
	stand,
	face
});

// ------------------------------------------------------------------- land

function grassTop(seed: number): Grid {
	const g = topGrid('g');
	scatterIn(g, 'l', 16, seed);
	scatterIn(g, 'd', 9, seed + 50);
	tuftsIn(g, 6, seed + 90);
	return g;
}

export const GRASS: Look[] = [11, 23, 37].map((s) => look(grassTop(s), 'earth'));
export const MEADOW: Look = (() => {
	const g = grassTop(61);
	scatterIn(g, 'q', 3, 70);
	scatterIn(g, 'y', 3, 71);
	scatterIn(g, 'n', 2, 72);
	return look(g, 'earth');
})();
// grass where plants are thin
export const DRY_GRASS: Look[] = [5, 6].map((s) => {
	const g = topGrid('g');
	scatterIn(g, 's', 28, s);
	scatterIn(g, 'm', 16, s + 20);
	scatterIn(g, 'l', 5, s + 40);
	return look(g, 'dry');
});

export const SAND: Look[] = [3, 4, 5].map((s) => {
	const g = topGrid('S');
	scatterIn(g, 'T', 24, s);
	ticksIn(g, 'T', 5, s + 30);
	scatterIn(g, 's', 8, s + 60);
	return look(g, 'sand');
});

const BUSH = ['.uuu..', 'ujjtu.', 'uttttu', '.uuuu.'];
export const SCRUB: Look[] = [8, 9].map((s) => {
	const g = topGrid('m');
	scatterIn(g, 's', 20, s);
	scatterIn(g, 'd', 8, s + 20);
	stamp(g, BUSH, 8 + (s % 3), 3, true);
	stamp(g, BUSH, 17, 6 + (s % 2), true);
	stamp(g, BUSH, 7, 8, true);
	scatterIn(g, 'n', 2, s + 40);
	return look(g, 'dry');
});

const PUDDLE = ['.aaaaaa.', 'aaeaaaaa', '.aaaaaa.'];
const REED = ['b', 'd', 'l'];
export const MARSH: Look[] = [12, 13].map((s) => {
	const g = topGrid('m');
	scatterIn(g, 'd', 24, s);
	scatterIn(g, 'l', 9, s + 20);
	stamp(g, PUDDLE, 7 + (s % 2) * 3, 3, true);
	stamp(g, PUDDLE, 16, 7, true);
	stamp(g, PUDDLE, 6, 9, true);
	for (let k = 0; k < 6; k++) {
		stamp(g, REED, Math.floor(hash(s, k, 7) * 30), Math.floor(hash(s, k, 8) * 12), true);
	}
	return look(g, 'earth');
});

const MOUND = ['....mmmmm....', '..mmllllgmm..', '.mllllgggggm.', 'mlllgggggddmm', '.mmdddddddmm.'];
export const HILLS: Look[] = [
	(() => {
		const g = grassTop(17);
		stamp(g, MOUND, 6, 2, true);
		stamp(g, MOUND, 13, 8, true);
		return look(g, 'earth');
	})(),
	(() => {
		const g = grassTop(19);
		stamp(g, MOUND, 9, 1, true);
		stamp(g, MOUND, 4, 6, true);
		stamp(g, MOUND.slice(1), 16, 7, true);
		return look(g, 'earth');
	})()
];

// A rocky peak seen from the front: jagged sides, a lit left, a dark right
// and (when `snow`) a white cap. Hand-shaped from a seed so every peak differs.
function peak(seed: number, w: number, h: number, snow: 'cap' | 'all' | 'none'): string[] {
	const apex = Math.floor(w / 2);
	const cap = Math.round(h * 0.38) + (seed % 2);
	const rows: string[] = [];
	let left = 0;
	let right = 0;
	for (let r = 0; r < h; r++) {
		const t = r / (h - 1);
		// the sides only ever get wider going down, with some roughness
		left = Math.max(left, Math.min(apex, Math.round(t * apex + (hash(seed, r, 1) - 0.5) * 2.2)));
		right = Math.max(
			right,
			Math.min(w - 1 - apex, Math.round(t * (w - 1 - apex) + (hash(seed, r, 2) - 0.5) * 2.2))
		);
		const ridge = apex + Math.round(t * 2) - 1;
		let line = '';
		for (let x = 0; x < w; x++) {
			if (x < apex - left || x > apex + right) {
				line += '.';
				continue;
			}
			const edge = x === apex - left || x === apex + right;
			const white = snow === 'all' || (snow === 'cap' && r < cap - (x > ridge ? 0 : 1));
			if (edge && r < h - 1) line += snow === 'all' ? 'R' : 'k';
			else if (white)
				line += x > ridge ? 'h' : snow === 'all' && hash(seed, x, r) < 0.15 ? 'c' : 'w';
			else if (x < ridge - 1) line += r < h * 0.6 ? 'c' : 'r';
			else if (x <= ridge) line += 'r';
			else line += hash(seed, x, r + 9) < 0.18 ? 'r' : 'R';
		}
		rows.push(line);
	}
	return rows;
}

type Spot = [number, number];

// Puts peaks on a standing grid by their foot (bottom middle), far ones first.
function peaks(parts: { seed: number; w: number; h: number; at: Spot }[], snow: 'cap' | 'all') {
	const g = standGrid();
	for (const p of [...parts].sort((a, b) => a.at[1] - b.at[1])) {
		const rows = peak(p.seed, p.w, p.h, snow);
		standStamp(g, rows, p.at[0] - Math.floor(p.w / 2), p.at[1] - p.h + 1);
	}
	return def(g);
}

function rockTop(ground: string, seed: number): Grid {
	const g = topGrid(ground);
	scatterIn(g, 'R', 18, seed);
	scatterIn(g, 'c', 8, seed + 30);
	return g;
}

export const MOUNTAIN: Look[] = [
	look(
		rockTop('r', 21),
		'rock',
		peaks(
			[
				{ seed: 3, w: 22, h: 19, at: [13, 9] },
				{ seed: 4, w: 12, h: 9, at: [24, 9] }
			],
			'cap'
		)
	),
	look(
		rockTop('r', 22),
		'rock',
		peaks(
			[
				{ seed: 5, w: 12, h: 10, at: [9, 8] },
				{ seed: 6, w: 22, h: 20, at: [19, 10] }
			],
			'cap'
		)
	),
	look(
		rockTop('r', 23),
		'rock',
		peaks(
			[
				{ seed: 7, w: 14, h: 11, at: [10, 7] },
				{ seed: 8, w: 14, h: 12, at: [22, 8] },
				{ seed: 9, w: 12, h: 8, at: [16, 11] }
			],
			'cap'
		)
	)
];

export const SNOW_PEAK: Look[] = [
	look(
		(() => {
			const g = topGrid('w');
			scatterIn(g, 'h', 14, 31);
			scatterIn(g, 'i', 8, 32);
			return g;
		})(),
		'snow',
		peaks(
			[
				{ seed: 11, w: 22, h: 19, at: [14, 9] },
				{ seed: 12, w: 12, h: 9, at: [25, 9] }
			],
			'all'
		)
	),
	look(
		(() => {
			const g = topGrid('w');
			scatterIn(g, 'h', 14, 34);
			scatterIn(g, 'i', 8, 35);
			scatterIn(g, 'R', 2, 36);
			return g;
		})(),
		'snow',
		peaks(
			[
				{ seed: 13, w: 12, h: 10, at: [8, 8] },
				{ seed: 14, w: 22, h: 20, at: [19, 10] }
			],
			'all'
		)
	)
];

// ------------------------------------------------------------------ trees

const BROAD = [
	'..uuuuu..',
	'.ujjjttu.',
	'ujjjtttuu',
	'ujjttttuu',
	'uttttttuu',
	'.uttttuu.',
	'..uuuuu..',
	'....b....',
	'....B....'
];
const BROAD_SHADOW = ['.xxxxxx.', '..xxxx..'];
const CONIFER = [
	'...P...',
	'..PQP..',
	'..QpP..',
	'.PQppP.',
	'..QppP.',
	'.PQpppP',
	'PQppppP',
	'PQpppPP',
	'...bB..',
	'...bB..'
];
const CONIFER_SHADOW = ['.xxxxx.', '..xxx..'];

// Shadows go down first so a nearer tree is never cut by a farther one's.
// A tree's foot is the bottom middle of its picture.
function planted(conifer: boolean, spots: Spot[], dense: boolean): SpriteDef {
	const g = standGrid();
	const crown = conifer ? CONIFER : BROAD;
	const shade = (conifer ? CONIFER_SHADOW : BROAD_SHADOW).map((r) =>
		r.replace(/x/g, dense ? 'u' : 'd')
	);
	const sorted = [...spots].sort((a, b) => a[1] - b[1]);
	const half = Math.floor(crown[0].length / 2);
	for (const [x, y] of sorted) standStamp(g, shade, x - Math.floor(shade[0].length / 2), y - 1);
	for (const [x, y] of sorted) standStamp(g, crown, x - half, y - crown.length + 1);
	return def(g);
}

function treeTop(dense: boolean, seed: number): Grid {
	const g = topGrid(dense ? 'd' : 'g');
	scatterIn(g, dense ? 'u' : 'l', dense ? 6 : 14, seed);
	if (!dense) tuftsIn(g, 5, seed + 9);
	return g;
}

// where trees stand (their feet), kept well inside the diamond
export const SPARSE_SPOTS: Spot[][] = [
	[
		[11, 9],
		[21, 7]
	],
	[
		[9, 7],
		[19, 10]
	]
];
export const DENSE_SPOTS: Spot[][] = [
	[
		[16, 4],
		[9, 7],
		[23, 7],
		[13, 11],
		[20, 11]
	],
	[
		[12, 4],
		[22, 6],
		[7, 8],
		[16, 9],
		[24, 10]
	]
];

const woods = (spots: Spot[][], conifer: boolean, dense: boolean, seed: number): Look[] =>
	spots.map((s, n) => look(treeTop(dense, seed + n), 'earth', planted(conifer, s, dense)));

export const FOREST_SPARSE = woods(SPARSE_SPOTS, false, false, 40);
export const FOREST_DENSE = woods(DENSE_SPOTS, false, true, 44);
export const CONIFER_SPARSE = woods(SPARSE_SPOTS, true, false, 48);
export const CONIFER_DENSE = woods(DENSE_SPOTS, true, true, 52);

// a felled wood: grass with stumps
export const CLEARING: Look = (() => {
	const g = grassTop(57);
	stamp(g, ['WW', 'bb'], 10, 5, true);
	stamp(g, ['WW', 'bb'], 19, 9, true);
	return look(g, 'earth');
})();

// ------------------------------------------------------------------ water

function waterTop(base: string, wave: string, n: number, seed: number): Grid {
	const g = topGrid(base);
	ticksIn(g, wave, n, seed);
	return g;
}

export const SEA_SHALLOW: Look[] = [60, 61, 62].map((s) => look(waterTop('a', 'e', 6, s), 'earth'));
export const SEA_DEEP: Look[] = [63, 64, 65].map((s) => look(waterTop('A', 'a', 7, s), 'earth'));
export const LAKE: Look[] = [66, 67, 68].map((s) => look(waterTop('a', 'e', 8, s), 'earth'));

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

// where on the diamond a deposit's mark can sit (top-left of its 5 x 3)
export const DEPOSIT_SPOTS: Spot[] = [
	[7, 5],
	[20, 5],
	[9, 9],
	[18, 9]
];

// Things that stand on a tile, written in tile rows (0 is the diamond's top
// corner, rows above it are negative).
function compose(parts: [string[], number, number][]): SpriteDef {
	const g = standGrid();
	for (const [rows, x, y] of parts) standStamp(g, rows, x, y);
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

// Distance of a pixel from the diamond's middle in "edge steps": 16 is the
// diamond's own edge, so smaller numbers are rings inside it.
const ring = (x: number, y: number): number => Math.abs(x - 15.5) + 2 * Math.abs(y - 7.5);

// ploughed furrows along the tile's x axis, a headland of grass round them
function fieldIcon(): SpriteDef {
	const g = standGrid();
	for (let y = 0; y < TILE_H; y++) {
		for (let x = 0; x < TILE_W; x++) {
			if (!inDiamond(x, y) || ring(x, y) > 13) continue;
			const m = (((2 * y - x) % 6) + 6) % 6;
			g[y + RISE][x] = m < 2 ? 'O' : m < 4 ? 'o' : x % 3 === 0 ? 'l' : 'g';
		}
	}
	return def(g);
}

// a fence round the diamond with straw inside
function penIcon(): SpriteDef {
	const g = standGrid();
	for (let y = 0; y < TILE_H; y++) {
		for (let x = 0; x < TILE_W; x++) {
			if (!inDiamond(x, y)) continue;
			const r = ring(x, y);
			if (r > 13 || r < 10.5) {
				if (r < 10.5 && hash(x, y, 3) < 0.12) g[y + RISE][x] = hash(x, y, 4) < 0.3 ? 'y' : 's';
				continue;
			}
			g[y + RISE][x] = (x >> 1) % 3 === 0 ? 'b' : 'W';
		}
	}
	return def(g);
}

export const BUILT_ICON: Partial<Record<number, SpriteDef>> = {
	[Built.camp]: compose([
		[TENT, 8, 4],
		[FIRE, 19, 8]
	]),
	[Built.hut]: compose([[HUT, 10, 2]]),
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
			11,
			5
		],
		[['.c', 'c.', '.c'], 14, 1]
	]),
	[Built.pen]: penIcon(),
	[Built.shrine]: compose([
		[STONE, 8, 6],
		[STONE, 13, 3],
		[STONE, 19, 6],
		[['rr', 'Rr'], 15, 10],
		[['n'], 15, 9]
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
			10,
			3
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
			11,
			2
		]
	])
};

// A village's centre: a hut, a tent, a fire and a flag in the village's colour.
// Two huts, a tent, a fire and a tall flag, so it reads at 1x.
export const VILLAGE_ICON: SpriteDef = compose([
	[HUT, 3, 3],
	[HUT, 17, 2],
	[TENT, 10, 8],
	[FIRE, 22, 11],
	[['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'], 15, -6],
	[['MMMMM', 'MMMMM', 'MMMMM', 'MMMM.', 'MMM..'], 16, -6]
]);

// Whether a tile can be cleared for a village: only tree cover, not peaks.
export const isWooded = (stand: SpriteDef | null, face: FaceMat): boolean =>
	stand !== null && face === 'earth';

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

// Which land neighbours are high ground (above the beach level), where the
// shore is the foot of a cliff rather than a beach.
function rockyShore(layers: MapLayers, tx: number, ty: number, mask: number): number {
	const levels = levelsOf(layers);
	let rocky = 0;
	for (const [dx, dy, bit] of DIRS) {
		if (mask & bit && levels[(ty + dy) * layers.size + tx + dx] > 1) rocky |= bit;
	}
	return rocky;
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
	// the diamond's top face
	base: SpriteDef;
	// trees or peaks standing on it
	stand: SpriteDef | null;
	// what the tile's cliffs are made of
	face: FaceMat;
	// shoreline or river laid over the top face
	over: SpriteDef | null;
	// the river's channel code (0 if not a river), for waterfalls
	river: number;
	deposit: SpriteDef | null;
	depositX: number;
	depositY: number;
	built: SpriteDef | null;
};

export const newPick = (): TilePick => ({
	base: GRASS[0].top,
	stand: null,
	face: 'earth',
	over: null,
	river: 0,
	deposit: null,
	depositX: 0,
	depositY: 0,
	built: null
});

const choose = <T>(list: T[], tx: number, ty: number, salt: number): T =>
	list[Math.floor(hash(tx, ty, salt) * list.length)];

function landLook(layers: MapLayers, living: Living, i: number, tx: number, ty: number): Look {
	const biome = layers.biome[i];
	const wood = living.wood[i];
	const plants = living.plants[i];
	const tree = (sparse: Look[], dense: Look[], conifers: [Look[], Look[]]) => {
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
	out.stand = null;
	out.river = 0;
	out.deposit = null;
	out.built = null;
	const water = layers.water[i];

	if (water === Water.river || water === Water.spring) {
		const land = landLook(layers, living, i, tx, ty);
		out.base = land.top;
		out.face = land.face;
		// the channel stays in the open: no trees growing out of it
		out.river = riverCode(layers, tx, ty);
		out.over = riverOverlay(out.river, Math.floor(hash(tx, ty, 41) * 4));
		return;
	}
	if (water !== Water.none || layers.biome[i] === Biome.ocean) {
		const mask = shoreMask(layers, tx, ty);
		let wet: Look;
		if (water === Water.lake) wet = choose(LAKE, tx, ty, 12);
		else if (mask !== 0 || layers.height[i] > SEA_LEVEL * 0.7)
			wet = choose(SEA_SHALLOW, tx, ty, 13);
		else wet = choose(SEA_DEEP, tx, ty, 14);
		out.base = wet.top;
		out.face = wet.face;
		out.over = mask === 0 ? null : shoreOverlay(mask, rockyShore(layers, tx, ty, mask));
		return;
	}

	const land = landLook(layers, living, i, tx, ty);
	out.base = land.top;
	out.stand = land.stand;
	out.face = land.face;
	const deposit = DEPOSIT_ICON[layers.deposit[i]];
	if (deposit) {
		const spot = DEPOSIT_SPOTS[Math.floor(hash(tx, ty, 15) * DEPOSIT_SPOTS.length)];
		out.deposit = deposit;
		out.depositX = spot[0];
		out.depositY = spot[1];
	}
	out.built = BUILT_ICON[living.built[i]] ?? null;
}

// Every sprite of a 32-wide tile (top faces, standing sprites, overlays and
// icons), for tests and tools.
export function allTileSprites(): SpriteDef[] {
	const looks: Look[] = [
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
		...LAKE
	];
	const list: SpriteDef[] = [];
	for (const l of looks) {
		list.push(l.top);
		if (l.stand) list.push(l.stand);
	}
	list.push(VILLAGE_ICON);
	for (let m = 0; m < 256; m++) {
		const shore = shoreOverlay(m);
		if (shore) list.push(shore);
	}
	for (let c = 0; c < 256; c++) list.push(riverOverlay(c | ((c & 15) << 8)));
	for (const icon of Object.values(BUILT_ICON)) if (icon) list.push(icon);
	return list;
}
