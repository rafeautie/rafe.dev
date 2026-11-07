import type { HerdView, MapLayers, PersonView, Village, WeatherKind, WorldMap } from '../types';
import type { Camera } from './camera';
import { LAND_LEVELS, levelsOf, LOCAL_LIFT, MAP_LIFT } from './pixel/iso';
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
	// overview (top-down, 1 px a tile), map or local (isometric pixel art)
	mode: Mode;
	// isometric in map and local modes (pixel/iso.ts)
	iso: boolean;
	// screen pixels per art pixel (whole numbers in map and local)
	scale: number;
	// art pixels for half a tile diamond's width (16 map, 240 local, 1 overview):
	// a tile is a diamond 2 * artPerTile wide and artPerTile tall
	artPerTile: number;
	// art pixels each terrain level lifts the ground (0 in overview)
	liftArt: number;
	// every tile's height level (pixel/iso.ts levelsOf)
	levels: Uint8Array;
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

// A thing drawn in the depth-sorted pass: ground tiles (in local mode),
// trees, buildings, people and animals. `y` is its depth: x + y in tiles at
// its foot (iso), or just its foot's y in the top-down overview. Lower
// depths are drawn first, so nearer things cover farther ones.
export type Standing = {
	y: number;
	draw: (ctx: CanvasRenderingContext2D) => void;
};

export const METERS_PER_TILE = 40;

export function viewOf(state: DrawState): View {
	const { camera, layers } = state;
	const size = layers.size;
	const zoom = camera.zoom;
	const mode = modeOf(zoom);
	const iso = mode !== 'overview';
	const scale = pixelScale(zoom);
	const liftArt = mode === 'map' ? MAP_LIFT : mode === 'local' ? LOCAL_LIFT : 0;
	const origin = camera.toScreen(0, 0);

	// the world box covering the screen: from all four corners, since in iso
	// the screen is a rotated rectangle on the ground
	const corners = [
		camera.toWorld(0, 0),
		camera.toWorld(camera.width, 0),
		camera.toWorld(0, camera.height),
		camera.toWorld(camera.width, camera.height)
	];
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const c of corners) {
		minX = Math.min(minX, c.x);
		minY = Math.min(minY, c.y);
		maxX = Math.max(maxX, c.x);
		maxY = Math.max(maxY, c.y);
	}
	// raised land further down the map shows higher up the screen, and tall
	// sprites reach up from below the screen's edge
	const extra = iso ? Math.ceil((LAND_LEVELS * liftArt * scale + 80 * scale) / (zoom / 2)) : 0;

	return {
		mode,
		iso,
		scale,
		artPerTile: mode === 'map' ? MAP_TILE_PX : mode === 'local' ? LOCAL_TILE_PX : 1,
		liftArt,
		levels: levelsOf(layers),
		originX: Math.round(origin.x),
		originY: Math.round(origin.y),
		x0: Math.max(0, Math.floor(minX) - 1),
		y0: Math.max(0, Math.floor(minY) - 1),
		x1: Math.min(size, Math.ceil(maxX) + 1 + extra),
		y1: Math.min(size, Math.ceil(maxY) + 1 + extra),
		zoom,
		detail: mode === 'local' ? 1 : 0,
		ppm: zoom / METERS_PER_TILE
	};
}

// The height level under a world point.
export function levelAt(view: View, size: number, wx: number, wy: number): number {
	const tx = Math.min(size - 1, Math.max(0, Math.floor(wx)));
	const ty = Math.min(size - 1, Math.max(0, Math.floor(wy)));
	return view.levels[ty * size + tx] ?? 0;
}

// A world point (tiles) on screen, snapped to the art-pixel grid so sprites
// never sit between pixels or shimmer as the camera moves. In iso modes it's
// lifted by `level` (the tile's own level if not given; pass the map size
// as `size` for that). In the overview it's the plain top-down point.
export function snapToArt(
	view: View,
	wx: number,
	wy: number,
	level?: number,
	size = Math.sqrt(view.levels.length)
): { x: number; y: number } {
	const s = view.scale;
	if (!view.iso) {
		return {
			x: view.originX + Math.round(wx * view.zoom),
			y: view.originY + Math.round(wy * view.zoom)
		};
	}
	const lv = level ?? levelAt(view, size, wx, wy);
	const ax = Math.round((wx - wy) * view.artPerTile);
	const ay = Math.round(((wx + wy) * view.artPerTile) / 2) - lv * view.liftArt;
	return { x: view.originX + ax * s, y: view.originY + ay * s };
}

// The depth to sort something by (see `Standing`).
export function depthOf(view: View, wx: number, wy: number): number {
	return view.iso ? wx + wy : wy;
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
