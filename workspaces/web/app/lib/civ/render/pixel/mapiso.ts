import { hash } from '../scene';
import { LAND_LEVELS, MAP_LIFT } from './iso';
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
	bottomRow,
	inDiamond,
	tileUV
} from './mapisokit';
import type { SpriteDef } from './sprite';

// The parts of the isometric map that are not terrain textures: the cliff
// faces under raised tiles, shores and rivers drawn on the diamond, and how
// the map is cut into chunks and put back in depth order.

// ------------------------------------------------------------------ cliffs

// What a cliff face is made of (picked from the tile it holds up).
export type FaceMat = 'earth' | 'dry' | 'rock' | 'snow' | 'sand';
export type Side = 'left' | 'right';

// The first row of a cliff face sprite is this many rows below the tile's top
// corner, which is where the lowest the diamond's edge starts.
export const FACE_Y = 8;

export type Cliffs = {
	// levels this tile stands above the +x neighbour (right face) and the +y
	// neighbour (left face); 0 where the neighbour is as high or higher
	right: number;
	left: number;
	// the face is on the map's edge, so it ends in a dark rim
	rimRight: boolean;
	rimLeft: boolean;
};

export const newCliffs = (): Cliffs => ({ right: 0, left: 0, rimRight: false, rimLeft: false });

// Where a tile stands higher than the tile in front of it. Past the map's
// edge the ground is at level 0, so the world reads as a raised block.
export function cliffsAt(
	levels: Uint8Array,
	size: number,
	tx: number,
	ty: number,
	out: Cliffs
): Cliffs {
	const here = levels[ty * size + tx];
	const onEdgeX = tx + 1 >= size;
	const onEdgeY = ty + 1 >= size;
	const front = onEdgeX ? 0 : levels[ty * size + tx + 1];
	const side = onEdgeY ? 0 : levels[(ty + 1) * size + tx];
	out.right = Math.max(0, here - front);
	out.left = Math.max(0, here - side);
	out.rimRight = onEdgeX && out.right > 0;
	out.rimLeft = onEdgeY && out.left > 0;
	return out;
}

// [left face, right face] looks: the left face catches the light
type Skin = {
	lip: string;
	lipRows: number;
	lip2: string;
	base: string;
	fleck: string;
	dark: string;
};
const SKINS: Record<FaceMat, [Skin, Skin]> = {
	earth: [
		{ lip: 'g', lipRows: 1, lip2: 'd', base: 'v', fleck: 'o', dark: 'o' },
		{ lip: 'd', lipRows: 1, lip2: 'u', base: 'o', fleck: 'O', dark: 'O' }
	],
	dry: [
		{ lip: 's', lipRows: 1, lip2: 'm', base: 'v', fleck: 'o', dark: 'o' },
		{ lip: 'm', lipRows: 1, lip2: 'o', base: 'o', fleck: 'O', dark: 'O' }
	],
	rock: [
		{ lip: 'c', lipRows: 1, lip2: 'r', base: 'r', fleck: 'c', dark: 'R' },
		{ lip: 'r', lipRows: 1, lip2: 'R', base: 'R', fleck: 'r', dark: 'k' }
	],
	snow: [
		{ lip: 'w', lipRows: 2, lip2: 'w', base: 'r', fleck: 'c', dark: 'R' },
		{ lip: 'h', lipRows: 2, lip2: 'h', base: 'R', fleck: 'r', dark: 'k' }
	],
	sand: [
		{ lip: 'T', lipRows: 1, lip2: 'T', base: 'T', fleck: 'S', dark: 'S' },
		{ lip: 'S', lipRows: 1, lip2: 'S', base: 'S', fleck: 's', dark: 's' }
	]
};

// where a waterfall sits on a face: not at all, in the middle of the edge it
// pours over, or around the diamond's bottom corner where the faces meet
export type Fall = 0 | 1 | 2;

const faceCache = new Map<string, SpriteDef>();

