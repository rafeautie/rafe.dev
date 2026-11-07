import { SEA_LEVEL } from '../config';
import { Biome, Built, Deposit, Ground, Water, type MapLayers } from '../types';
import { PALETTE, type ColorName } from './pixel/palette';
import { N, NE, riverLinks } from './pixel/maptiles';
import { hash, type DrawState, type Living, type Standing, type View } from './scene';
import {
	DIAMOND_H,
	DIAMOND_W,
	Face,
	K,
	LIFT,
	MAX_TILE_H,
	TILE as T,
	cliffDrop,
	fallColumns,
	paintFace,
	tileHeight,
	toDiamond,
	type FaceStyle
} from './pixel/localiso';

// The ground up close, as isometric pixel art. Each tile is painted once, top
// down, on a 240 x 240 grid (6 pixels a metre: grass texture, shores, fields,
// worn earth, river channels), then turned into its 480 x 240 diamond one
// pixel to one pixel (pixel/localiso.ts), given the cliff faces that hang
// below it where the tile in front is lower, and kept in a cache. Every frame
// a tile is one `drawImage` at a whole-number scale with smoothing off, as its
// own entry in the depth sort (its depth is its back corner, tx + ty).
//
// Everything is deterministic from `hash`, so a tile always paints the same
// way. The painting (`paintTile`, `paintDiamond`) works on plain pixel arrays,
// with no canvas, so it can be tested. Only moving water is drawn live: a
// handful of shimmer dashes per water tile, chosen from `state.now`.

type GroundLayers = Pick<MapLayers, 'size' | 'height' | 'water' | 'biome' | 'ground' | 'deposit'>;
type VillageSpot = { x: number; y: number };

// what painting a tile needs to know about the world
export type GroundEnv = {
	layers: GroundLayers;
	living: Living;
	villages: VillageSpot[];
	season: number;
	// every tile's height level (pixel/iso.ts levelsOf)
	levels: Uint8Array;
};

// ------------------------------------------------------------------ colours

// [base, dark, light, accent] by season (spring, summer, autumn, winter)
type Look = readonly [ColorName, ColorName, ColorName, ColorName];
const LEAFY: Record<number, Look[]> = {
	[Biome.grassland]: [
		['grassLight', 'grass', 'moss', 'blossom'],
		['grass', 'leaf', 'grassLight', 'gold'],
		['moss', 'leaf', 'straw', 'orange'],
		['moss', 'leaf', 'straw', 'white']
	],
	[Biome.forest]: [
		['grass', 'leaf', 'leafDark', 'blossom'],
		['leaf', 'leafDark', 'grass', 'soil'],
		['moss', 'rust', 'soilLight', 'orange'],
		['leaf', 'leafDark', 'moss', 'white']
	],
	[Biome.wetland]: [
		['moss', 'leaf', 'grass', 'water'],
		['moss', 'leaf', 'grass', 'water'],
		['moss', 'soilLight', 'straw', 'water'],
		['moss', 'leaf', 'stoneLight', 'ice']
	],
	[Biome.scrub]: [
		['moss', 'grass', 'straw', 'blossom'],
		['straw', 'moss', 'sandLight', 'gold'],
		['straw', 'soilLight', 'moss', 'orange'],
		['straw', 'moss', 'sandLight', 'white']
	],
	[Biome.hills]: [
		['moss', 'grass', 'straw', 'blossom'],
		['moss', 'soilLight', 'straw', 'stone'],
		['straw', 'soilLight', 'moss', 'orange'],
		['moss', 'soilLight', 'straw', 'stoneLight']
	]
};
const SAND: Look = ['sand', 'straw', 'sandLight', 'sandLight'];
const GROUND_LOOK: Record<number, Look> = {
	[Ground.sand]: SAND,
	[Ground.clay]: ['clay', 'rust', 'soilLight', 'soilLight'],
	[Ground.rock]: ['stone', 'stoneDark', 'stoneLight', 'stoneLight'],
	[Ground.chalk]: ['chalk', 'stoneLight', 'white', 'stoneDark'],
	[Ground.bog]: ['moss', 'leafDark', 'grass', 'water']
};
const ROCK: Look = ['stone', 'stoneDark', 'stoneLight', 'stoneLight'];
const SNOWY: Look = ['white', 'ice', 'white', 'ice'];

// how much of the ground is under snow in winter
const WINTER_SNOW: Record<number, number> = {
	[Biome.grassland]: 0.55,
	[Biome.forest]: 0.45,
	[Biome.wetland]: 0.35,
	[Biome.scrub]: 0.5,
	[Biome.hills]: 0.6,
	[Biome.coast]: 0.25,
	[Biome.mountain]: 0.85,
	[Biome.snow]: 1
};

const isOpenWater = (layers: GroundLayers, i: number) =>
	layers.water[i] !== Water.none || layers.biome[i] === Biome.ocean;
const isRiver = (layers: Pick<MapLayers, 'water' | 'biome'>, i: number) =>
	layers.water[i] === Water.river && layers.biome[i] !== Biome.ocean;
// lakes, sea and springs: whole tiles of water
const isPool = (layers: GroundLayers, i: number) => isOpenWater(layers, i) && !isRiver(layers, i);

function landLook(layers: GroundLayers, i: number, season: number): Look {
	const biome = layers.biome[i];
	if (biome === Biome.snow) return SNOWY;
	if (biome === Biome.mountain) return ROCK;
	if (biome === Biome.coast) return SAND;
	// the biome sets the colour, as on the map; the ground layer only shows as
	// small exposed patches (paintExposed)
	return (LEAFY[biome] ?? LEAFY[Biome.grassland])[season];
}

function waterLook(layers: GroundLayers, i: number, season: number): Look {
	const w = layers.water[i];
	if (w === Water.lake) {
		return season === 3
			? ['ice', 'waterLight', 'white', 'white']
			: ['water', 'deep', 'waterLight', 'foam'];
	}
	if (w === Water.spring) return ['waterLight', 'water', 'foam', 'white'];
	if (w === Water.river) return ['water', 'deep', 'waterLight', 'foam'];
	const depth = Math.min(1, Math.max(0, (SEA_LEVEL - layers.height[i]) / SEA_LEVEL));
	if (depth < 0.3) return ['waterLight', 'water', 'foam', 'white'];
	if (depth < 0.65) return ['water', 'deep', 'waterLight', 'foam'];
	return ['deep', 'deep', 'water', 'waterLight'];
}

const isFrozen = (layers: GroundLayers, i: number, season: number) =>
	season === 3 && layers.water[i] === Water.lake;

// ------------------------------------------------------------ scratch state

const scratch = new Uint32Array(T * T);
let B: Uint32Array = scratch;
const nA = new Float32Array(T * T);
const nB = new Float32Array(T * T);
const nC = new Float32Array(T * T);
const chan = new Uint8Array(T * T);
const lattice = new Float32Array(22 * 22);
const smoothW = new Float32Array(T);
const segBuf: number[] = new Array(63).fill(0);
const segBuf2: number[] = new Array(63).fill(0);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const sm = (t: number) => t * t * (3 - 2 * t);

function px(x: number, y: number, c: number): void {
	if (x >= 0 && y >= 0 && x < T && y < T) B[y * T + x] = c;
}

