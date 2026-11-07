export const MIN_ZOOM = 1.5;
// up close a 40 m tile is wider than the screen and a person, drawn larger
// than life, stands about 65 px tall
export const MAX_ZOOM = 960;

// The view onto the map. World units are tiles: tile (tx, ty) covers
// [tx, tx+1) x [ty, ty+1). Screen units are CSS pixels (the canvas scales for
// devicePixelRatio itself). `zoom` is pixels per tile.
export class Camera {
	x = 128;
	y = 128;
	zoom = 3;
	width = 800;
	height = 600;
	mapSize = 256;

	setViewport(width: number, height: number): void {
		this.width = width;
		this.height = height;
	}

	toScreen(wx: number, wy: number): { x: number; y: number } {
		return {
			x: (wx - this.x) * this.zoom + this.width / 2,
			y: (wy - this.y) * this.zoom + this.height / 2
		};
	}

	toWorld(sx: number, sy: number): { x: number; y: number } {
		return {
			x: (sx - this.width / 2) / this.zoom + this.x,
			y: (sy - this.height / 2) / this.zoom + this.y
		};
	}

	panBy(dxPx: number, dyPx: number): void {
		this.x -= dxPx / this.zoom;
		this.y -= dyPx / this.zoom;
		this.clamp();
	}

	// Zoom while the world point under (screenX, screenY) stays put.
	zoomAt(factor: number, screenX: number, screenY: number): void {
		const before = this.toWorld(screenX, screenY);
		this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
		this.x = before.x - (screenX - this.width / 2) / this.zoom;
		this.y = before.y - (screenY - this.height / 2) / this.zoom;
		this.clamp();
	}

	// Show the whole map, centred.
	fit(mapSize: number): void {
		this.mapSize = mapSize;
		const side = Math.min(this.width, this.height);
		this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, side / mapSize));
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
