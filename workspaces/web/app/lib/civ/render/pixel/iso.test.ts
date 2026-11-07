import { describe, expect, it } from 'vitest';
import { Camera } from '../camera';
import { isoInverse, isoOffset, LAND_LEVELS, levelAt } from './iso';
import { Biome, Water, type MapLayers } from '../../types';

describe('isometric projection', () => {
	it('turns a tile into a 2:1 diamond', () => {
		const zoom = 16;
		const right = isoOffset(1, 0, 0, zoom, 0);
		const down = isoOffset(0, 1, 0, zoom, 0);
		expect(right).toEqual({ x: 16, y: 8 });
		expect(down).toEqual({ x: -16, y: 8 });
	});

	it('lifts raised ground straight up', () => {
		expect(isoOffset(3, 2, 2, 16, 4).y).toBe(isoOffset(3, 2, 0, 16, 4).y - 8);
	});

	it('inverts back to the ground point', () => {
		const o = isoOffset(5.25, -2.5, 0, 24, 0);
		const g = isoInverse(o.x, o.y, 24);
		expect(g.x).toBeCloseTo(5.25);
		expect(g.y).toBeCloseTo(-2.5);
	});

	it('keeps the point under the cursor when zooming into iso', () => {
		const camera = new Camera();
		camera.setViewport(800, 600);
		camera.wish = camera.zoom = 12;
		const before = camera.toWorld(210, 140);
		camera.zoomAt(4, 210, 140);
		expect(camera.iso).toBe(true);
		const after = camera.toWorld(210, 140);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});

	it('round-trips screen and world in iso', () => {
		const camera = new Camera();
		camera.setViewport(800, 600);
		camera.wish = camera.zoom = 32;
		const s = camera.toScreen(130.5, 120.25);
		const w = camera.toWorld(s.x, s.y);
		expect(w.x).toBeCloseTo(130.5);
		expect(w.y).toBeCloseTo(120.25);
	});
});

describe('height levels', () => {
	const layers = (height: number, water: number = Water.none, biome: number = Biome.grassland) =>
		({
			size: 1,
			height: new Float32Array([height]),
			water: new Uint8Array([water]),
			biome: new Uint8Array([biome])
		}) as unknown as MapLayers;

	it('puts water at 0 and land from 1 up', () => {
		expect(levelAt(layers(0.2, Water.sea, Biome.ocean), 0)).toBe(0);
		expect(levelAt(layers(0.5, Water.lake), 0)).toBe(0);
		expect(levelAt(layers(0.381), 0)).toBe(1);
		expect(levelAt(layers(1), 0)).toBe(LAND_LEVELS);
	});

	it('rises with height', () => {
		let last = 0;
		for (let h = 0.39; h <= 1; h += 0.05) {
			const lv = levelAt(layers(h), 0);
			expect(lv).toBeGreaterThanOrEqual(last);
			last = lv;
		}
	});
});