// Smooth value noise over the whole world's pixel grid, so it carries across
// tile borders: lattice points every `cell` pixels, bilinear in between.
function noiseField(tx: number, ty: number, cell: number, salt: number, out: Float32Array): void {
	const n = T / cell + 1;
	const per = T / cell;
	for (let j = 0; j < n; j++)
		for (let i = 0; i < n; i++) lattice[j * n + i] = hash(tx * per + i, ty * per + j, salt, 7);
	for (let k = 0; k < T; k++) smoothW[k] = sm((k % cell) / cell);
	for (let y = 0; y < T; y++) {
		const j = Math.floor(y / cell);
		const fy = smoothW[y];
		for (let x = 0; x < T; x++) {
			const i = Math.floor(x / cell);
			const fx = smoothW[x];
			const a = lattice[j * n + i];
			const b = lattice[j * n + i + 1];
			const c = lattice[(j + 1) * n + i];
			const d = lattice[(j + 1) * n + i + 1];
			out[y * T + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
		}
	}
}

// ------------------------------------------------------------------- tiles

const level = (v: number, steps: number) => Math.min(steps - 1, Math.max(0, Math.floor(v * steps)));

// land base: mostly the base colour, with the two close shades in small
// clumps (a little dither on their edges, not a speckle)
function fillLand(tx: number, ty: number, look: Look): void {
	const base = K[look[0]];
	const dark = K[look[1]];
	const light = K[look[2]];
	noiseField(tx, ty, 40, 1, nA);
	noiseField(tx, ty, 12, 2, nB);
	for (let y = 0; y < T; y++) {
		for (let x = 0; x < T; x++) {
			const p = y * T + x;
			const v = nA[p] * 0.6 + nB[p] * 0.4 + (bay(x, y) - 0.5) * 0.08;
			B[p] = v < 0.27 ? light : v > 0.73 ? dark : base;
		}
	}
}

function snowOver(tx: number, ty: number, cover: number): void {
	if (cover <= 0) return;
	// big drifts, with a little finer edge to them
	noiseField(tx, ty, 60, 3, nC);
	noiseField(tx, ty, 20, 5, nA);
	const thr = 1 - cover;
	for (let y = 0; y < T; y++) {
		for (let x = 0; x < T; x++) {
			const w = nC[y * T + x] * 0.8 + nA[y * T + x] * 0.2 + (bay(x, y) - 0.5) * 0.06;
			if (cover >= 1) {
				B[y * T + x] = bay(x + 1, y) < 0.12 ? K.ice : K.white;
			} else if (w > thr + 0.05) {
				B[y * T + x] = bay(x + 1, y) < 0.08 ? K.ice : K.white;
			} else if (w > thr && bay(x, y) < 0.5) {
				B[y * T + x] = K.white;
			}
		}
	}
}

// how far into a tile its neighbour's ground reaches, in pixels
const BLEND = 44;
// how far a lake corner is rounded off, in pixels
const ROUND = 30;

// Soft edges between different ground. Across a border the share of the far
// side's colour falls from half at the border to nothing BLEND pixels in, and
// which pixels take it follows a noise field that carries on over the border.
// Both tiles read the same field (flipped on one side), so the two halves
// meet as one set of blobs, not a seam.
function blendEdges(tx: number, ty: number, env: GroundEnv, look: Look): void {
	const { layers } = env;
	const size = layers.size;
	let ready = false;
	for (let side = 0; side < 4; side++) {
		const nx = tx + (side === 1 ? 1 : side === 3 ? -1 : 0);
		const ny = ty + (side === 2 ? 1 : side === 0 ? -1 : 0);
		if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
		const ni = ny * size + nx;
		if (isOpenWater(layers, ni) && !isRiver(layers, ni)) continue;
		if (env.living.built[ni] === Built.field) continue;
		const nl = landLook(layers, ni, env.season);
		if (nl[0] === look[0] && nl[1] === look[1]) continue;
		if (!ready) {
			noiseField(tx, ty, 10, 11, nA);
			noiseField(tx, ty, 24, 12, nB);
			ready = true;
		}
		const c = K[nl[0]];
		// the east and south tiles read the field as it is, the others upside down
		const flip = side === 0 || side === 3;
		for (let d = 0; d < BLEND; d++) {
			const share = 0.5 - (d + 0.5) / (BLEND * 2);
			for (let a = 0; a < T; a++) {
				const x = side === 1 ? T - 1 - d : side === 3 ? d : a;
				const y = side === 2 ? T - 1 - d : side === 0 ? d : a;
				const p = y * T + x;
				let m = 0.5 + (nA[p] * 0.6 + nB[p] * 0.4 - 0.5) * 2 + (bay(x, y) - 0.5) * 0.08;
				if (flip) m = 1 - m;
				// snow is left alone: it carries on over the border by itself
				if (m < share && !isSnow(B[p])) B[p] = c;
			}
		}
	}
}

// A patch of ground in two colours: solid in the middle, dithered round it
function patch(
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	inner: ColorName,
	outer: ColorName,
	seed: number
): void {
	const ci = K[inner];
	const co = K[outer];
	for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(T - 1, Math.ceil(cy + ry)); y++) {
		for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(T - 1, Math.ceil(cx + rx)); x++) {
			const u = (x - cx) / rx;
			const v = (y - cy) / ry;
			const wob = 1 + (hash(x >> 3, y >> 3, seed) - 0.5) * 0.3;
			const d = (u * u + v * v) * wob;
			if (d > 1) continue;
			if (d < 0.4) B[y * T + x] = ci;
			else if (bay(x, y) < 1.1 - d) B[y * T + x] = d < 0.7 ? ci : co;
			else if (bay(x + 2, y + 1) < 0.5) B[y * T + x] = co;
		}
	}
}

// ---------------------------------------------------------- stains and wear

const DEP_STAIN: Partial<Record<number, [ColorName, ColorName]>> = {
	[Deposit.flint]: ['chalk', 'stoneLight'],
	[Deposit.clay]: ['clay', 'rust'],
	[Deposit.copper]: ['stoneDark', 'stone'],
	[Deposit.tin]: ['stone', 'stoneLight'],
	[Deposit.bogIron]: ['soil', 'rust'],
	[Deposit.salt]: ['white', 'chalk'],
	[Deposit.ochre]: ['ochre', 'gold'],
	[Deposit.meteorite]: ['obsidian', 'shadow']
};

function wornGround(cx: number, cy: number, rx: number, ry: number, seed: number): void {
	patch(cx, cy, rx, ry, 'soilLight', 'soilLight', seed);
	for (let j = 0; j < 22; j++) {
		const a = hash(seed, j, 1) * Math.PI * 2;
		const d = Math.sqrt(hash(seed, j, 2));
		const x = Math.round(cx + Math.cos(a) * d * rx * 0.9);
		const y = Math.round(cy + Math.sin(a) * d * ry * 0.9);
		px(x, y, j % 3 === 0 ? K.sand : K.soil);
		if (j % 2 === 0) px(x + 1, y, K.soil);
	}
}

// Footprints are round on the ground (a circle here is the 2:1 oval of the
// iso view) or square along the tile's sides.
function paintBuilt(built: number, tx: number, ty: number): void {
	const s = tx * 977 + ty * 31;
	switch (built) {
		case Built.camp:
			wornGround(120, 122, 62, 56, s);
			patch(120, 125, 9, 9, 'stoneDark', 'soil', s + 1);
			break;
		case Built.hut:
		case Built.store:
			wornGround(120, 139, 38, 38, s);
			break;
		case Built.kiln:
		case Built.furnace:
			wornGround(120, 135, 36, 36, s);
			patch(120, 140, 13, 13, 'soilDark', 'soil', s + 2);
			break;
		case Built.shrine:
			wornGround(120, 120, 56, 56, s);
			for (let j = 0; j < 40; j++) {
				const a = hash(s, j, 5) * Math.PI * 2;
				const d = 14 + hash(s, j, 6) * 36;
				px(Math.round(120 + Math.cos(a) * d), Math.round(120 + Math.sin(a) * d), K.stoneLight);
			}
			break;
		case Built.pen: {
			// trodden straw inside the fence, a square along the tile's axes
			noiseField(tx, ty, 12, 9, nB);
			for (let y = 48; y < 192; y++)
				for (let x = 48; x < 192; x++) B[y * T + x] = nB[y * T + x] < 0.4 ? K.soil : K.soilLight;
			for (let j = 0; j < 70; j++) {
				const x = 50 + Math.floor(hash(tx, ty, j, 23) * 138);
				const y = 50 + Math.floor(hash(tx, ty, j, 24) * 138);
				px(x, y, K.straw);
				px(x + 1, y, K.straw);
				if (j % 3 === 0) px(x + 2, y, K.sand);
			}
			break;
		}
		default:
			break;
	}
}

