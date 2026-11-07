import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './camera';

const make = () => {
	const camera = new Camera();
	camera.setViewport(800, 600);
	camera.x = 100;
	camera.y = 90;
	camera.zoom = 6;
	return camera;
};

describe('Camera', () => {
	it('round-trips screen and world', () => {
		const camera = make();
		const w = camera.toWorld(123, 456);
		const s = camera.toScreen(w.x, w.y);
		expect(s.x).toBeCloseTo(123);
		expect(s.y).toBeCloseTo(456);
	});

	it('puts the centre in the middle of the screen', () => {
		const s = make().toScreen(100, 90);
		expect(s).toEqual({ x: 400, y: 300 });
	});

	it('keeps the point under the cursor fixed when zooming', () => {
		const camera = make();
		const before = camera.toWorld(210, 140);
		camera.zoomAt(1.7, 210, 140);
		const after = camera.toWorld(210, 140);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});

	it('clamps zoom', () => {
		const camera = make();
		camera.zoomAt(1000, 400, 300);
		expect(camera.zoom).toBe(MAX_ZOOM);
		camera.zoomAt(1e-6, 400, 300);
		expect(camera.zoom).toBe(MIN_ZOOM);
	});

	it('pans opposite to the drag and cannot leave the map', () => {
		const camera = make();
		camera.panBy(60, 0);
		expect(camera.x).toBeCloseTo(90);
		camera.panBy(1e6, 1e6);
		expect(camera.x).toBe(0);
		expect(camera.y).toBe(0);
	});

	it('fits the whole map', () => {
		const camera = make();
		camera.fit(256);
		expect(camera.x).toBe(128);
		expect(camera.zoom * 256).toBeLessThanOrEqual(600 + 1e-6);
	});

	it('eases toward a followed point', () => {
		const camera = make();
		camera.follow(120, 90, 16);
		expect(camera.x).toBeGreaterThan(100);
		expect(camera.x).toBeLessThan(120);
		for (let n = 0; n < 200; n++) camera.follow(120, 90, 16);
		expect(camera.x).toBeCloseTo(120);
	});
});
