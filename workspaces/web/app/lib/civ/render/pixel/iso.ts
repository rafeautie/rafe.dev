import { SEA_LEVEL } from '../../config';
import { Biome, Water, type MapLayers } from '../../types';

// The isometric view used in map and local modes: 2:1 diamond tiles, seen
// from one fixed side, with land raised in steps so hills, mountains and
// river valleys show their shape.
//
// World tile (x, y) at height `level` lands on screen at
//   sx = (x - y) * halfW
//   sy = (x + y) * halfH - level * lift
// relative to the screen position of world (0, 0). `halfW` is the camera's
// zoom (pixels), `halfH` half of that, so a tile is a diamond 2 * zoom wide
// and zoom tall. In art pixels: a map tile is a 32 x 16 diamond, a local
// tile 480 x 240.
//
// Draw order: things further back are drawn first. A thing's depth is
// x + y (in tiles) at its foot; a ground tile's depth is tx + ty (its back
// corner), so a tile is always drawn before what stands on it, and a raised
// tile in front covers what's behind it.

// art pixels each terrain level lifts the ground, per mode
export const MAP_LIFT = 4;
export const LOCAL_LIFT = 24;
// how many land levels there are above the water
export const LAND_LEVELS = 8;

// The height level of every tile: water at 0, land from 1 (shore) up to
// LAND_LEVELS (peaks). Rivers keep the level of their bed, so a river that
// steps down a level makes a little waterfall. Cached per map.
const levelsCache = new WeakMap<MapLayers, Uint8Array>();

export function levelsOf(layers: MapLayers): Uint8Array {
	const hit = levelsCache.get(layers);
	if (hit) return hit;
	const n = layers.size * layers.size;
	const out = new Uint8Array(n);
	for (let i = 0; i < n; i++) out[i] = levelAt(layers, i);
	levelsCache.set(layers, out);
	return out;
}

export function levelAt(layers: MapLayers, i: number): number {
	const w = layers.water[i];
	if (layers.biome[i] === Biome.ocean || w === Water.sea || w === Water.lake) return 0;
	// small hand-made maps in tests may have no heights: treat them as lowland
	if (!layers.height) return 1;
	const above = (layers.height[i] - SEA_LEVEL) / (1 - SEA_LEVEL);
	// gentle lowlands, steeper highlands: square-root spacing keeps most of
	// the farmland on the first few levels
	const t = Math.sqrt(Math.min(1, Math.max(0, above)));
	return 1 + Math.min(LAND_LEVELS - 1, Math.floor(t * LAND_LEVELS));
}

// The level at a fractional world point (the level of its tile).
export function levelAtPoint(layers: MapLayers, x: number, y: number): number {
	const tx = Math.min(layers.size - 1, Math.max(0, Math.floor(x)));
	const ty = Math.min(layers.size - 1, Math.max(0, Math.floor(y)));
	return levelsOf(layers)[ty * layers.size + tx];
}

// Screen offset of a world point (tiles) from the screen position of world
// (0, 0), for a camera zoom (halfW, in screen pixels) and a lift per level
// (screen pixels).
export function isoOffset(
	x: number,
	y: number,
	level: number,
	halfW: number,
	liftPx: number
): { x: number; y: number } {
	return { x: (x - y) * halfW, y: ((x + y) * halfW) / 2 - level * liftPx };
}

// The ground point (level 0 plane) under a screen offset from world (0, 0).
export function isoInverse(sx: number, sy: number, halfW: number): { x: number; y: number } {
	const a = sx / halfW;
	const b = (2 * sy) / halfW;
	return { x: (a + b) / 2, y: (b - a) / 2 };
}