// ----------------------------------------------------------------- villages

const WORN = new Set<number>([
	Built.camp,
	Built.hut,
	Built.store,
	Built.kiln,
	Built.furnace,
	Built.shrine
]);
const MAX_PATHS = 40;
const pathBuf: number[] = new Array(MAX_PATHS * 5).fill(0);

// The worn tracks from each village centre to the buildings round it that cross
// this tile, as [x0, y0, x1, y1, bend] in tile pixels; returns how many.
// The cache key uses this too, so a new hut redraws the tiles its track crosses.
function pathsFor(env: GroundEnv, tx: number, ty: number): number {
	const { layers, living, villages } = env;
	const size = layers.size;
	let n = 0;
	for (const v of villages) {
		if (Math.abs(v.x - tx) > 6 || Math.abs(v.y - ty) > 6) continue;
		const cx = (v.x + 0.5 - tx) * T;
		const cy = (v.y + 0.5 - ty) * T;
		for (let dy = -5; dy <= 5; dy++) {
			for (let dx = -5; dx <= 5; dx++) {
				const bx = v.x + dx;
				const by = v.y + dy;
				if (bx < 0 || by < 0 || bx >= size || by >= size || (dx === 0 && dy === 0)) continue;
				const b = living.built[by * size + bx];
				if (b === Built.none || b === Built.field) continue;
				const ex = (bx + 0.5 - tx) * T;
				const ey = (by + 0.62 - ty) * T;
				// skip tracks that can't touch this tile
				if (
					Math.max(cx, ex) < -8 ||
					Math.min(cx, ex) > T + 8 ||
					Math.max(cy, ey) < -8 ||
					Math.min(cy, ey) > T + 8
				)
					continue;
				if (n >= MAX_PATHS) return n;
				const o = n * 5;
				pathBuf[o] = cx;
				pathBuf[o + 1] = cy;
				pathBuf[o + 2] = ex;
				pathBuf[o + 3] = ey;
				pathBuf[o + 4] = (hash(bx, by, 33) - 0.5) * 0.3 * T;
				n++;
			}
		}
	}
	return n;
}

function paintVillage(env: GroundEnv, tx: number, ty: number): void {
	for (const v of env.villages) {
		if (Math.abs(v.x - tx) > 1 || Math.abs(v.y - ty) > 1) continue;
		const cx = (v.x + 0.5 - tx) * T;
		const cy = (v.y + 0.5 - ty) * T;
		wornGround(cx, cy, 68, 68, v.x * 131 + v.y * 17);
	}
	const n = pathsFor(env, tx, ty);
	for (let s = 0; s < n; s++) {
		const o = s * 5;
		const x0 = pathBuf[o];
		const y0 = pathBuf[o + 1];
		const x1 = pathBuf[o + 2];
		const y1 = pathBuf[o + 3];
		const bend = pathBuf[o + 4];
		const len = Math.hypot(x1 - x0, y1 - y0);
		const steps = Math.ceil(len / 1.5);
		const nx = -(y1 - y0) / (len || 1);
		const ny = (x1 - x0) / (len || 1);
		for (let k = 0; k <= steps; k++) {
			const u = k / steps;
			const w = Math.sin(u * Math.PI) * bend;
			const x = Math.round(x0 + (x1 - x0) * u + nx * w);
			const y = Math.round(y0 + (y1 - y0) * u + ny * w);
			if (x < -3 || y < -3 || x > T + 2 || y > T + 2) continue;
			// a three-pixel track with ragged edges
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					const core = dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1;
					if (core) px(x + dx, y + dy, (x + y * 3) % 7 === 0 ? K.soil : K.soilLight);
					else if (bay(x + dx, y + dy) < 0.35) px(x + dx, y + dy, K.soilLight);
				}
			}
		}
	}
}

// ------------------------------------------------------------------- decals

const isSnow = (c: number) => c === K.white || c === K.ice;

// Bare ground showing through the turf: a few small patches in the ground's
// own colours, never the whole tile.
function paintExposed(tx: number, ty: number, i: number, layers: GroundLayers): void {
	const look = GROUND_LOOK[layers.ground[i]];
	if (!look || layers.ground[i] === Ground.bog) return;
	if (!isLeafy(layers, i)) return;
	const n = 1 + Math.floor(hash(tx, ty, 3, 70) * 3);
	for (let j = 0; j < n; j++) {
		const cx = 30 + hash(tx, ty, j, 71) * (T - 60);
		const cy = 30 + hash(tx, ty, j, 72) * (T - 60);
		const r = 10 + hash(tx, ty, j, 73) * 14;
		patch(cx, cy, r, r, look[0], look[1], tx * 31 + ty + j);
	}
}

function isLeafy(layers: GroundLayers, i: number): boolean {
	const biome = layers.biome[i];
	return (
		biome === Biome.grassland ||
		biome === Biome.forest ||
		biome === Biome.scrub ||
		biome === Biome.hills ||
		biome === Biome.wetland
	);
}

// Little tufts of grass, a dark V with a light tip. They stand up, so they are
// drawn on the finished diamond (rotated they would lie on their side), and
// only over plain ground: never on snow, water, tracks or a river bank.
const TUFTS = [2, 10, 22, 36];
function paintTufts(env: GroundEnv, tx: number, ty: number, i: number, look: Look, D: Uint32Array) {
	if (!isLeafy(env.layers, i)) return;
	const n = TUFTS[level(env.living.plants[i], 4)];
	const base = K[look[0]];
	const dark = K[look[1]];
	const light = K[look[2]];
	const grass = (x: number, y: number) => {
		if (x < 0 || y < 0 || x >= DIAMOND_W || y >= DIAMOND_H) return false;
		const c = D[y * DIAMOND_W + x];
		return c === base || c === dark || c === light;
	};
	for (let j = 0; j < n; j++) {
		const wx = Math.floor(hash(tx, ty, j, 16) * T);
		const wy = Math.floor(hash(tx, ty, j, 17) * T);
		const x = T + wx - wy;
		const y = (wx + wy) >> 1;
		const tip = x + (j & 1 ? 1 : -1);
		if (!grass(x, y) || !grass(x - 1, y - 1) || !grass(x + 1, y - 1) || !grass(tip, y - 2))
			continue;
		D[y * DIAMOND_W + x] = dark;
		D[(y - 1) * DIAMOND_W + x - 1] = dark;
		D[(y - 1) * DIAMOND_W + x + 1] = dark;
		D[(y - 2) * DIAMOND_W + tip] = light;
	}
}

