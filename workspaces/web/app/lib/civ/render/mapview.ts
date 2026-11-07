import type { MapLayers } from '../types';
import { MAP_TILE_PX } from './pixel/scale';
import { pickTile, newPick, seasonRecolor, VILLAGE_ICON, type TilePick } from './pixel/maptiles';
import { VILLAGE_CLOTH } from './pixel/palette';
import { sprite, type SpriteDef } from './pixel/sprite';
import type { DrawState, Living, View } from './scene';

// The pixel-art map (zoom 16..192 px a tile): each tile a 16 x 16 sprite.
//
// Tiles are composed into chunks of 16 x 16 tiles (256 x 256 px) at one art
// pixel per pixel, and a chunk is drawn to the screen as a single scaled
// image. A chunk is only redrawn when its tiles change or the season turns,
// so a frame is a handful of drawImage calls.

const CHUNK_TILES = 16;
const CHUNK_PX = CHUNK_TILES * MAP_TILE_PX;
// chunks kept around (about 64 MB at most) and chunks rebuilt in one frame
const MAX_CHUNKS = 256;
const REBUILDS_PER_FRAME = 6;

type Canvas = HTMLCanvasElement | OffscreenCanvas;

type Chunk = {
	canvas: Canvas;
	// the look of the tiles it was drawn from
	sig: number;
	season: number;
	villages: number;
	// the tick the signature was last checked at (tiles only change on ticks)
	checked: number;
	drawn: boolean;
	used: number;
};

const chunks = new Map<number, Chunk>();
let forLayers: MapLayers | null = null;
let forLiving: Living | null = null;
let frame = 0;

const pick: TilePick = newPick();

function makeCanvas(): Canvas {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(CHUNK_PX, CHUNK_PX);
	const canvas = document.createElement('canvas');
	canvas.width = CHUNK_PX;
	canvas.height = CHUNK_PX;
	return canvas;
}

// Forest cover in steps, so a tree growing a little doesn't redraw anything.
const woodStep = (w: number): number => (w < 0.12 ? 0 : w < 0.4 ? 1 : w < 0.55 ? 2 : 3);

// A cheap fingerprint of what the chunk's tiles look like now.
export function chunkSignature(living: Living, size: number, cx: number, cy: number): number {
	let h = 17;
	const x1 = Math.min(size, (cx + 1) * CHUNK_TILES);
	const y1 = Math.min(size, (cy + 1) * CHUNK_TILES);
	for (let y = cy * CHUNK_TILES; y < y1; y++) {
		for (let x = cx * CHUNK_TILES; x < x1; x++) {
			const i = y * size + x;
			const plants = living.plants[i] < 0.2 ? 0 : living.plants[i] < 0.3 ? 1 : 2;
			h = (Math.imul(h, 31) + woodStep(living.wood[i]) * 3 + plants + living.built[i] * 12) | 0;
		}
	}
	return h;
}

function villageSignature(villages: DrawState['villages']): number {
	let h = villages.length;
	for (const v of villages) h = (Math.imul(h, 31) + v.x * 7919 + v.y + v.id * 13) | 0;
	return h;
}

function put(g: CanvasRenderingContext2D, def: SpriteDef, x: number, y: number, season: number) {
	g.drawImage(sprite(def, seasonRecolor(season)).canvas, x, y);
}

function drawChunk(chunk: Chunk, state: DrawState, cx: number, cy: number, season: number): void {
	const { layers, living } = state;
	const g = chunk.canvas.getContext('2d') as CanvasRenderingContext2D;
	g.imageSmoothingEnabled = false;
	g.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
	const x0 = cx * CHUNK_TILES;
	const y0 = cy * CHUNK_TILES;
	const x1 = Math.min(layers.size, x0 + CHUNK_TILES);
	const y1 = Math.min(layers.size, y0 + CHUNK_TILES);
	for (let ty = y0; ty < y1; ty++) {
		for (let tx = x0; tx < x1; tx++) {
			pickTile(layers, living, tx, ty, pick);
			const px = (tx - x0) * MAP_TILE_PX;
			const py = (ty - y0) * MAP_TILE_PX;
			put(g, pick.base, px, py, season);
			if (pick.over) put(g, pick.over, px, py, season);
			if (pick.deposit) put(g, pick.deposit, px + pick.depositX, py + pick.depositY, season);
			if (pick.built) put(g, pick.built, px, py, season);
		}
	}
	for (const v of state.villages) {
		if (v.x < x0 || v.x >= x1 || v.y < y0 || v.y >= y1) continue;
		const cloth = VILLAGE_CLOTH[
			((v.id % VILLAGE_CLOTH.length) + VILLAGE_CLOTH.length) % 6
		] as `#${string}`;
		const icon = sprite(VILLAGE_ICON, { ...seasonRecolor(season), M: cloth });
		g.drawImage(icon.canvas, (v.x - x0) * MAP_TILE_PX, (v.y - y0) * MAP_TILE_PX);
	}
}

function forget(): void {
	if (chunks.size <= MAX_CHUNKS) return;
	const old = [...chunks.entries()].sort((a, b) => a[1].used - b[1].used);
	for (const [key] of old.slice(0, chunks.size - MAX_CHUNKS)) chunks.delete(key);
}

export function drawMap(ctx: CanvasRenderingContext2D, state: DrawState, view: View): void {
	const { layers, living } = state;
	if (layers !== forLayers || living !== forLiving) {
		chunks.clear();
		forLayers = layers;
		forLiving = living;
	}
	frame++;
	const season = ((state.season % 4) + 4) % 4;
	const villages = villageSignature(state.villages);
	const cx0 = Math.floor(view.x0 / CHUNK_TILES);
	const cy0 = Math.floor(view.y0 / CHUNK_TILES);
	const cx1 = Math.floor((view.x1 - 1) / CHUNK_TILES);
	const cy1 = Math.floor((view.y1 - 1) / CHUNK_TILES);
	const span = CHUNK_PX * view.scale;
	let rebuilt = 0;

	ctx.imageSmoothingEnabled = false;
	for (let cy = cy0; cy <= cy1; cy++) {
		for (let cx = cx0; cx <= cx1; cx++) {
			const key = cy * 4096 + cx;
			let chunk = chunks.get(key);
			if (!chunk) {
				chunk = {
					canvas: makeCanvas(),
					sig: 0,
					season: -1,
					villages: 0,
					checked: -1,
					drawn: false,
					used: 0
				};
				chunks.set(key, chunk);
			}
			chunk.used = frame;
			if (chunk.season !== season || chunk.villages !== villages || chunk.checked !== state.tick) {
				const sig = chunkSignature(living, layers.size, cx, cy);
				const stale =
					!chunk.drawn ||
					sig !== chunk.sig ||
					chunk.season !== season ||
					chunk.villages !== villages;
				// the overview shows through a chunk that has to wait its turn
				if (!stale) chunk.checked = state.tick;
				else if (rebuilt < REBUILDS_PER_FRAME) {
					rebuilt++;
					drawChunk(chunk, state, cx, cy, season);
					chunk.sig = sig;
					chunk.season = season;
					chunk.villages = villages;
					chunk.checked = state.tick;
					chunk.drawn = true;
				}
			}
			if (!chunk.drawn) continue;
			ctx.drawImage(chunk.canvas, view.originX + cx * span, view.originY + cy * span, span, span);
		}
	}
	forget();
}