// A cliff face: 16 wide, `delta` levels tall, to go at x = 0 (left face) or
// x = 16 (right face), y = FACE_Y of the tile's sprite. Its top follows the
// stair edge of the diamond so it hangs from it with no gap.
export function faceSprite(
	mat: FaceMat,
	side: Side,
	delta: number,
	variant: number,
	rim: boolean,
	fall: Fall
): SpriteDef {
	const id = `${mat}|${side}|${delta}|${variant}|${rim ? 1 : 0}|${fall}`;
	const hit = faceCache.get(id);
	if (hit) return hit;
	const h = delta * MAP_LIFT;
	const skin = SKINS[mat][side === 'left' ? 0 : 1];
	const salt = variant * 13 + (side === 'left' ? 3 : 5);
	const rows = Array.from({ length: h + FACE_Y }, () => Array<string>(16).fill('.'));
	const starts: number[] = [];
	for (let c = 0; c < 16; c++) {
		const x = side === 'left' ? c : 16 + c;
		const start = bottomRow(x) + 1 - FACE_Y;
		starts.push(start);
		for (let t = 0; t < h; t++) {
			const k = hash(c, t, salt);
			let ch: string;
			if (t < skin.lipRows) ch = skin.lip;
			// the grass hangs over the edge in places
			else if (t === skin.lipRows && hash(c, 1, salt + 1) < 0.45) ch = skin.lip2;
			else if (k < 0.12) ch = skin.fleck;
			// darker layers of the earth
			else if (t % 4 === 3 && k < 0.5) ch = skin.dark;
			else ch = skin.base;
			rows[start + t][c] = ch;
		}
		if (rim) rows[start + h - 1][c] = 'k';
	}
	if (fall) {
		const centre = fall === 1 ? 8 : side === 'left' ? 16 : 0;
		for (let j = 0; j < 4; j++) {
			const c = centre - 2 + j;
			if (c < 0 || c > 15) continue;
			for (let t = 0; t < h; t++) {
				const edge = j === 0 || j === 3;
				rows[starts[c] + t][c] = edge ? 'a' : (t + j) % 3 === 0 ? 'w' : 'e';
			}
			// the splash where it lands
			rows[starts[c] + h - 1][c] = 'f';
			if (starts[c] + h < rows.length) rows[starts[c] + h][c] = 'f';
		}
	}
	const made: SpriteDef = { rows: rows.map((r) => r.join('')), key: KEY };
	faceCache.set(id, made);
	return made;
}

// Which waterfall a river tile needs on a face, from its channel code (the
// E and S arms leave over the right and left faces, SE over the corner).
export function fallOf(code: number, side: Side): Fall {
	const arm = side === 'right' ? E : S;
	if (code & arm) return 1;
	if (code & SE) return 2;
	return 0;
}

// ------------------------------------------------------------------ shores

// A corner only matters when both sides next to it are water, so the mask is
// cleaned up to keep the set of different overlays small.
export function normalizeShore(mask: number): number {
	let m = mask;
	if (m & (N | E)) m &= ~NE;
	if (m & (S | E)) m &= ~SE;
	if (m & (S | W)) m &= ~SW;
	if (m & (N | W)) m &= ~NW;
	return m;
}

// how far from the land's edge (as a fraction of the tile) each band reaches
const BANK = 0.07;
const FOAM = 0.15;
const RING = 0.23;

const EDGE_DIST: [number, (u: number, v: number) => number][] = [
	[N, (u, v) => v],
	[E, (u) => 1 - u],
	[S, (_u, v) => 1 - v],
	[W, (u) => u],
	[NE, (u, v) => Math.max(1 - u, v)],
	[SE, (u, v) => Math.max(1 - u, 1 - v)],
	[SW, (u, v) => Math.max(u, 1 - v)],
	[NW, (u, v) => Math.max(u, v)]
];

const shoreCache = new Map<number, SpriteDef | null>();

// The shoreline for a water tile with these land neighbours: a sand bank, a
// line of foam and a ring of lighter water along each diamond edge that meets
// land, and round the corner of a land tile that only touches it diagonally.
// `rocky` marks the neighbours that are high ground, whose foot is stone.
export function shoreOverlay(mask: number, rocky = 0): SpriteDef | null {
	const m = normalizeShore(mask);
	if (m === 0) return null;
	const id = m | ((rocky & m) << 8);
	const hit = shoreCache.get(id);
	if (hit !== undefined) return hit;
	const rows: string[] = [];
	for (let y = 0; y < TILE_H; y++) {
		let line = '';
		for (let x = 0; x < TILE_W; x++) {
			if (!inDiamond(x, y)) {
				line += '.';
				continue;
			}
			const { u, v } = tileUV(x, y);
			let d = Infinity;
			let bit = 0;
			for (const [b, dist] of EDGE_DIST) {
				if (!(m & b)) continue;
				const here = dist(u, v);
				if (here < d) {
					d = here;
					bit = b;
				}
			}
			if (d < BANK) line += rocky & bit ? 'r' : 'S';
			else if (d < FOAM) line += 'f';
			else if (d < RING && (x + 2 * y) % 5 !== 0) line += 'z';
			else line += '.';
		}
		rows.push(line);
	}
	const made: SpriteDef = { rows, key: KEY };
	shoreCache.set(id, made);
	return made;
}

// ------------------------------------------------------------------ rivers