function paintDecals(env: GroundEnv, tx: number, ty: number, i: number, look: Look): void {
	const { layers, living, season } = env;
	const biome = layers.biome[i];
	const ground = layers.ground[i];
	const plants = level(living.plants[i], 4);
	const dark = K[look[1]];
	const light = K[look[2]];
	const accent = K[look[3]];
	const leafy = isLeafy(layers, i);
	const free = (x: number, y: number) =>
		x > 0 && y > 1 && x < T - 1 && y < T && !isSnow(B[y * T + x]);

	if (leafy) {
		// season: flowers in spring, a few in summer, fallen leaves in autumn
		const flowers = season === 0 ? 14 : season === 1 ? 5 : 0;
		for (let j = 0; j < flowers; j++) {
			const x = Math.floor(hash(tx, ty, j, 80) * T);
			const y = 2 + Math.floor(hash(tx, ty, j, 81) * (T - 2));
			if (!free(x, y) || plants === 0) continue;
			px(x, y, j % 3 === 0 ? K.white : accent);
		}
		const leaves = season === 2 ? (biome === Biome.forest ? 26 : 10) : 0;
		for (let j = 0; j < leaves; j++) {
			const x = Math.floor(hash(tx, ty, j, 82) * (T - 2));
			const y = 2 + Math.floor(hash(tx, ty, j, 83) * (T - 3));
			if (!free(x, y)) continue;
			const c = [K.orange, K.gold, K.rust][j % 3];
			px(x, y, c);
			px(x + 1, y, c);
		}
		if (biome === Biome.forest && season !== 3) {
			for (let j = 0; j < 14; j++) {
				const x = Math.floor(hash(tx, ty, j, 84) * (T - 2));
				const y = 2 + Math.floor(hash(tx, ty, j, 85) * (T - 3));
				if (!free(x, y)) continue;
				px(x, y, K.soil);
				px(x + 1, y, K.soilDark);
			}
		}
		if (biome === Biome.wetland || ground === Ground.bog) {
			for (let j = 0; j < 4; j++) pool(tx, ty, j);
		}
	}
	if (ground === Ground.bog) for (let j = 0; j < 5; j++) pool(tx, ty, j);
	if (biome === Biome.coast) {
		// ripples of sand
		for (let j = 0; j < 7; j++) {
			const x = Math.floor(hash(tx, ty, j, 56) * (T - 10));
			const y = 3 + Math.floor(hash(tx, ty, j, 57) * (T - 5));
			const len = 5 + Math.floor(hash(tx, ty, j, 58) * 5);
			for (let k = 0; k < len; k++) if (free(x + k, y)) px(x + k, y - (k > len / 2 ? 1 : 0), light);
		}
	}
	if (biome === Biome.mountain) {
		// cracks and chips
		for (let j = 0; j < 6; j++) {
			let x = Math.floor(hash(tx, ty, j, 50) * T);
			let y = Math.floor(hash(tx, ty, j, 51) * T);
			for (let s = 0; s < 10; s++) {
				if (free(x, y)) px(x, y, dark);
				const r = hash(tx, ty, j * 16 + s, 52);
				if (r < 0.45) x += 1;
				else if (r < 0.9) y += 1;
				else x -= 1;
			}
		}
		for (let j = 0; j < 16; j++) {
			const x = Math.floor(hash(tx, ty, j, 54) * T);
			const y = Math.floor(hash(tx, ty, j, 55) * T);
			if (free(x, y)) {
				px(x, y, light);
				px(x + 1, y, light);
			}
		}
	}
	if (ground === Ground.chalk) {
		// flints in the chalk
		for (let j = 0; j < 10; j++) {
			const x = Math.floor(hash(tx, ty, j, 53) * T);
			const y = Math.floor(hash(tx, ty, j, 59) * T);
			if (free(x, y)) {
				px(x, y, K.stoneDark);
				px(x + 1, y, K.stone);
			}
		}
	}
	if (ground === Ground.sand || ground === Ground.loam) {
		// grit
		for (let j = 0; j < 18; j++) {
			const x = Math.floor(hash(tx, ty, j, 13) * T);
			const y = Math.floor(hash(tx, ty, j, 14) * T);
			if (free(x, y)) px(x, y, j & 1 ? dark : light);
		}
	}
}

function pool(tx: number, ty: number, j: number): void {
	const cx = 14 + Math.floor(hash(tx, ty, j, 60) * (T - 28));
	const cy = 14 + Math.floor(hash(tx, ty, j, 61) * (T - 28));
	const rx = 4 + Math.floor(hash(tx, ty, j, 62) * 6);
	patch(cx, cy, rx, rx * 0.5, 'water', 'soilDark', tx * 7 + ty + j);
	px(cx - 1, cy - 1, K.waterLight);
	px(cx, cy - 1, K.waterLight);
}

// ------------------------------------------------------------------- fields

const SOIL_BY_SEASON: ColorName[] = ['soil', 'soilDark', 'soil', 'soilLight'];

function paintField(env: GroundEnv, tx: number, ty: number, i: number): void {
	const { layers, living, season } = env;
	const size = layers.size;
	noiseField(tx, ty, 12, 9, nB);
	const soil = K[SOIL_BY_SEASON[season]];
	// rows twelve pixels apart: a light ridge, the crop, a dark furrow
	for (let y = 0; y < T; y++) {
		const ry = y % 12;
		const row = Math.floor(y / 12);
		for (let x = 0; x < T; x++) {
			let c = soil;
			if (ry === 11) c = K.soilDark;
			else if (ry === 0 && nB[y * T + x] > 0.4) c = K.soilLight;
			const col = (x + (row & 1) * 3) % 6;
			if (col < 2 && ry >= 3 && ry <= 10) {
				switch (season) {
					case 0:
						if (col === 0 && ry >= 8) c = ry === 8 ? K.grassLight : K.grass;
						break;
					case 1:
						if (ry <= 5) c = col === 0 ? K.grassLight : K.grass;
						else if (ry <= 7) c = col === 0 ? K.grass : K.leaf;
						else c = K.leaf;
						break;
					case 2:
						if (ry === 3 && col === 0) c = K.orange;
						else if (ry <= 6) c = col === 0 ? K.gold : K.straw;
						else c = K.straw;
						break;
					default:
						if (col === 0 && ry >= 9 && (Math.floor(x / 6) + row * 3) % 3 === 0) c = K.straw;
				}
			}
			B[y * T + x] = c;
		}
	}
	if (season === 3) snowOver(tx, ty, 0.5);
	// a dark edge where the field stops
	const field = (dx: number, dy: number) => {
		const nx = tx + dx;
		const ny = ty + dy;
		return (
			nx >= 0 && ny >= 0 && nx < size && ny < size && living.built[ny * size + nx] === Built.field
		);
	};
	for (let k = 0; k < T; k++) {
		if (!field(0, -1)) B[k] = K.soilDark;
		if (!field(0, 1)) B[(T - 1) * T + k] = K.soilDark;
		if (!field(-1, 0)) B[k * T] = K.soilDark;
		if (!field(1, 0)) B[k * T + T - 1] = K.soilDark;
	}
	void i;
}

// --------------------------------------------------------------- shores

function wobble(s: number, salt: number): number {
	const a = Math.floor(s / 14);
	const t = sm((((s % 14) + 14) % 14) / 14);
	const v0 = hash(a, salt, 3);
	const v1 = hash(a + 1, salt, 3);
	return v0 + (v1 - v0) * t;
}

// where a river's mouth meets the edge of the tile `side` of (tx, ty): the
// centre and half width along the edge, in pixels, or null
function mouthAt(
	layers: GroundLayers,
	tx: number,
	ty: number,
	side: number
): [number, number] | null {
	const size = layers.size;
	const nx = tx + (side === 1 ? 1 : side === 3 ? -1 : 0);
	const ny = ty + (side === 2 ? 1 : side === 0 ? -1 : 0);
	if (nx < 0 || ny < 0 || nx >= size || ny >= size || !isRiver(layers, ny * size + nx)) return null;
	const n = riverChannel(layers, nx, ny, segBuf2);
	for (let s = 0; s < n; s++) {
		const o = s * 7;
		const sx = segBuf2[o];
		const sy = segBuf2[o + 1];
		// the neighbour's edge facing us
		if (side === 0 && sy === 1) return [sx * T, (segBuf2[o + 6] * T) / 2];
		if (side === 2 && sy === 0) return [sx * T, (segBuf2[o + 6] * T) / 2];
		if (side === 1 && sx === 0) return [sy * T, (segBuf2[o + 6] * T) / 2];
		if (side === 3 && sx === 1) return [sy * T, (segBuf2[o + 6] * T) / 2];
	}
	return null;
}

