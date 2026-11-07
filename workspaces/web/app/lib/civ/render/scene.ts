import type { HerdView, MapLayers, PersonView, Village, WeatherKind, WorldMap } from '../types';
import type { Camera } from './camera';
import { LOCAL_TILE_PX, MAP_TILE_PX, modeOf, pixelScale, type Mode } from './pixel/scale';

// What every drawing layer shares: the frame's state, the part of the map on
// screen, and how close the camera is. Layers live in their own files
// (ground, objects, actors, atmosphere) and draw.ts puts them together.
//
// World units are tiles (40 m). Up close a tile fills much of the screen, so
// things inside a tile (a tree, a person) have positions in fractions of a
// tile, and everything that stands up is drawn in order of its foot's `y`
// so nearer things cover farther ones.

export type Living = Pick<WorldMap, 'plants' | 'wood' | 'built'>;

export type DrawState = {
	camera: Camera;
	// the whole map, one pixel per tile, for the zoomed-out view
	terrain: CanvasImageSource & { width: number; height: number };
	dpr: number;
	layers: MapLayers;
	living: Living;
	people: PersonView[];
	herds: HerdView[];
	villages: Pick<Village, 'id' | 'name' | 'x' | 'y'>[];
	// the simulation's clock, and real time for animation (ms)
	tick: number;
	now: number;
	season: number;
	weather: WeatherKind;
	followedId: number | null;
	hoveredId: number | null;
	theme: 'light' | 'dark';
};

export type View = {
	// overview (1 px a tile), map (16 px art tiles) or local (240 px art tiles)
	mode: Mode;
	// screen pixels per art pixel (whole numbers in map and local)
	scale: number;
	// art pixels per tile in this mode (16 or 240; 1 in overview)
	artPerTile: number;
	// the screen position of world (0, 0), on whole pixels, so every art
	// pixel lands on a whole multiple of `scale` from it
	originX: number;
	originY: number;
	// the tiles on screen, clamped to the map, with a tile of margin
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	// pixels per tile
	zoom: number;
	// 1 in local mode, 0 otherwise (kept for code that fades by closeness)
	detail: number;
	// screen pixels per metre
	ppm: number;
};

// A thing that stands up out of the ground, drawn in order of `y` (its foot,
// in tiles) so nearer things cover farther ones.
export type Standing = {
	y: number;
	draw: (ctx: CanvasRenderingContext2D) => void;
};

export const METERS_PER_TILE = 40;

export function viewOf(state: DrawState): View {
	const { camera, layers } = state;
	const a = camera.toWorld(0, 0);
	const b = camera.toWorld(camera.width, camera.height);
	const size = layers.size;
	const zoom = camera.zoom;
	const mode = modeOf(zoom);
	const origin = camera.toScreen(0, 0);
	return {
		mode,
		scale: pixelScale(zoom),
		artPerTile: mode === 'map' ? MAP_TILE_PX : mode === 'local' ? LOCAL_TILE_PX : 1,
		originX: Math.round(origin.x),
		originY: Math.round(origin.y),
		x0: Math.max(0, Math.floor(a.x) - 1),
		y0: Math.max(0, Math.floor(a.y) - 1),
		x1: Math.min(size, Math.ceil(b.x) + 1),
		y1: Math.min(size, Math.ceil(b.y) + 1),
		zoom,
		detail: mode === 'local' ? 1 : 0,
		ppm: zoom / METERS_PER_TILE
	};
}

// A world point (tiles) on screen, snapped to the art-pixel grid, so sprites
// never sit between pixels and don't shimmer as the camera moves.
export function snapToArt(view: View, wx: number, wy: number): { x: number; y: number } {
	const per = view.artPerTile * view.scale;
	const ax = Math.round(wx * view.artPerTile);
	const ay = Math.round(wy * view.artPerTile);
	return {
		x: view.originX + (ax * per) / view.artPerTile,
		y: view.originY + (ay * per) / view.artPerTile
	};
}

// A stable pseudo-random number in [0, 1) from integers, so scattered things
// (trees in a tile, a person's spot in camp) land the same way every frame
// and every visit.
export function hash(a: number, b = 0, c = 0, d = 0): number {
	let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
	h = Math.imul(h ^ Math.imul(c | 0, 2246822519), 3266489917) ^ Math.imul(d | 0, 1597334677);
	h = Math.imul(h ^ (h >>> 15), 2246822507);
	h = Math.imul(h ^ (h >>> 13), 3266489909);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
