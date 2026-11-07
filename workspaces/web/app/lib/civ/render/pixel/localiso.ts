import { hash } from '../scene';
import { LOCAL_LIFT } from './iso';
import { PALETTE, type ColorName } from './palette';
import { LOCAL_TILE_PX } from './scale';

// The geometry of a close-up ground tile in the isometric view, kept apart
// from the painting so it can be tested without a canvas.
//
// A tile is painted top-down on a 240 x 240 grid of "world pixels" (6 to the
// metre). The iso projection sends world pixel (x, y) to the diamond pixel
//   sx = 240 + x - y,  sy = floor((x + y) / 2)
// which is the same 2:1 projection the rest of the view uses, and (because
// 240 is even) a one-to-one match: every pixel of the 480 x 240 diamond comes
// from exactly one world pixel and none is used twice. So the top-down art
// turns into the diamond without gaps, doubled pixels or blur, and lines
// along the x and y axes come out as clean 2-across-1-down stairs.

export const TILE = LOCAL_TILE_PX; // world pixels along a tile side
export const DIAMOND_W = TILE * 2;
export const DIAMOND_H = TILE;
// art pixels a level lifts the ground, and the most levels a cliff can drop
export const LIFT = LOCAL_LIFT;
export const MAX_DROP = 8;
// the tallest picture of a tile: the diamond plus its tallest cliff face
export const MAX_TILE_H = DIAMOND_H + MAX_DROP * LIFT;

