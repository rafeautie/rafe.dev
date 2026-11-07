import type { MapLayers, TileChange, WorldMap } from '../types';
import { tileColor } from './palette';

type Living = Pick<WorldMap, 'plants' | 'wood' | 'built'>;

// The pixel filling is a plain function over a byte array so it can be tested
// without a DOM. With `only` it touches just those tiles.
export function fillTerrain(
	pixels: Uint8ClampedArray,
	layers: MapLayers,
	living: Living,
	season: number,
	only?: ArrayLike<number>
): void {
	const count = only ? only.length : layers.size * layers.size;
	for (let n = 0; n < count; n++) {
		const i = only ? only[n] : n;
		const color = tileColor(i, layers, living, season);
		const o = i * 4;
		pixels[o] = color >> 16;
		pixels[o + 1] = (color >> 8) & 255;
		pixels[o + 2] = color & 255;
		pixels[o + 3] = 255;
	}
}

// One pixel per tile; the canvas scales it up with smoothing off.
export function buildTerrain(layers: MapLayers, living: Living, season: number): ImageData {
	const pixels = new Uint8ClampedArray(layers.size * layers.size * 4);
	fillTerrain(pixels, layers, living, season);
	return new ImageData(pixels, layers.size, layers.size);
}

// Writes the changes into `living` (the page keeps its own copy of those
// layers) and repaints just those tiles.
export function patchPixels(
	pixels: Uint8ClampedArray,
	layers: MapLayers,
	living: Living,
	changes: TileChange[],
	season: number
): void {
	const touched = new Array<number>(changes.length);
	for (let n = 0; n < changes.length; n++) {
		const change = changes[n];
		living.plants[change.i] = change.plants;
		living.wood[change.i] = change.wood;
		living.built[change.i] = change.built;
		touched[n] = change.i;
	}
	fillTerrain(pixels, layers, living, season, touched);
}

export function patchTerrain(
	image: { data: Uint8ClampedArray },
	layers: MapLayers,
	living: Living,
	changes: TileChange[],
	season: number
): void {
	patchPixels(image.data, layers, living, changes, season);
}
