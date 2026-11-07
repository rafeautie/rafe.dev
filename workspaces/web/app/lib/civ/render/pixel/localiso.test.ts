import { describe, expect, it } from 'vitest';
import { isoOffset } from './iso';
import {
	DIAMOND_H,
	DIAMOND_W,
	Face,
	K,
	LIFT,
	TILE,
	cliffDrop,
	diamondBottom,
	diamondSource,
	fallColumns,
	paintFace,
	tileHeight,
	toDiamond,
	worldToDiamond
} from './localiso';

describe('the tile diamond', () => {
	it('uses every world pixel exactly once', () => {
		const seen = new Uint8Array(TILE * TILE);
		let inside = 0;
		for (let sy = 0; sy < DIAMOND_H; sy++) {
			for (let sx = 0; sx < DIAMOND_W; sx++) {
				const m = diamondSource(sx, sy);
				if (m < 0) continue;
				inside++;
				seen[m]++;
			}
		}
		// a 2:1 diamond has half the pixels of its bounding box, as many as the square
		expect(inside).toBe(TILE * TILE);
		expect(seen.every((n) => n === 1)).toBe(true);
	});

	it('inverse-maps each diamond pixel to the world pixel that projects onto it', () => {
		const at = [0, 0];
		for (const [x, y] of [
			[0, 0],
			[239, 0],
			[0, 239],
			[239, 239],
			[120, 120],
			[17, 201],
			[200, 33]
		]) {
			worldToDiamond(x, y, at);
			expect(diamondSource(at[0], at[1])).toBe(y * TILE + x);
		}
	});

	it('agrees with the isometric projection of the view', () => {
		// a world point (u, v) in tile (tx, ty), relative to the diamond's top left:
		// the diamond's left edge is half a diamond (one tile width) left of the
		// tile's back corner
		const tx = 7;
		const ty = 3;
		const at = [0, 0];
		const corner = isoOffset(tx, ty, 0, TILE, 0);
		for (const [x, y] of [
			[0, 0],
			[120, 120],
			[60, 180],
			[216, 24],
			[239, 239]
		]) {
			const o = isoOffset(tx + x / TILE, ty + y / TILE, 0, TILE, 0);
			worldToDiamond(x, y, at);
			expect(at[0]).toBeCloseTo(o.x - (corner.x - TILE), 6);
			expect(at[1]).toBe(Math.floor(o.y - corner.y + 1e-9));
		}
	});

	it('has a flat 2-across-1-down edge: the diamond widens by 4 a row at the top', () => {
		const width = (sy: number) => {
			let n = 0;
			for (let sx = 0; sx < DIAMOND_W; sx++) if (diamondSource(sx, sy) >= 0) n++;
			return n;
		};
		expect(width(0)).toBe(3);
		expect(width(1)).toBe(7);
		expect(width(60)).toBe(243);
		expect(diamondSource(TILE, 0)).toBe(0);
		// symmetric about the centre column
		for (let sy = 0; sy < DIAMOND_H; sy += 17)
			for (let d = 1; d < 120; d += 7)
				expect(diamondSource(TILE + d, sy) >= 0).toBe(diamondSource(TILE - d, sy) >= 0);
	});

	it('turns a top-down tile into the diamond without losing a pixel', () => {
		const src = new Uint32Array(TILE * TILE);
		for (let p = 0; p < src.length; p++) src[p] = p + 1;
		const dst = new Uint32Array(DIAMOND_W * DIAMOND_H);
		toDiamond(src, dst);
		const used = new Set<number>();
		for (const c of dst) if (c !== 0) used.add(c);
		expect(used.size).toBe(TILE * TILE);
		// outside the diamond stays empty
		expect(dst[0]).toBe(0);
		expect(dst[119 * DIAMOND_W + DIAMOND_W - 1]).not.toBe(0);
		expect(diamondBottom(TILE)).toBe(DIAMOND_H - 1);
	});
});