// where each arm of a channel code ends, as (u, v) on the tile: the middles
// of the four edges and the four corners
export const RIVER_ENDS: [number, number, number][] = [
	[N, 0.5, 0],
	[E, 1, 0.5],
	[S, 0.5, 1],
	[W, 0, 0.5],
	[NE, 1, 0],
	[SE, 1, 1],
	[SW, 0, 1],
	[NW, 0, 0]
];

const HALF = 0.11;
const RIM = 0.05;
const BED = 0.075;

const riverCache = new Map<number, SpriteDef>();

// A river tile's channel as a 32 x 16 overlay, from a code (see `riverLinks`):
// arms run from the middle to the edge middles and corners, and arms that open
// into a lake or the sea flare out. Cached by code.
export function riverOverlay(code: number): SpriteDef {
	const arms = code & 15;
	const diag = code & 240;
	const flare = (code >> 8) & arms;
	const id = arms | diag | (flare << 8);
	const hit = riverCache.get(id);
	if (hit) return hit;

	const segments = RIVER_ENDS.filter(([bit]) => (arms | diag) & bit);
	const rows: string[] = [];
	for (let y = 0; y < TILE_H; y++) {
		let line = '';
		for (let x = 0; x < TILE_W; x++) {
			if (!inDiamond(x, y)) {
				line += '.';
				continue;
			}
			const { u, v } = tileUV(x, y);
			// how far outside the water the pixel is (negative inside)
			let e = segments.length === 0 ? Math.hypot(u - 0.5, v - 0.5) - HALF * 1.5 : Infinity;
			for (const [bit, eu, ev] of segments) {
				const dx = eu - 0.5;
				const dy = ev - 0.5;
				const len2 = dx * dx + dy * dy;
				const t = Math.min(1, Math.max(0, ((u - 0.5) * dx + (v - 0.5) * dy) / len2));
				const dist = Math.hypot(u - 0.5 - dx * t, v - 0.5 - dy * t);
				const half = HALF * (flare & bit ? 1 + 0.9 * t * t : 1);
				e = Math.min(e, dist - half);
			}
			if (e < 0) line += e > -RIM ? 'a' : (x * 3 + y * 5) % 7 === 0 ? 'f' : 'e';
			else if (e < BED) line += 'S';
			else line += '.';
		}
		rows.push(line);
	}
	const made: SpriteDef = { rows, key: KEY };
	riverCache.set(id, made);
	return made;
}

// ------------------------------------------------------------------ chunks

// The map is drawn in chunks of CHUNK_TILES x CHUNK_TILES tiles. A chunk is a
// diamond of tiles on screen, drawn into a canvas that fits its bounding box:
// tile (i, j) of the chunk has its sprite's top-left at
//   x = (i - j) * 16 + CHUNK_TILES * 16 - 16
//   y = CHUNK_TOP + (i + j) * 8 - level * MAP_LIFT
// Above that is room for the highest land and the tallest sprite; below it
// nothing, since cliffs only fall as far as the level-0 diamond.

export const CHUNK_TILES = 16;
export const CHUNK_W = CHUNK_TILES * TILE_W;
export const CHUNK_TOP = LAND_LEVELS * MAP_LIFT + RISE;
export const CHUNK_H = CHUNK_TOP + CHUNK_TILES * TILE_H;

export const tileSpotX = (i: number, j: number): number => (i - j) * 16 + CHUNK_TILES * 16 - 16;
export const tileSpotY = (i: number, j: number, level: number): number =>
	CHUNK_TOP + (i + j) * (TILE_H / 2) - level * MAP_LIFT;

// The art-pixel position of a chunk canvas's top-left corner, from the screen
// position of world (0, 0).
export function chunkArt(cx: number, cy: number): { x: number; y: number } {
	const x0 = cx * CHUNK_TILES;
	const y0 = cy * CHUNK_TILES;
	return {
		x: (x0 - y0) * (TILE_W / 2) - CHUNK_TILES * 16,
		y: (x0 + y0) * (TILE_H / 2) - CHUNK_TOP
	};
}

// Chunks back to front: nearer chunks (greater cx + cy) cover farther ones,
// and neighbours at the same depth never overlap.
export function chunkOrder(cx0: number, cy0: number, cx1: number, cy1: number): [number, number][] {
	const list: [number, number][] = [];
	for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) list.push([cx, cy]);
	return list.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
}

// The tiles of a chunk back to front: by depth (i + j), then by x.
export const TILE_ORDER: [number, number][] = (() => {
	const list: [number, number][] = [];
	for (let s = 0; s <= 2 * CHUNK_TILES - 2; s++) {
		for (let i = Math.max(0, s - (CHUNK_TILES - 1)); i <= Math.min(CHUNK_TILES - 1, s); i++) {
			list.push([i, s - i]);
		}
	}
	return list;
})();