// Beaches on a water tile: sand, a line of wet sand and foam, then a lighter
// shallow band, wobbling along the shore. `land[side]` is 1 where the neighbour
// is dry land.
function paintBeach(
	tx: number,
	ty: number,
	land: number[],
	corners: number[],
	env: GroundEnv
): void {
	const { layers } = env;
	const mouths: ([number, number] | null)[] = [0, 1, 2, 3].map((s) =>
		land[s] ? mouthAt(layers, tx, ty, s) : null
	);
	// corners c: 0 NW, 1 NE, 2 SE, 3 SW; sides 0 N, 1 E, 2 S, 3 W
	const round = [
		land[0] && land[3] && !mouths[0] && !mouths[3],
		land[0] && land[1] && !mouths[0] && !mouths[1],
		land[2] && land[1] && !mouths[2] && !mouths[1],
		land[2] && land[3] && !mouths[2] && !mouths[3]
	];
	const bd = (x: number, y: number): number => {
		// distance to the nearest shore, with the shore's wobbling width taken off
		let best = 99;
		// a lake corner between two land edges is cut round
		for (let c = 0; c < 4; c++) {
			if (!round[c]) continue;
			const lx = c === 1 || c === 2 ? T - 1 - x : x;
			const ly = c >= 2 ? T - 1 - y : y;
			if (lx < ROUND && ly < ROUND)
				return Math.round(ROUND - Math.hypot(ROUND - lx, ROUND - ly)) - 5;
		}
		for (let s = 0; s < 4; s++) {
			if (!land[s]) continue;
			const d = s === 0 ? y : s === 2 ? T - 1 - y : s === 3 ? x : T - 1 - x;
			const along = s === 0 || s === 2 ? x : y;
			const m = mouths[s];
			if (m && Math.abs(along - m[0]) < m[1] + 3) continue;
			const g = s === 0 || s === 2 ? tx * T + x : ty * T + y;
			const b = 3 + Math.floor(wobble(g, s * 17 + (s === 0 || s === 2 ? ty : tx)) * 6);
			best = Math.min(best, d - b);
		}
		for (let c = 0; c < 4; c++) {
			if (!corners[c]) continue;
			const cx = c === 1 || c === 2 ? T - 1 : 0;
			const cy = c >= 2 ? T - 1 : 0;
			best = Math.min(best, Math.round(Math.hypot(x - cx, y - cy)) - 5);
		}
		return best;
	};
	for (let y = 0; y < T; y++) {
		for (let x = 0; x < T; x++) {
			const r = bd(x, y);
			if (r > 4) continue;
			const p = y * T + x;
			if (r < -1) B[p] = K.sand;
			else if (r === -1) B[p] = K.sandLight;
			else if (r === 0) B[p] = bay(x, y) < 0.75 ? K.foam : K.sandLight;
			else if (r === 1) B[p] = bay(x, y) < 0.5 ? K.foam : K.waterLight;
			else if (r === 2) {
				if (bay(x, y) < 0.4) B[p] = K.waterLight;
			}
			// a thin dark line where the shore drops away
			else if (r === 3 ? bay(x, y) < 0.7 : bay(x, y) < 0.25) B[p] = K.deep;
		}
	}
}

// land next to water gets a band of damp sand along the edge
function paintLandShore(tx: number, ty: number, land: number[], water: number[]): void {
	void land;
	for (let side = 0; side < 4; side++) {
		if (!water[side]) continue;
		for (let d = 0; d < 6; d++) {
			for (let a = 0; a < T; a++) {
				const x = side === 1 ? T - 1 - d : side === 3 ? d : a;
				const y = side === 2 ? T - 1 - d : side === 0 ? d : a;
				if (d < 2) B[y * T + x] = K.sand;
				else if (bay(x, y) < (6 - d) / 4.5) B[y * T + x] = d < 4 ? K.sandLight : K.sand;
			}
		}
	}
	void tx;
	void ty;
}

// ------------------------------------------------------------ river channels

// Which pixels of a river tile are the channel: 3 water, 2 the first pixel of
// bank, 1 the outer bank, 0 neither. Drawn from `riverChannel` as discs along
// each curve, so it matches what `waterAt` says.
export function channelMask(layers: WaterLayers, tx: number, ty: number, out: Uint8Array): void {
	out.fill(0);
	const n = riverChannel(layers, tx, ty, segBuf);
	for (const [grow, val] of [
		[3, 1],
		[1, 2],
		[0, 3]
	] as const) {
		for (let s = 0; s < n; s++) {
			const o = s * 7;
			const r = (segBuf[o + 6] * T) / 2 + grow;
			const len = Math.hypot(segBuf[o + 4] - segBuf[o], segBuf[o + 5] - segBuf[o + 1]) * T;
			const steps = Math.max(6, Math.ceil(len / Math.max(1, r * 0.3)));
			for (let k = 0; k <= steps; k++) {
				const u = k / steps;
				const a = (1 - u) * (1 - u);
				const b = 2 * u * (1 - u);
				const c = u * u;
				const cx = (a * segBuf[o] + b * segBuf[o + 2] + c * segBuf[o + 4]) * T;
				const cy = (a * segBuf[o + 1] + b * segBuf[o + 3] + c * segBuf[o + 5]) * T;
				const y0 = Math.max(0, Math.ceil(cy - r));
				const y1 = Math.min(T - 1, Math.floor(cy + r));
				for (let y = y0; y <= y1; y++) {
					const hw = Math.sqrt(r * r - (y - cy) * (y - cy));
					const x0 = Math.max(0, Math.ceil(cx - hw));
					const x1 = Math.min(T - 1, Math.floor(cx + hw));
					if (x1 >= x0) out.fill(val, y * T + x0, y * T + x1 + 1);
				}
			}
		}
	}
}

function paintRiver(env: GroundEnv, tx: number, ty: number, i: number, sparks: number[]): void {
	channelMask(env.layers, tx, ty, chan);
	noiseField(tx, ty, 20, 4, nA);
	for (let y = 0; y < T; y++) {
		for (let x = 0; x < T; x++) {
			const p = y * T + x;
			const m = chan[p];
			if (m === 0) continue;
			if (m === 1) {
				if (bay(x, y) < 0.45) B[p] = K.soilLight;
			} else if (m === 2) {
				B[p] = K.soilLight;
			} else {
				// water, shadowed under the bank on the top and left
				const up = y > 0 ? chan[p - T] : 3;
				const left = x > 0 ? chan[p - 1] : 3;
				const down = y < T - 1 ? chan[p + T] : 3;
				const right = x < T - 1 ? chan[p + 1] : 3;
				let c = K.water;
				if (nA[p] > 0.62 && bay(x, y) < 0.7) c = K.deep;
				else if (nA[p] < 0.3 && bay(x, y) < 0.7) c = K.waterLight;
				if (up !== 3 || left !== 3) c = K.deep;
				else if (down !== 3 || right !== 3) c = bay(x, y) < 0.6 ? K.waterLight : K.water;
				B[p] = c;
			}
		}
	}
	// shimmer spots sit on the water
	for (let j = 0; j < 30; j++) {
		const x = 4 + Math.floor(hash(tx, ty, j, 15) * (T - 10));
		const y = 3 + Math.floor(hash(tx, ty, j, 16) * (T - 6));
		if (chan[y * T + x] === 3 && chan[y * T + x + 3] === 3 && chan[(y - 1) * T + x] === 3)
			sparks.push(x, y, j % 3, 3);
	}
	void i;
}

// --------------------------------------------------------------- open water