describe('cliff drops', () => {
	// levels on a 4 x 4 map, row by row (index = y * 4 + x)
	const levels = new Uint8Array([
		/* y0 */ 1, 1, 1, 1, /* y1 */ 1, 4, 2, 5, /* y2 */ 1, 3, 1, 1, /* y3 */ 1, 1, 1, 1
	]);

	it('drops only where the tile in front is lower', () => {
		// (1, 1) is level 4: +x neighbour (2, 1) is 2, +y neighbour (1, 2) is 3
		expect(cliffDrop(levels, 4, 1, 1, true)).toBe(2);
		expect(cliffDrop(levels, 4, 1, 1, false)).toBe(1);
		// level or higher in front: no face
		expect(cliffDrop(levels, 4, 2, 1, true)).toBe(0);
		expect(cliffDrop(levels, 4, 0, 0, true)).toBe(0);
		expect(cliffDrop(levels, 4, 0, 1, true)).toBe(0);
		// a lower tile never draws a face towards a higher one
		expect(cliffDrop(levels, 4, 1, 0, false)).toBe(0);
	});

	it('has no face off the edge of the map', () => {
		expect(cliffDrop(levels, 4, 3, 1, true)).toBe(0);
		expect(cliffDrop(levels, 4, 3, 1, false)).toBe(4);
		expect(cliffDrop(levels, 4, 1, 3, false)).toBe(0);
	});

	it('makes the picture as tall as the tallest face', () => {
		expect(tileHeight(levels, 4, 0, 0)).toBe(DIAMOND_H);
		expect(tileHeight(levels, 4, 1, 1)).toBe(DIAMOND_H + 2 * LIFT);
		expect(tileHeight(levels, 4, 3, 1)).toBe(DIAMOND_H + 4 * LIFT);
	});
});

describe('paintFace', () => {
	const rows = (drop: number) => DIAMOND_H + drop * LIFT;
	const fresh = (drop: number) => new Uint32Array(DIAMOND_W * rows(drop));

	it('hangs a face of the right depth under each column of its side', () => {
		const out = fresh(3);
		paintFace(out, true, { drop: 2, style: Face.earth, seed: 1, fall: null });
		for (const sx of [240, 300, 400, 479]) {
			const top = diamondBottom(sx);
			expect(out[top * DIAMOND_W + sx]).toBe(0);
			expect(out[(top + 1) * DIAMOND_W + sx]).not.toBe(0);
			expect(out[(top + 2 * LIFT) * DIAMOND_W + sx]).not.toBe(0);
			expect(out[(top + 2 * LIFT + 1) * DIAMOND_W + sx]).toBe(0);
		}
		// nothing under the other side
		const top = diamondBottom(100);
		expect(out[(top + 1) * DIAMOND_W + 100]).toBe(0);
	});

	it('is lighter on the left than on the right, and keeps a grass lip', () => {
		const left = fresh(1);
		const right = fresh(1);
		paintFace(left, false, { drop: 1, style: Face.earth, seed: 3, fall: null });
		paintFace(right, true, { drop: 1, style: Face.earth, seed: 3, fall: null });
		const sum = (out: Uint32Array) => {
			let total = 0;
			let n = 0;
			for (const c of out) {
				if (c === 0) continue;
				total += (c & 255) + ((c >> 8) & 255) + ((c >> 16) & 255);
				n++;
			}
			return total / n;
		};
		expect(sum(left)).toBeGreaterThan(sum(right));
		const sx = 120;
		expect(left[(diamondBottom(sx) + 1) * DIAMOND_W + sx]).toBe(K.grass);
		expect(right[(diamondBottom(360) + 1) * DIAMOND_W + 360]).toBe(K.leaf);
	});

	it('pours water over the step where a river falls', () => {
		const out = fresh(1);
		const [a, b] = fallColumns(true, 100, 20);
		paintFace(out, true, { drop: 1, style: Face.earth, seed: 5, fall: [a, b] });
		const mid = Math.round((a + b) / 2);
		const wet = new Set([K.water, K.deep, K.waterLight, K.foam]);
		const at = (sx: number, k: number) => out[(diamondBottom(sx) + 1 + k) * DIAMOND_W + sx];
		expect(wet.has(at(mid, 10))).toBe(true);
		expect(wet.has(at(b + 4, 10))).toBe(false);
		// foam where it lands
		expect(wet.has(at(mid, LIFT - 1))).toBe(true);
	});

	it('maps a mouth on an edge to the columns it lands in', () => {
		// along the +x edge world pixel (239, y) lands in column 479 - y
		const at = [0, 0];
		worldToDiamond(239, 100, at);
		expect(fallColumns(true, 100, 0)[0]).toBe(at[0]);
		worldToDiamond(100, 239, at);
		expect(fallColumns(false, 100, 0)[0]).toBe(at[0]);
	});
});
