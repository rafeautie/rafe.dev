import { describe, expect, it } from 'vitest';
import { LAND_LEVELS, MAP_LIFT } from './iso';
import {
	CHUNK_H,
	CHUNK_TILES,
	CHUNK_TOP,
	CHUNK_W,
	FACE_Y,
	TILE_ORDER,
	chunkArt,
	chunkOrder,
	cliffsAt,
	faceSprite,
	fallOf,
	newCliffs,
	tileSpotX,
	tileSpotY,
	type FaceMat
} from './mapiso';
import { E, N, S, SE, STAND_H, RISE, TILE_H, TILE_W, bottomRow, inDiamond } from './mapisokit';
import { pixels } from './sprite';

describe('diamond', () => {
	it('is a 2:1 pixel stair that tiles with its neighbours', () => {
		const width = (y: number) => [...Array(TILE_W).keys()].filter((x) => inDiamond(x, y)).length;
		expect([0, 1, 7, 8, 15].map(width)).toEqual([2, 6, 30, 30, 2]);
		// a neighbour at (+16, +8) starts exactly where this one ends
		for (let y = 8; y < TILE_H; y++) {
			for (let x = 0; x < TILE_W; x++) {
				expect(inDiamond(x, y) && inDiamond(x - 16, y - 8)).toBe(false);
			}
		}
		for (let x = 0; x < TILE_W; x++) {
			const bottom = bottomRow(x);
			expect(inDiamond(x, bottom) || bottom === 7).toBe(true);
			expect(inDiamond(x, bottom + 1)).toBe(false);
		}
	});
});

function levelsOfGrid(size: number, fill: (x: number, y: number) => number): Uint8Array {
	const out = new Uint8Array(size * size);
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] = fill(x, y);
	return out;
}

describe('cliff faces', () => {
	it('appear exactly where the neighbour in front is lower', () => {
		const size = 5;
		const levels = levelsOfGrid(size, (x, y) => (x === 2 && y === 2 ? 3 : 1));
		const c = newCliffs();
		// the tall tile stands 2 levels above both tiles in front of it
		cliffsAt(levels, size, 2, 2, c);
		expect([c.right, c.left]).toEqual([2, 2]);
		// the tiles behind it are lower than it, but it is not in front of them
		cliffsAt(levels, size, 1, 2, c);
		expect([c.right, c.left]).toEqual([0, 0]);
		cliffsAt(levels, size, 2, 1, c);
		expect([c.right, c.left]).toEqual([0, 0]);
		// flat ground has none
		cliffsAt(levels, size, 3, 3, c);
		expect([c.right, c.left]).toEqual([0, 0]);
		// only the side facing the lower tile
		const slope = levelsOfGrid(size, (x) => 4 - x);
		cliffsAt(slope, size, 1, 2, c);
		expect([c.right, c.left]).toEqual([1, 0]);
	});

	it('run down to level 0 on the map edge, with a rim', () => {
		const size = 3;
		const levels = levelsOfGrid(size, () => 2);
		const c = newCliffs();
		cliffsAt(levels, size, 2, 1, c);
		expect([c.right, c.left, c.rimRight, c.rimLeft]).toEqual([2, 0, true, false]);
		cliffsAt(levels, size, 1, 2, c);
		expect([c.right, c.left, c.rimRight, c.rimLeft]).toEqual([0, 2, false, true]);
		cliffsAt(levels, size, 2, 2, c);
		expect([c.right, c.left]).toEqual([2, 2]);
		// water at the edge needs no face
		cliffsAt(
			levelsOfGrid(size, () => 0),
			size,
			2,
			2,
			c
		);
		expect([c.right, c.left]).toEqual([0, 0]);
	});

	it('hang from the diamond edge and are as tall as the drop', () => {
		for (const mat of ['earth', 'dry', 'rock', 'snow', 'sand'] as FaceMat[]) {
			for (const side of ['left', 'right'] as const) {
				for (const delta of [1, LAND_LEVELS]) {
					const def = faceSprite(mat, side, delta, 0, false, 0);
					expect(def.rows.length).toBe(delta * MAP_LIFT + FACE_Y);
					expect(() => pixels(def)).not.toThrow();
					for (let c = 0; c < 16; c++) {
						const x = side === 'left' ? c : 16 + c;
						const first = bottomRow(x) + 1 - FACE_Y;
						const col = def.rows.map((r) => r[c]);
						expect(col.filter((ch) => ch !== '.').length).toBe(delta * MAP_LIFT);
						expect(col[first]).not.toBe('.');
						if (first > 0) expect(col[first - 1]).toBe('.');
					}
				}
			}
		}
	});

	it('light the left face and darken the right', () => {
		const left = faceSprite('earth', 'left', 2, 0, false, 0).rows.join('');
		const right = faceSprite('earth', 'right', 2, 0, false, 0).rows.join('');
		expect(left).toContain('v');
		expect(right).not.toContain('v');
		expect(right).toContain('O');
	});

	it('pour a waterfall only where asked, and end in a rim at the map edge', () => {
		expect(faceSprite('earth', 'right', 2, 0, false, 0).rows.join('')).not.toContain('e');
		expect(faceSprite('earth', 'right', 2, 0, false, 1).rows.join('')).toContain('e');
		expect(faceSprite('rock', 'left', 2, 0, true, 0).rows.join('')).toContain('k');
		expect(fallOf(E, 'right')).toBe(1);
		expect(fallOf(S, 'right')).toBe(0);
		expect(fallOf(S, 'left')).toBe(1);
		expect(fallOf(SE, 'left')).toBe(2);
		expect(fallOf(N, 'left')).toBe(0);
	});
});