function paintPool(env: GroundEnv, tx: number, ty: number, i: number, sparks: number[]): void {
	const { layers, season } = env;
	const size = layers.size;
	const look = waterLook(layers, i, season);
	const frozen = isFrozen(layers, i, season);
	const base = K[look[0]];
	// open water is flat; ice keeps a little texture
	if (frozen) fillLand(tx, ty, look);
	else B.fill(base, 0, T * T);
	if (frozen) {
		// cracks in the ice
		for (let j = 0; j < 5; j++) {
			let x = Math.floor(hash(tx, ty, j, 50) * T);
			let y = Math.floor(hash(tx, ty, j, 51) * T);
			for (let s = 0; s < 22; s++) {
				px(x, y, K.waterLight);
				const r = hash(tx, ty, j * 32 + s, 52);
				if (r < 0.5) x += 1;
				else if (r < 0.9) y += 1;
				else y -= 1;
			}
		}
	} else {
		// short lighter swells
		for (let j = 0; j < 16; j++) {
			const x = Math.floor(hash(tx, ty, j, 21) * (T - 8));
			const y = Math.floor(hash(tx, ty, j, 22) * T);
			const len = 3 + Math.floor(hash(tx, ty, j, 23) * 4);
			for (let k = 0; k < len; k++) if (B[y * T + x + k] === base) px(x + k, y, K[look[2]]);
		}
	}
	// edges between pools of different depth, and shores against land
	const land = [0, 0, 0, 0];
	const corners = [0, 0, 0, 0];
	const nbs = [
		[0, -1],
		[1, 0],
		[0, 1],
		[-1, 0]
	];
	for (let s = 0; s < 4; s++) {
		const nx = tx + nbs[s][0];
		const ny = ty + nbs[s][1];
		if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
		const ni = ny * size + nx;
		if (!isOpenWater(layers, ni) || isRiver(layers, ni)) {
			land[s] = 1;
		} else {
			const nl = waterLook(layers, ni, season);
			if (nl[0] !== look[0]) blendSide(s, K[nl[0]]);
		}
	}
	const diag = [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1]
	];
	for (let c = 0; c < 4; c++) {
		const nx = tx + diag[c][0];
		const ny = ty + diag[c][1];
		if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
		const ni = ny * size + nx;
		const sideA = c === 0 || c === 3 ? 3 : 1;
		const sideB = c < 2 ? 0 : 2;
		if ((!isOpenWater(layers, ni) || isRiver(layers, ni)) && !land[sideA] && !land[sideB])
			corners[c] = 1;
	}
	if (land[0] || land[1] || land[2] || land[3] || corners.some((c) => c))
		paintBeach(tx, ty, land, corners, env);
	if (frozen) return;
	for (let j = 0; j < 22; j++) {
		const x = 4 + Math.floor(hash(tx, ty, j, 15) * (T - 10));
		const y = 3 + Math.floor(hash(tx, ty, j, 16) * (T - 6));
		const p = y * T + x;
		if (B[p] === K[look[0]] || B[p] === K[look[1]] || B[p] === K[look[2]])
			if (B[p + 3] !== K.sand) sparks.push(x, y, j % 3, 3);
	}
}

// pools of different depth meet in a short dithered band
const POOL_BLEND = 14;
function blendSide(side: number, c: number): void {
	for (let d = 0; d < POOL_BLEND; d++) {
		const p = (POOL_BLEND - d) / POOL_BLEND / 2;
		for (let a = 0; a < T; a++) {
			const x = side === 1 ? T - 1 - d : side === 3 ? d : a;
			const y = side === 2 ? T - 1 - d : side === 0 ? d : a;
			if (bay(x, y) < p) B[y * T + x] = c;
		}
	}
}

// -------------------------------------------------------------- one tile

// Paints tile (tx, ty) into `out` (T x T packed pixels) and returns its
// shimmer spots as [x, y, phase, length] runs.
export function paintTile(env: GroundEnv, tx: number, ty: number, out: Uint32Array): number[] {
	B = out;
	const { layers, living, season } = env;
	const size = layers.size;
	const i = ty * size + tx;
	const sparks: number[] = [];

	if (isPool(layers, i)) {
		paintPool(env, tx, ty, i, sparks);
		return sparks;
	}
	const built = living.built[i];
	const look = landLook(layers, i, season);
	if (built === Built.field) {
		paintField(env, tx, ty, i);
	} else {
		fillLand(tx, ty, look);
		const biome = layers.biome[i];
		const cover = season === 3 ? (WINTER_SNOW[biome] ?? 0.5) : biome === Biome.snow ? 1 : 0;
		snowOver(tx, ty, cover);
		blendEdges(tx, ty, env, look);
		paintExposed(tx, ty, i, layers);
		const dep = layers.deposit[i];
		const stain = DEP_STAIN[dep];
		if (stain)
			patch(
				(0.3 + 0.4 * hash(tx, ty, 1, 90)) * T,
				(0.4 + 0.3 * hash(tx, ty, 2, 90)) * T + 6,
				26,
				13,
				stain[0],
				stain[1],
				dep + tx
			);
		if (WORN.has(built) || built === Built.pen) paintBuilt(built, tx, ty);
		paintVillage(env, tx, ty);
		paintDecals(env, tx, ty, i, look);
	}
	// damp sand where water meets this tile
	const water = [0, 0, 0, 0];
	const nbs = [
		[0, -1],
		[1, 0],
		[0, 1],
		[-1, 0]
	];
	let any = false;
	for (let s = 0; s < 4; s++) {
		const nx = tx + nbs[s][0];
		const ny = ty + nbs[s][1];
		if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
		if (isPool(layers, ny * size + nx)) {
			water[s] = 1;
			any = true;
		}
	}
	if (any && !isRiver(layers, i)) paintLandShore(tx, ty, [], water);
	if (isRiver(layers, i)) paintRiver(env, tx, ty, i, sparks);
	return sparks;
}

// ------------------------------------------------------------- the diamond

const worldScratch = new Uint32Array(T * T);

// Paints tile (tx, ty) as its diamond into `out` (DIAMOND_W wide, at least
// `tileHeight` rows tall): the top face, then the cliff faces hanging below.
// Returns the shimmer spots as [x, y, phase, length] runs in diamond pixels.
export function paintDiamond(
	env: GroundEnv,
	tx: number,
	ty: number,
	out: Uint32Array,
	world: Uint32Array = worldScratch
): number[] {
	const { layers, levels, season } = env;
	const size = layers.size;
	const i = ty * size + tx;
	const raw = paintTile(env, tx, ty, world);
	toDiamond(world, out);
	const rows = tileHeight(levels, size, tx, ty);
	out.fill(0, DIAMOND_W * DIAMOND_H, DIAMOND_W * rows);
	if (!isPool(layers, i) && env.living.built[i] !== Built.field)
		paintTufts(env, tx, ty, i, landLook(layers, i, season), out);
	paintFaces(env, tx, ty, i, out);

	// shimmer dashes sit on water: check the diamond itself, the water may have
	// been covered by a beach or a bank
	const isWater = (c: number) => c === K.water || c === K.deep || c === K.waterLight;
	const sparks: number[] = [];
	for (let j = 0; j < raw.length; j += 4) {
		const len = raw[j + 3];
		const x = T + raw[j] - raw[j + 1];
		const y = (raw[j] + raw[j + 1]) >> 1;
		if (x + len >= DIAMOND_W) continue;
		if (isWater(out[y * DIAMOND_W + x]) && isWater(out[y * DIAMOND_W + x + len - 1]))
			sparks.push(x, y, raw[j + 2], len);
	}
	return sparks;
}

// The mouth of a river tile's channel on its +x (right) or +y (left) edge, as
// [centre, half width] in world pixels along that edge, or null
function edgeMouth(layers: GroundLayers, tx: number, ty: number, right: boolean) {
	const n = riverChannel(layers, tx, ty, segBuf2);
	for (let s = 0; s < n; s++) {
		const o = s * SEG;
		if (right && segBuf2[o] === 1) return [segBuf2[o + 1] * T, (segBuf2[o + 6] * T) / 2];
		if (!right && segBuf2[o + 1] === 1) return [segBuf2[o] * T, (segBuf2[o + 6] * T) / 2];
	}
	return null;
}

function faceStyle(env: GroundEnv, i: number, wet: boolean): FaceStyle {
	const { layers } = env;
	const biome = layers.biome[i];
	if (biome === Biome.snow) return Face.snow;
	if (biome === Biome.coast || layers.ground[i] === Ground.sand || wet) return Face.sand;
	if (biome === Biome.mountain || layers.ground[i] === Ground.rock) return Face.rock;
	if (layers.ground[i] === Ground.chalk) return Face.rock;
	return Face.earth;
}

