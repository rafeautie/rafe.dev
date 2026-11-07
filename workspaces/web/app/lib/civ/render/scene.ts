import type { HerdView, MapLayers, PersonView, Village, WeatherKind, WorldMap } from '../types';
import type { Camera } from './camera';

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
	// the tiles on screen, clamped to the map, with a tile of margin
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	// pixels per tile
	zoom: number;
	// 0 = the flat overview map, 1 = full close-up detail
	detail: number;
	// pixels per metre, handy for sizing things by their real size
	ppm: number;
};

// A thing that stands up out of the ground, drawn in order of `y` (its foot,
// in tiles) so nearer things cover farther ones.
export type Standing = {
	y: number;
	draw: (ctx: CanvasRenderingContext2D) => void;
};

export const METERS_PER_TILE = 40;
// close-up detail starts fading in at DETAIL_START px per tile and is full
// at DETAIL_FULL
export const DETAIL_START = 18;
export const DETAIL_FULL = 60;

export function viewOf(state: DrawState): View {
	const { camera, layers } = state;
	const a = camera.toWorld(0, 0);
	const b = camera.toWorld(camera.width, camera.height);
	const size = layers.size;
	const zoom = camera.zoom;
	const t =
		(Math.log(zoom) - Math.log(DETAIL_START)) / (Math.log(DETAIL_FULL) - Math.log(DETAIL_START));
	return {
		x0: Math.max(0, Math.floor(a.x) - 1),
		y0: Math.max(0, Math.floor(a.y) - 1),
		x1: Math.min(size, Math.ceil(b.x) + 1),
		y1: Math.min(size, Math.ceil(b.y) + 1),
		zoom,
		detail: Math.min(1, Math.max(0, t)),
		ppm: zoom / METERS_PER_TILE
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
