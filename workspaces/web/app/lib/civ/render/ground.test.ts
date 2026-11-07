import { describe, expect, it } from 'vitest';
import { drawGround } from './ground';
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
