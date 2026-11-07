import { hash } from '../scene';
import type { SpriteDef } from './sprite';

// The shared ground rules of the isometric map art: the 32 x 16 diamond, the
// letters every map sprite is written in (and how seasons recolour them), and
// small helpers for painting sprites on a grid of characters.
//
// A tile's top face is the diamond whose pixels are the ones whose centre lies
// inside it. That makes the classic 2-across-1-down stair, 2 pixels wide on
// the top row and 30 on the middle ones, and it tiles exactly: a neighbour at
// (+16, +8) starts where this one ends, with no gap and no overlap.

export const TILE_W = 32;
export const TILE_H = 16;
// how far above a tile's top corner a standing sprite (trees, peaks, huts)
// may reach
export const RISE = 20;
// a standing sprite is 32 wide and reaches RISE rows above the diamond
export const STAND_H = RISE + TILE_H;

// ----------------------------------------------------------------- geometry

export function inDiamond(x: number, y: number): boolean {
	if (x < 0 || y < 0 || x >= TILE_W || y >= TILE_H) return false;
	return Math.abs(x - 15.5) + 2 * Math.abs(y - 7.5) <= 16;
}

// The last row of the top face in a pixel column. A cliff face hangs from the
// row below it, so the stair edge of the diamond is also the top of the cliff.
export function bottomRow(x: number): number {
	const c = x < 16 ? x : 31 - x;
	return 7 + ((c + 1) >> 1);
}

export const topRow = (x: number): number => 15 - bottomRow(x);

// A pixel's place on the tile as fractions (u along +x, v along +y), both 0..1
// inside the diamond. u = 0 is the west edge, v = 0 the north edge.
export function tileUV(x: number, y: number): { u: number; v: number } {
	const sx = (x + 0.5 - 16) / 16;
	const sy = (y + 0.5) / 8;
	return { u: (sy + sx) / 2, v: (sy - sx) / 2 };
}

// ----------------------------------------------------------------- neighbours

// Land flags of the 8 neighbours, as bits. N is the tile at y - 1 (the
// diamond's top-right edge), E is x + 1 (bottom-right), S is y + 1
// (bottom-left), W is x - 1 (top-left). The diagonals touch a corner.
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const NE = 16;
export const SE = 32;
export const SW = 64;
export const NW = 128;

// ----------------------------------------------------------------- colours

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

// ----------------------------------------------------------------- grids

export type Grid = string[][];

export const blank = (w: number, h: number, ch = '.'): Grid =>
	Array.from({ length: h }, () => Array<string>(w).fill(ch));

// The top face filled with `ch`, `.` outside the diamond.
export function topGrid(ch: string): Grid {
	const g = blank(TILE_W, TILE_H);
	for (let y = 0; y < TILE_H; y++) {
		for (let x = 0; x < TILE_W; x++) if (inDiamond(x, y)) g[y][x] = ch;
	}
	return g;
}

// A grid for things that stand on the tile. Rows are written in tile rows, so
// y = 0 is the diamond's top corner and negative rows reach above it.
export const standGrid = (): Grid => blank(TILE_W, STAND_H);

export const def = (g: Grid): SpriteDef => ({ rows: g.map((r) => r.join('')), key: KEY });

// Puts a small picture on the grid at (x, y); `.` leaves what is there. On a
// top face (`inside`) pixels outside the diamond are skipped.
export function stamp(g: Grid, rows: string[], x: number, y: number, inside = false): void {
	for (let j = 0; j < rows.length; j++) {
		const gy = y + j;
		if (gy < 0 || gy >= g.length) continue;
		for (let i = 0; i < rows[j].length; i++) {
			const ch = rows[j][i];
			const gx = x + i;
			if (ch === '.' || gx < 0 || gx >= g[gy].length) continue;
			if (inside && g[gy][gx] === '.') continue;
			g[gy][gx] = ch;
		}
	}
}

// Stamps onto a standing grid at tile coordinates.
export const standStamp = (g: Grid, rows: string[], x: number, y: number): void =>
	stamp(g, rows, x, y + RISE);

// Puts `n` pixels of `ch` on random spots of the diamond.
export function scatterIn(g: Grid, ch: string, n: number, seed: number): void {
	let placed = 0;
	for (let k = 0; placed < n && k < n * 6; k++) {
		const x = Math.floor(hash(seed, k, 1) * TILE_W);
		const y = Math.floor(hash(seed, k, 2) * TILE_H);
		if (g[y][x] === '.') continue;
		g[y][x] = ch;
		placed++;
	}
}

// two-pixel-wide ticks (waves, ripples)
export function ticksIn(g: Grid, ch: string, n: number, seed: number): void {
	let placed = 0;
	for (let k = 0; placed < n && k < n * 6; k++) {
		const x = Math.floor(hash(seed, k, 3) * (TILE_W - 1));
		const y = Math.floor(hash(seed, k, 4) * TILE_H);
		if (g[y][x] === '.' || g[y][x + 1] === '.') continue;
		g[y][x] = ch;
		g[y][x + 1] = ch;
		placed++;
	}
}

// grass blades: a light pixel over a dark one
export function tuftsIn(g: Grid, n: number, seed: number): void {
	let placed = 0;
	for (let k = 0; placed < n && k < n * 6; k++) {
		const x = Math.floor(hash(seed, k, 5) * TILE_W);
		const y = Math.floor(hash(seed, k, 6) * (TILE_H - 1));
		if (g[y][x] === '.' || g[y + 1][x] === '.') continue;
		g[y][x] = 'l';
		g[y + 1][x] = 'd';
		placed++;
	}
}

export const flipH = (rows: string[]): string[] => rows.map((r) => [...r].reverse().join(''));
export const remap = (rows: string[], to: Record<string, string>): string[] =>
	rows.map((r) => [...r].map((ch) => to[ch] ?? ch).join(''));