// The cliff faces under a tile's two front edges, where the tile in front
// (+x for the right face, +y for the left) is lower.
function paintFaces(env: GroundEnv, tx: number, ty: number, i: number, out: Uint32Array): void {
	const { layers, levels, season } = env;
	const size = layers.size;
	for (let k = 0; k < 2; k++) {
		const right = k === 0;
		const drop = cliffDrop(levels, size, tx, ty, right);
		if (drop === 0) continue;
		const ni = right ? i + 1 : i + size;
		// a low bank beside the water is sand
		const wet = isPool(layers, ni) && drop <= 1;
		const style = faceStyle(env, i, wet);
		const look = isPool(layers, i) ? SAND : landLook(layers, i, season);
		// snow on the lip in winter, otherwise the tile's own grass
		const snowy = season === 3 && (WINTER_SNOW[layers.biome[i]] ?? 0.5) >= 0.45;
		const grassy = style === Face.earth || style === Face.rock;
		let fall: [number, number] | null = null;
		if (isRiver(layers, i) && isOpenWater(layers, ni)) {
			const m = edgeMouth(layers, tx, ty, right);
			if (m) fall = fallColumns(right, m[0], m[1]);
		}
		paintFace(out, right, {
			drop,
			style,
			lipLeft: snowy ? K.white : grassy ? K[look[0]] : undefined,
			lipRight: snowy ? K.ice : grassy ? K[look[1]] : undefined,
			seed: tx * 4099 + ty * 131 + k,
			fall
		});
	}
}

// The cache key for a tile: what the picture depends on besides the fixed
// map and the season (plants, what is built, neighbouring fields, tracks, and
// the cliff faces).
export function tileSig(env: GroundEnv, tx: number, ty: number): number {
	const { layers, living, season, levels } = env;
	const size = layers.size;
	const i = ty * size + tx;
	const f = (dx: number, dy: number) => {
		const nx = tx + dx;
		const ny = ty + dy;
		return nx >= 0 &&
			ny >= 0 &&
			nx < size &&
			ny < size &&
			living.built[ny * size + nx] === Built.field
			? 1
			: 0;
	};
	// fields join their neighbours, and soft edges stop at them
	const mask = f(0, -1) | (f(1, 0) << 1) | (f(0, 1) << 2) | (f(-1, 0) << 3);
	let sig = living.built[i] | (level(living.plants[i], 4) << 4) | (mask << 8) | (season << 12);
	sig |= cliffDrop(levels, size, tx, ty, true) << 16;
	sig |= cliffDrop(levels, size, tx, ty, false) << 20;
	if (isPool(layers, i)) return sig;
	const n = pathsFor(env, tx, ty);
	for (const v of env.villages) {
		if (Math.abs(v.x - tx) <= 1 && Math.abs(v.y - ty) <= 1)
			sig = Math.imul(sig ^ (v.x * 131 + v.y), 16777619);
	}
	for (let k = 0; k < n * 5; k++) sig = Math.imul(sig ^ Math.round(pathBuf[k]), 16777619);
	return sig | 0;
}

// --------------------------------------------------------------------- cache

type Entry = {
	sig: number;
	// rows of the picture: the diamond and its tallest cliff face
	h: number;
	canvas: HTMLCanvasElement | OffscreenCanvas;
	g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	sparks: number[];
};

const cache = new Map<number, Entry>();
let cacheLayers: unknown = null;
const diamond = new Uint32Array(DIAMOND_W * MAX_TILE_H);
const images = new Map<number, ImageData>();
// how long, per frame, we may spend painting new tiles (ms)
const BUDGET_MS = 9;
const MIN_CACHE = 56;

function imageFor(h: number): ImageData {
	let im = images.get(h);
	if (!im) {
		im = new ImageData(new Uint8ClampedArray(diamond.buffer, 0, DIAMOND_W * h * 4), DIAMOND_W, h);
		images.set(h, im);
	}
	return im;
}

function newEntry(key: number, h: number): Entry {
	const canvas: Entry['canvas'] =
		typeof OffscreenCanvas !== 'undefined'
			? new OffscreenCanvas(DIAMOND_W, h)
			: Object.assign(document.createElement('canvas'), { width: DIAMOND_W, height: h });
	const g = canvas.getContext('2d') as CanvasRenderingContext2D;
	const e: Entry = { sig: 0, h, canvas, g, sparks: [] };
	cache.set(key, e);
	return e;
}

// What the draw closures read, filled by collectGround: one slot per tile on
// screen, so nothing is allocated per tile per frame.
const slots: Standing[] = [];
const slotEntry: (Entry | null)[] = [];
const slotX: number[] = [];
const slotY: number[] = [];
const slotColour: string[] = [];
let slotScale = 1;
let slotNow = 0;

// The ground's part in the depth-sorted pass (see Standing in scene.ts): one
// entry per tile on screen, at the depth of its back corner (tx + ty), so it
// is drawn before whatever stands on it and after the tiles behind it. A raised
// tile in front covers what is behind it, as it should. Each tile is its top
// face plus the cliff faces under its front edges, positioned from the
// projection on whole pixels.
export function collectGround(state: DrawState, view: View, out: Standing[]): void {
	if (view.mode !== 'local' || view.detail <= 0.001) return;
	const { layers, camera } = state;
	const size = layers.size;
	if (cacheLayers !== layers) {
		cache.clear();
		cacheLayers = layers;
	}
	const env: GroundEnv = {
		layers,
		living: state.living,
		villages: state.villages,
		season: state.season & 3,
		levels: view.levels
	};
	const scale = view.scale;
	const start = performance.now();
	let built = 0;
	let n = 0;
	slotScale = scale;
	slotNow = state.now;

	for (let ty = view.y0; ty < view.y1; ty++) {
		for (let tx = view.x0; tx < view.x1; tx++) {
			const i = ty * size + tx;
			const h = tileHeight(view.levels, size, tx, ty);
			// the picture's top left: the diamond's top corner is the tile's (x, y)
			// corner, lifted by the tile's level; the diamond is 240 left of that
			const sx = view.originX + ((tx - ty) * T - T) * scale;
			const sy = view.originY + ((tx + ty) * (T / 2) - view.levels[i] * LIFT) * scale;
			if (sx + DIAMOND_W * scale <= 0 || sx >= camera.width) continue;
			if (sy + h * scale <= 0 || sy >= camera.height) continue;

			const sig = tileSig(env, tx, ty);
			let e = cache.get(i);
			if (e) {
				cache.delete(i);
				cache.set(i, e);
			}
			if (!e || e.sig !== sig || e.h !== h) {
				// paint a few new tiles a frame; the rest wait (an older picture, or a
				// flat diamond, stands in)
				if (built === 0 || performance.now() - start <= BUDGET_MS) {
					if (!e) e = newEntry(i, h);
					if (e.h !== h) {
						e.canvas.height = h;
						e.h = h;
					}
					e.sparks = paintDiamond(env, tx, ty, diamond);
					e.g.putImageData(imageFor(h), 0, 0);
					e.sig = sig;
					built++;
				}
			}
			let slot = slots[n];
			if (!slot) {
				const k = n;
				slot = { y: 0, draw: (ctx) => drawTile(ctx, k) };
				slots[n] = slot;
			}
			slot.y = tx + ty;
			slotEntry[n] = e ?? null;
			slotX[n] = sx;
			slotY[n] = sy;
			if (!e)
				slotColour[n] = isPool(layers, i)
					? PALETTE.water
					: PALETTE[landLook(layers, i, env.season)[0]];
			out.push(slot);
			n++;
		}
	}
	// keep the cache from growing without bound, but never below the tiles on screen
	const cap = Math.max(MIN_CACHE, n + 24);
	while (cache.size > cap) {
		const first = cache.keys().next().value;
		if (first === undefined) break;
		cache.delete(first);
	}
}

function drawTile(ctx: CanvasRenderingContext2D, n: number): void {
	const scale = slotScale;
	const x = slotX[n];
	const y = slotY[n];
	const e = slotEntry[n];
	if (!e) {
		// not painted yet: a flat diamond of the tile's colour
		ctx.fillStyle = slotColour[n];
		ctx.beginPath();
		ctx.moveTo(x + T * scale, y);
		ctx.lineTo(x + DIAMOND_W * scale, y + (DIAMOND_H / 2) * scale);
		ctx.lineTo(x + T * scale, y + DIAMOND_H * scale);
		ctx.lineTo(x, y + (DIAMOND_H / 2) * scale);
		ctx.closePath();
		ctx.fill();
		return;
	}
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(
		e.canvas as CanvasImageSource,
		0,
		0,
		DIAMOND_W,
		e.h,
		x,
		y,
		DIAMOND_W * scale,
		e.h * scale
	);
	if (e.sparks.length > 0) shimmer(ctx, e.sparks, x, y, slotNow, scale);
}

