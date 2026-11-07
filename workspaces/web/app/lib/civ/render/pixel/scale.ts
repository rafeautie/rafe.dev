// The pixel-art scales the map is drawn at, and the zoom levels the camera
// snaps to so art pixels always land on whole screen pixels.
//
// There are three ways of looking at the world:
// - overview: the whole region, one pixel per 40 m tile, zooming smoothly
//   from 1.5 up to 16 screen pixels a tile;
// - map: a pixel-art map where each tile is a 16 x 16 sprite (forest, hills,
//   river, a village), shown at whole-number scales 1x..12x;
// - local: close up, where a tile is 240 x 240 art pixels (6 art pixels a
//   metre) and every tree, person and hut is its own sprite, at 1x..4x.

export type Mode = 'overview' | 'map' | 'local';

// art pixels per tile in each pixel-art mode
export const MAP_TILE_PX = 16;
export const LOCAL_TILE_PX = 240;
// art pixels per metre close up (a 40 m tile is 240 art pixels)
export const LOCAL_PX_PER_M = LOCAL_TILE_PX / 40;

export const MIN_ZOOM = 1.5;
// past 6x the 16-pixel map tiles turn into big blocks; the close view takes over
const MAP_SCALES = [1, 2, 3, 4, 6];
const LOCAL_SCALES = [1, 2, 3, 4];
export const LADDER: number[] = [
	...MAP_SCALES.map((s) => s * MAP_TILE_PX),
	...LOCAL_SCALES.map((s) => s * LOCAL_TILE_PX)
];
export const MAX_ZOOM = LADDER[LADDER.length - 1];

// The zoom actually shown for a wished-for one: smooth below the first rung,
// the nearest rung (in log terms) above it.
export function snapZoom(wish: number): number {
	const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, wish));
	if (z <= LADDER[0]) return z;
	let best = LADDER[0];
	for (const rung of LADDER) {
		if (Math.abs(Math.log(rung / z)) < Math.abs(Math.log(best / z))) best = rung;
	}
	return best;
}

export function modeOf(zoom: number): Mode {
	if (zoom < MAP_TILE_PX) return 'overview';
	if (zoom < LOCAL_TILE_PX) return 'map';
	return 'local';
}

// screen pixels per art pixel (1 in overview, where there is no art grid)
export function pixelScale(zoom: number): number {
	const mode = modeOf(zoom);
	if (mode === 'map') return Math.max(1, Math.round(zoom / MAP_TILE_PX));
	if (mode === 'local') return Math.max(1, Math.round(zoom / LOCAL_TILE_PX));
	return 1;
}