// colours packed for a Uint32Array over RGBA bytes (little-endian: ABGR)
export const K = {} as Record<ColorName, number>;
for (const name of Object.keys(PALETTE) as ColorName[]) {
	const h = PALETTE[name];
	const r = parseInt(h.slice(1, 3), 16);
	const g = parseInt(h.slice(3, 5), 16);
	const b = parseInt(h.slice(5, 7), 16);
	K[name] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// ------------------------------------------------------------------ diamond

let sourceMap: Int32Array | null = null;
let bottoms: Int16Array | null = null;

function build(): Int32Array {
	if (sourceMap) return sourceMap;
	const map = new Int32Array(DIAMOND_W * DIAMOND_H).fill(-1);
	const bottom = new Int16Array(DIAMOND_W).fill(-1);
	for (let sy = 0; sy < DIAMOND_H; sy++) {
		for (let sx = 0; sx < DIAMOND_W; sx++) {
			const d = sx - TILE;
			// the two world pixels of this row have x + y = 2 * sy or 2 * sy + 1; only
			// the one with the same parity as x - y exists
			const s = 2 * sy + (d & 1);
			const x = (s + d) / 2;
			const y = (s - d) / 2;
			if (x < 0 || y < 0 || x >= TILE || y >= TILE) continue;
			map[sy * DIAMOND_W + sx] = y * TILE + x;
			bottom[sx] = sy;
		}
	}
	bottoms = bottom;
	sourceMap = map;
	return map;
}

// The world pixel index (y * 240 + x) a diamond pixel is painted from, or -1
// outside the diamond.
export function diamondSource(sx: number, sy: number): number {
	if (sx < 0 || sy < 0 || sx >= DIAMOND_W || sy >= DIAMOND_H) return -1;
	return build()[sy * DIAMOND_W + sx];
}

// The diamond pixel of a world pixel (tile coordinates, 0..239)
export function worldToDiamond(x: number, y: number, out: number[] = [0, 0]): number[] {
	out[0] = TILE + x - y;
	out[1] = (x + y) >> 1;
	return out;
}

// The lowest diamond pixel of a column (where a cliff face hangs from), or -1
export function diamondBottom(sx: number): number {
	build();
	return bottoms![sx] ?? -1;
}

// Turns a top-down tile into its diamond. `dst` is DIAMOND_W wide; rows
// below the diamond (cliff faces) are left to the caller.
export function toDiamond(src: Uint32Array, dst: Uint32Array): void {
	const map = build();
	const n = DIAMOND_W * DIAMOND_H;
	for (let p = 0; p < n; p++) {
		const m = map[p];
		dst[p] = m < 0 ? 0 : src[m];
	}
}

// ------------------------------------------------------------------ cliffs

// How many levels lower the tile in front is: right (+x) or left (+y) face.
// Off the map's edge there is no face, and no face where it is level or higher.
export function cliffDrop(
	levels: ArrayLike<number>,
	size: number,
	tx: number,
	ty: number,
	right: boolean
): number {
	const nx = right ? tx + 1 : tx;
	const ny = right ? ty : ty + 1;
	if (nx >= size || ny >= size) return 0;
	const d = levels[ty * size + tx] - levels[ny * size + nx];
	return d > 0 ? Math.min(MAX_DROP, d) : 0;
}

// How tall the picture of a tile is, in art pixels: the diamond and its
// tallest face
export function tileHeight(levels: ArrayLike<number>, size: number, tx: number, ty: number) {
	const drop = Math.max(
		cliffDrop(levels, size, tx, ty, true),
		cliffDrop(levels, size, tx, ty, false)
	);
	return DIAMOND_H + drop * LIFT;
}

export const Face = { earth: 0, rock: 1, sand: 2, snow: 3 } as const;
export type FaceStyle = (typeof Face)[keyof typeof Face];

// [left (lighter) bands, right (darker) bands, left lip, right lip, speckle dark, speckle light]
type FaceLook = readonly [
	ColorName[],
	ColorName[],
	ColorName,
	ColorName,
	[ColorName, ColorName],
	[ColorName, ColorName]
];
const FACE_LOOK: Record<number, FaceLook> = {
	[Face.earth]: [
		['soilLight', 'soil', 'soilLight'],
		['soil', 'soilDark', 'soil'],
		'grass',
		'leaf',
		['soil', 'soilDark'],
		['sand', 'soilLight']
	],
	[Face.rock]: [
		['stoneLight', 'stone', 'stoneLight'],
		['stone', 'stoneDark', 'stone'],
		'moss',
		'grass',
		['stone', 'stoneDark'],
		['chalk', 'stoneLight']
	],
	[Face.sand]: [
		['sandLight', 'sand', 'sandLight'],
		['sand', 'straw', 'sand'],
		'sandLight',
		'sand',
		['sand', 'straw'],
		['white', 'sandLight']
	],
	[Face.snow]: [
		['stoneLight', 'stone', 'stoneLight'],
		['stone', 'stoneDark', 'stone'],
		'white',
		'ice',
		['stone', 'stoneDark'],
		['white', 'ice']
	]
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export type FaceOptions = {
	// levels the face drops
	drop: number;
	style: FaceStyle;
	// the lip's own colours when they should follow the tile's grass, or -1
	lipLeft?: number;
	lipRight?: number;
	seed: number;
	// diamond columns a river pours over the edge, or null
	fall: [number, number] | null;
};

// Paints a cliff face into the rows below the diamond. The right face hangs
// below the lower right edge (columns 240..479) and the left face below the
// lower left (1..239). Layers of earth or rock with a grass lip on top; the
// left face is lighter than the right, light coming from the top left. The
// face is `drop * LIFT` rows tall under each column's lowest diamond pixel.
export function paintFace(dst: Uint32Array, right: boolean, o: FaceOptions): void {
	if (o.drop <= 0) return;
	build();
	const look = FACE_LOOK[o.style];
	const bands = (right ? look[1] : look[0]).map((c) => K[c]);
	const lip = right ? (o.lipRight ?? K[look[3]]) : (o.lipLeft ?? K[look[2]]);
	const [dark0, dark1] = look[4];
	const [lite0, lite1] = look[5];
	const dark = K[right ? dark1 : dark0];
	const lite = K[right ? lite1 : lite0];
	const total = o.drop * LIFT;
	const x0 = right ? TILE : 1;
	const x1 = right ? DIAMOND_W - 1 : TILE - 1;
	const lipBase = o.style === Face.sand ? 1 : 2;
	for (let sx = x0; sx <= x1; sx++) {
		const top = bottoms![sx];
		if (top < 0) continue;
		const lipLen = lipBase + (hash(o.seed, sx >> 1, 1) < 0.5 ? 1 : 0);
		const fall = o.fall && sx >= o.fall[0] && sx <= o.fall[1];
		for (let k = 0; k < total; k++) {
			const p = (top + 1 + k) * DIAMOND_W + sx;
			if (fall) {
				dst[p] = fallColour(sx, k, total, right, o.seed);
				continue;
			}
			if (k < lipLen) {
				dst[p] = lip;
				continue;
			}
			const j = k - lipLen;
			let band = Math.floor(j / 7) % bands.length;
			// a ragged join between bands
			if (j % 7 === 0 && j > 0 && bay(sx, k) < 0.5) band = (band + bands.length - 1) % bands.length;
			let c = bands[band];
			const h = hash(o.seed, sx, k, 2);
			if (h < 0.05) c = dark;
			else if (h > 0.97) c = lite;
			// a darker foot where the face meets the ground below
			if (k === total - 1) c = dark;
			dst[p] = c;
		}
	}
}

// Water pouring over a step: pale streaks falling, foam where it lands
function fallColour(sx: number, k: number, total: number, right: boolean, seed: number): number {
	if (k === 0) return K.waterLight;
	if (k >= total - 2) return bay(sx, k) < 0.6 ? K.foam : K.waterLight;
	const streak = (sx + hash(seed, sx, 4) * 3 + (k >> 3)) % 4 < 1;
	if (right) return streak ? K.water : K.deep;
	return streak ? K.waterLight : K.water;
}

// The diamond columns a river mouth at the +x edge (right) or +y edge
// (left) covers: `at` is the mouth's centre along the edge and `half` its
// half width, both in world pixels.
export function fallColumns(right: boolean, at: number, half: number): [number, number] {
	// along the +x edge world pixel (239, y) lands in column 479 - y; along
	// the +y edge pixel (x, 239) lands in column 1 + x
	const c = right ? DIAMOND_W - 1 - at : 1 + at;
	return [Math.round(c - half), Math.round(c + half)];
}