// Moving water: a few dashes per water tile, three frames, a third of them
// lit at a time. Cheap, and the baked tiles are never redrawn.
function shimmer(
	c: CanvasRenderingContext2D,
	s: number[],
	x: number,
	y: number,
	now: number,
	scale: number
): void {
	const frame = Math.floor(now / 260) % 3;
	for (let pass = 0; pass < 2; pass++) {
		c.fillStyle = pass === 0 ? PALETTE.foam : PALETTE.waterLight;
		for (let j = 0; j < s.length; j += 4) {
			const phase = (frame + s[j + 2]) % 3;
			if (pass === 0 ? phase !== 0 : phase !== 1) continue;
			const len = pass === 0 ? s[j + 3] : 2;
			c.fillRect(x + s[j] * scale, y + s[j + 1] * scale, len * scale, scale);
		}
	}
}

// ------------------------------------------------------- river geometry

type WaterLayers = Pick<MapLayers, 'size' | 'water' | 'biome'>;

// A river tile is a winding channel 6 to 14 m wide, not a whole square of
// water. Each neighbouring water tile (or diagonal one, when nothing joins on
// the sides) gives an entry point; the channel runs from each to a wobbly
// centre. Entry points and widths come from the shared edge, so neighbouring
// tiles meet exactly. Positions are fractions of the tile.
const SEG = 7; // px, py, bend x, bend y, centre x, centre y, width
const ND = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0]
];
const DIAG = [
	[1, -1],
	[1, 1],
	[-1, 1],
	[-1, -1]
];
const segCheck: number[] = new Array(SEG * 9).fill(0);

function waterish(layers: WaterLayers, x: number, y: number): boolean {
	if (x < 0 || y < 0 || x >= layers.size || y >= layers.size) return false;
	const i = y * layers.size + x;
	return layers.water[i] !== Water.none || layers.biome[i] === Biome.ocean;
}

// lakes and sea: a river mouth widens into them
function bigWater(layers: WaterLayers, x: number, y: number): boolean {
	if (!waterish(layers, x, y)) return false;
	const i = y * layers.size + x;
	return layers.water[i] !== Water.river && layers.water[i] !== Water.spring;
}

function pushSeg(
	out: number[],
	n: number,
	px: number,
	py: number,
	cx: number,
	cy: number,
	w: number,
	tx: number,
	ty: number
): void {
	const o = n * SEG;
	const dx = cx - px;
	const dy = cy - py;
	const len = Math.hypot(dx, dy) || 1;
	const amt = (hash(tx, ty, n + 3, 41) - 0.5) * 0.25;
	out[o] = px;
	out[o + 1] = py;
	out[o + 2] = (px + cx) / 2 - (dy / len) * amt;
	out[o + 3] = (py + cy) / 2 + (dx / len) * amt;
	out[o + 4] = cx;
	out[o + 5] = cy;
	out[o + 6] = w;
}

// Which neighbours this river tile's channel joins: the map's own river links
// (a tile joins only the one it flows into and those flowing into it, so thick
// diagonal rivers don't loop). Layers without heights (small test maps) fall
// back to joining every water neighbour; -1 means that. This is the one place
// to change where connections come from.
function linkCode(layers: WaterLayers, tx: number, ty: number): number {
	if (!('height' in layers)) return -1;
	return riverLinks(layers as MapLayers)[ty * layers.size + tx];
}

// Writes the channel's segments into `out` (SEG numbers each) and returns how many
export function riverChannel(layers: WaterLayers, tx: number, ty: number, out: number[]): number {
	const cx = 0.5 + (hash(tx, ty, 1, 40) - 0.5) * 0.2;
	const cy = 0.5 + (hash(tx, ty, 2, 40) - 0.5) * 0.2;
	let n = 0;
	const code = linkCode(layers, tx, ty);
	for (let d = 0; d < 4; d++) {
		const nx = tx + ND[d][0];
		const ny = ty + ND[d][1];
		if (!(code >= 0 ? code & (N << d) : waterish(layers, nx, ny))) continue;
		// the edge is shared with the neighbour, so key it by its east or south side
		const kx = d === 3 ? tx - 1 : tx;
		const ky = d === 0 ? ty - 1 : ty;
		const kk = d === 1 || d === 3 ? 0 : 1;
		const s = (hash(kx, ky, kk, 43) - 0.5) * 0.3;
		const w = (bigWater(layers, nx, ny) ? 14 : 6 + 6 * hash(kx, ky, kk, 44)) / 40;
		if (d === 0) pushSeg(out, n++, 0.5 + s, 0, cx, cy, w, tx, ty);
		else if (d === 1) pushSeg(out, n++, 1, 0.5 + s, cx, cy, w, tx, ty);
		else if (d === 2) pushSeg(out, n++, 0.5 + s, 1, cx, cy, w, tx, ty);
		else pushSeg(out, n++, 0, 0.5 + s, cx, cy, w, tx, ty);
	}
	for (let c = 0; c < 4; c++) {
		const ddx = DIAG[c][0];
		const ddy = DIAG[c][1];
		if (code >= 0) {
			if (!(code & (NE << c))) continue;
		} else {
			if (!waterish(layers, tx + ddx, ty + ddy)) continue;
			if (waterish(layers, tx + ddx, ty) || waterish(layers, tx, ty + ddy)) continue;
		}
		const wx = tx + (ddx > 0 ? 1 : 0);
		const wy = ty + (ddy > 0 ? 1 : 0);
		pushSeg(
			out,
			n++,
			ddx > 0 ? 1 : 0,
			ddy > 0 ? 1 : 0,
			cx,
			cy,
			(6 + 6 * hash(wx, wy, 2, 44)) / 40,
			tx,
			ty
		);
	}
	if (n === 0) {
		// a lone pool
		const w = (8 + 4 * hash(tx, ty, 5, 44)) / 40;
		pushSeg(out, 0, cx, cy, cx, cy, w, tx, ty);
		n = 1;
	}
	return n;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const l2 = dx * dx + dy * dy;
	let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	const ex = ax + dx * t - px;
	const ey = ay + dy * t - py;
	return ex * ex + ey * ey;
}

// Is the point (lx, ly), in tile fractions, inside the channel of river tile (tx, ty)?
function inChannel(layers: WaterLayers, tx: number, ty: number, lx: number, ly: number): boolean {
	const n = riverChannel(layers, tx, ty, segCheck);
	for (let s = 0; s < n; s++) {
		const o = s * SEG;
		const r = segCheck[o + 6] / 2;
		const r2 = r * r;
		let ax = segCheck[o];
		let ay = segCheck[o + 1];
		for (let k = 1; k <= 4; k++) {
			const u = k / 4;
			const a = (1 - u) * (1 - u);
			const b = 2 * u * (1 - u);
			const c = u * u;
			const qx = a * segCheck[o] + b * segCheck[o + 2] + c * segCheck[o + 4];
			const qy = a * segCheck[o + 1] + b * segCheck[o + 3] + c * segCheck[o + 5];
			if (segDist2(lx, ly, ax, ay, qx, qy) <= r2) return true;
			ax = qx;
			ay = qy;
		}
	}
	return false;
}

// Is this world point (x, y in fractional tiles) water as drawn? Whole tiles
// for lakes and sea, only the channel for rivers.
export function waterAt(layers: WaterLayers, x: number, y: number): boolean {
	const tx = Math.floor(x);
	const ty = Math.floor(y);
	if (tx < 0 || ty < 0 || tx >= layers.size || ty >= layers.size) return false;
	const i = ty * layers.size + tx;
	if (isRiver(layers, i)) return inChannel(layers, tx, ty, x - tx, y - ty);
	return layers.water[i] !== Water.none || layers.biome[i] === Biome.ocean;
}
