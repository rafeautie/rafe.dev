import { describe, expect, it } from 'vitest';
import { Biome, Water } from '../types';
import { drawGround, riverChannel, waterAt } from './ground';
import { viewOf, type DrawState } from './scene';
import { Camera } from './camera';

describe('drawGround', () => {
	it('does nothing (and touches no canvas) when zoomed out', () => {
		const camera = new Camera();
		camera.zoom = 5;
		const state = { camera, layers: { size: 8 } } as unknown as DrawState;
		const view = viewOf(state);
		expect(view.detail).toBe(0);
		// a context that explodes if used
		const ctx = new Proxy(
			{},
			{
				get: () => {
					throw new Error('used');
				}
			}
		) as CanvasRenderingContext2D;
		expect(() => drawGround(ctx, state, view)).not.toThrow();
	});
});

describe('waterAt and river channels', () => {
	const size = 12;
	const n = size * size;
	const layers = {
		size,
		water: new Uint8Array(n),
		biome: new Uint8Array(n).fill(Biome.grassland)
	};
	// a river along row 5 into a lake at x = 10..11
	for (let x = 0; x < 10; x++) layers.water[5 * size + x] = Water.river;
	layers.water[5 * size + 10] = Water.lake;
	layers.water[5 * size + 11] = Water.lake;

	it('treats lakes as whole tiles and land as dry', () => {
		expect(waterAt(layers, 10.5, 5.5)).toBe(true);
		expect(waterAt(layers, 10.02, 5.98)).toBe(true);
		expect(waterAt(layers, 3.5, 2.5)).toBe(false);
		expect(waterAt(layers, -1, 2)).toBe(false);
	});

	it('puts a river only in a narrow channel', () => {
		const out: number[] = [];
		const segs = riverChannel(layers, 4, 5, out);
		expect(segs).toBe(2);
		expect(waterAt(layers, 4 + out[4], 5 + out[5])).toBe(true);
		// the tile corners are bank
		expect(waterAt(layers, 4.04, 5.04)).toBe(false);
		expect(waterAt(layers, 4.96, 5.96)).toBe(false);
		// channel is 6 to 14 m wide
		expect(out[6]).toBeGreaterThanOrEqual(6 / 40);
		expect(out[6]).toBeLessThanOrEqual(14 / 40);
	});

	it('meets the neighbouring tile at the same point and width', () => {
		const a: number[] = [];
		const b: number[] = [];
		riverChannel(layers, 4, 5, a);
		riverChannel(layers, 5, 5, b);
		// tile 4 enters from the west (0, y) and east (1, y); tile 5's west mouth matches
		const east = findMouth(a, 1);
		const west = findMouth(b, 0);
		expect(east).not.toBeNull();
		expect(west).not.toBeNull();
		expect(east![1]).toBeCloseTo(west![1], 6);
		expect(east![2]).toBeCloseTo(west![2], 6);
	});
});

// finds the segment whose mouth sits on the east (x = 1) or west (x = 0) edge
function findMouth(segs: number[], x: number): number[] | null {
	for (let o = 0; o + 6 < segs.length; o += 7) {
		if (segs[o] === x && segs[o + 6] > 0) return [segs[o], segs[o + 1], segs[o + 6]];
	}
	return null;
}
