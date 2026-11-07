import { isoInverse, isoOffset } from './pixel/iso';
import { MAX_ZOOM, MIN_ZOOM, modeOf, snapZoom } from './pixel/scale';

export { MAX_ZOOM, MIN_ZOOM } from './pixel/scale';

// The view onto the map. World units are tiles: tile (tx, ty) covers
// [tx, tx+1) x [ty, ty+1). Screen units are device pixels. (x, y) is the
// world point at the middle of the screen.
//
// In the overview the map is seen from straight above and `zoom` is pixels
// per tile. In map and local modes it's isometric (pixel/iso.ts): a tile is
// a diamond 2 * zoom wide and zoom tall. These conversions are for the
// ground plane (level 0); raised things are lifted by the renderers.
//
// Zooming moves a smooth `wish`; what's shown is that wish snapped to a
// whole-pixel scale for the pixel art (pixel/scale.ts).
export class Camera {
	x = 128;
	y = 128;
	zoom = 3;
	wish = 3;
	width = 800;
	height = 600;
	mapSize = 256;

	get iso(): boolean {
		return modeOf(this.zoom) !== 'overview';
	}

	setViewport(width: number, height: number): void {
		this.width = width;
		this.height = height;
	}

	toScreen(wx: number, wy: number): { x: number; y: number } {
		if (this.iso) {
			const o = isoOffset(wx - this.x, wy - this.y, 0, this.zoom, 0);
			return { x: o.x + this.width / 2, y: o.y + this.height / 2 };
		}
		return {
			x: (wx - this.x) * this.zoom + this.width / 2,
			y: (wy - this.y) * this.zoom + this.height / 2
		};
	}

	toWorld(sx: number, sy: number): { x: number; y: number } {
		if (this.iso) {
			const g = isoInverse(sx - this.width / 2, sy - this.height / 2, this.zoom);
			return { x: g.x + this.x, y: g.y + this.y };
		}
		return {
			x: (sx - this.width / 2) / this.zoom + this.x,
			y: (sy - this.height / 2) / this.zoom + this.y
		};
	}

	panBy(dxPx: number, dyPx: number): void {
		if (this.iso) {
			const d = isoInverse(dxPx, dyPx, this.zoom);
			this.x -= d.x;
			this.y -= d.y;
		} else {
			this.x -= dxPx / this.zoom;
			this.y -= dyPx / this.zoom;
		}
		this.clamp();
	}

	// Zoom while the world point under (screenX, screenY) stays put. Crossing
	// between the overview and the isometric view changes the projection, so
	// the point is kept on the ground plane in both.
	zoomAt(factor: number, screenX: number, screenY: number): void {
		const before = this.toWorld(screenX, screenY);
		this.wish = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.wish * factor));
		this.zoom = snapZoom(this.wish);
		const after = this.toWorld(screenX, screenY);
		this.x += before.x - after.x;
		this.y += before.y - after.y;
		this.clamp();
	}

	// Show the whole map, centred.
	fit(mapSize: number): void {
		this.mapSize = mapSize;
		const side = Math.min(this.width, this.height);
		this.wish = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, side / mapSize));
		this.zoom = snapZoom(this.wish);
		this.x = mapSize / 2;
		this.y = mapSize / 2;
	}

	// Ease toward a target. Using the elapsed time keeps the speed the same
	// at any frame rate.
	follow(x: number, y: number, dtMs = 16): void {
		const k = 1 - Math.exp(-dtMs / 140);
		this.x += (x - this.x) * k;
		this.y += (y - this.y) * k;
		this.clamp();
	}

	// The centre stays on the map, so some of it is always on screen.
	clamp(): void {
		this.x = Math.min(this.mapSize, Math.max(0, this.x));
		this.y = Math.min(this.mapSize, Math.max(0, this.y));
	}
}