describe('chunk layout', () => {
	it('puts chunks back to front, nearer ones last', () => {
		const order = chunkOrder(0, 0, 2, 2);
		expect(order.length).toBe(9);
		for (let k = 1; k < order.length; k++) {
			const [ax, ay] = order[k - 1];
			const [bx, by] = order[k];
			expect(ax + ay <= bx + by).toBe(true);
			if (ax + ay === bx + by) expect(ax < bx).toBe(true);
		}
		expect(order[0]).toEqual([0, 0]);
		expect(order[8]).toEqual([2, 2]);
	});

	it('draws a chunk’s tiles by depth, then by x', () => {
		expect(TILE_ORDER.length).toBe(CHUNK_TILES * CHUNK_TILES);
		for (let k = 1; k < TILE_ORDER.length; k++) {
			const [ai, aj] = TILE_ORDER[k - 1];
			const [bi, bj] = TILE_ORDER[k];
			expect(ai + aj <= bi + bj).toBe(true);
			if (ai + aj === bi + bj) expect(ai < bi).toBe(true);
		}
	});

	it('draws tiles that overlap on screen nearest last, across chunks too', () => {
		// anything within one diagonal column of a tile and nearer is never in an earlier chunk
		const n = CHUNK_TILES;
		for (let x = 0; x < 3 * n; x += 5) {
			for (let y = 0; y < 3 * n; y += 5) {
				for (const [a, b] of [
					[0, 1],
					[1, 1],
					[2, 3],
					[5, 6],
					[1, 0]
				]) {
					const cx = (v: number) => Math.floor(v / n);
					const first = [cx(x), cx(y)];
					const next = [cx(x + a), cx(y + b)];
					const sum = (c: number[]) => c[0] + c[1];
					expect(sum(next)).toBeGreaterThanOrEqual(sum(first));
				}
			}
		}
	});

	it('fits a whole chunk of the highest land and tallest sprites in its canvas', () => {
		expect(CHUNK_W).toBe(CHUNK_TILES * 32);
		expect(CHUNK_TOP).toBe(LAND_LEVELS * MAP_LIFT + RISE);
		let top = Infinity;
		let bottom = -Infinity;
		let left = Infinity;
		let right = -Infinity;
		for (const [i, j] of TILE_ORDER) {
			const x = tileSpotX(i, j);
			const hi = tileSpotY(i, j, LAND_LEVELS) - RISE;
			const lo = tileSpotY(i, j, 0) + TILE_H;
			top = Math.min(top, hi);
			bottom = Math.max(bottom, lo);
			left = Math.min(left, x);
			right = Math.max(right, x + TILE_W);
		}
		expect([left, right, top, bottom]).toEqual([0, CHUNK_W, 0, CHUNK_H]);
		expect(STAND_H).toBe(RISE + TILE_H);
	});

	it('lines up neighbouring chunks on the same pixel grid', () => {
		// the tile just past a chunk's edge is where the next chunk's first tile is
		const a = chunkArt(0, 0);
		const b = chunkArt(1, 0);
		expect(a.x + tileSpotX(CHUNK_TILES, 0)).toBe(b.x + tileSpotX(0, 0));
		expect(a.y + tileSpotY(CHUNK_TILES, 0, 2)).toBe(b.y + tileSpotY(0, 0, 2));
		// moving one tile in x moves the picture 16 right and 8 down
		expect(b.x - a.x).toBe(CHUNK_TILES * 16);
		expect(b.y - a.y).toBe(CHUNK_TILES * 8);
	});
});
