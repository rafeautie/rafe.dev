import type { MapLayers } from '../types';
import { levelsOf } from './pixel/iso';
import {
	CHUNK_H,
	CHUNK_TILES,
	CHUNK_W,
	FACE_Y,
	TILE_ORDER,
	chunkArt,
	chunkOrder,
	cliffsAt,
	faceSprite,
	fallOf,
	newCliffs,
	tileSpotX,
	tileSpotY
} from './pixel/mapiso';
import { RISE } from './pixel/mapisokit';
import { newPick, pickTile, seasonRecolor, VILLAGE_ICON, type TilePick } from './pixel/maptiles';
import { VILLAGE_CLOTH } from './pixel/palette';
import { sprite, type SpriteDef } from './pixel/sprite';
import { hash, type DrawState, type Living, type View } from './scene';

// The pixel-art map (zoom 16..96 px a half tile, 1x..6x): isometric, each
// tile a 32 x 16 diamond, raised in steps with cliff faces down to lower
// ground.
//
// Tiles are composed into chunks of 16 x 16 tiles at one art pixel per pixel.
// A chunk is a diamond of tiles, drawn into a canvas that fits its bounding
// box (mapiso.ts has the layout), and drawn to the screen as a single scaled
// image. A chunk is only redrawn when its tiles change or the season turns,
// so a frame is a few dozen drawImage calls.
//
// Order: the tiles of a chunk are drawn back to front (nearest last), and so
// are the chunks. Trees and cliffs spill out of a tile's own diamond, but
// only upwards over tiles behind it or downwards inside its own footprint, so
// back-to-front chunks cover each other correctly with no seams.

// chunks kept around (about 75 MB at most) and how many are rebuilt in a
// frame, and for how long (ms)
const MAX_CHUNKS = 120;
const REBUILDS_PER_FRAME = 4;
const REBUILD_MS = 10;

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

// a chunk that is on screen this frame
type Visible = {
	chunk: Chunk;
	cx: number;
	cy: number;
	dx: number;
	dy: number;
	stale: boolean;
	// the signature to remember once the chunk is rebuilt
	sig: number;
};

const chunks = new Map<number, Chunk>();
let forLayers: MapLayers | null = null;
let forLiving: Living | null = null;
let frame = 0;

const pick: TilePick = newPick();
const cliffs = newCliffs();

function makeCanvas(): Canvas {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(CHUNK_W, CHUNK_H);
	const canvas = document.createElement('canvas');
	canvas.width = CHUNK_W;
	canvas.height = CHUNK_H;
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

// each sprite as a canvas for a season, so drawing a tile is a lookup
const bitmaps: Map<SpriteDef, Canvas>[] = [new Map(), new Map(), new Map(), new Map()];

function bitmap(def: SpriteDef, season: number): Canvas {
	let hit = bitmaps[season].get(def);
	if (!hit) {
		hit = sprite(def, seasonRecolor(season)).canvas;
		bitmaps[season].set(def, hit);
	}
	return hit;
}

function drawChunk(chunk: Chunk, state: DrawState, cx: number, cy: number, season: number): void {
	const { layers, living } = state;
	const size = layers.size;
	const levels = levelsOf(layers);
	const g = chunk.canvas.getContext('2d') as CanvasRenderingContext2D;
	g.imageSmoothingEnabled = false;
	g.clearRect(0, 0, CHUNK_W, CHUNK_H);
	const x0 = cx * CHUNK_TILES;
	const y0 = cy * CHUNK_TILES;

	// the villages in this chunk, by tile
	const flags = new Map<number, string>();
	for (const v of state.villages) {
		if (v.x < x0 || v.x >= x0 + CHUNK_TILES || v.y < y0 || v.y >= y0 + CHUNK_TILES) continue;
		const n = VILLAGE_CLOTH.length;
		flags.set((v.y - y0) * CHUNK_TILES + (v.x - x0), VILLAGE_CLOTH[((v.id % n) + n) % n]);
	}

	for (const [i, j] of TILE_ORDER) {
		const tx = x0 + i;
		const ty = y0 + j;
		if (tx >= size || ty >= size) continue;
		const level = levels[ty * size + tx];
		const sx = tileSpotX(i, j);
		const sy = tileSpotY(i, j, level);
		pickTile(layers, living, tx, ty, pick);

		// cliffs first, the top face hangs from their upper edge
		cliffsAt(levels, size, tx, ty, cliffs);
		const variant = hash(tx, ty, 31) < 0.5 ? 0 : 1;
		if (cliffs.right > 0) {
			const fall = pick.river ? fallOf(pick.river, 'right') : 0;
			const face = faceSprite(pick.face, 'right', cliffs.right, variant, cliffs.rimRight, fall);
			g.drawImage(bitmap(face, season), sx + 16, sy + FACE_Y);
		}
		if (cliffs.left > 0) {
			const fall = pick.river ? fallOf(pick.river, 'left') : 0;
			const face = faceSprite(pick.face, 'left', cliffs.left, variant, cliffs.rimLeft, fall);
			g.drawImage(bitmap(face, season), sx, sy + FACE_Y);
		}

		g.drawImage(bitmap(pick.base, season), sx, sy);
		if (pick.over) g.drawImage(bitmap(pick.over, season), sx, sy);
		// what stands on the tile reaches up over the tiles behind it
		if (pick.stand) g.drawImage(bitmap(pick.stand, season), sx, sy - RISE);
		if (pick.deposit) {
			g.drawImage(bitmap(pick.deposit, season), sx + pick.depositX, sy + pick.depositY);
		}
		if (pick.built) g.drawImage(bitmap(pick.built, season), sx, sy - RISE);
		const cloth = flags.get(j * CHUNK_TILES + i);
		if (cloth) {
			const icon = sprite(VILLAGE_ICON, { ...seasonRecolor(season), M: cloth as `#${string}` });
			g.drawImage(icon.canvas, sx, sy - RISE);
		}
	}
}

function forget(): void {
	if (chunks.size <= MAX_CHUNKS) return;
	const old = [...chunks.entries()].sort((a, b) => a[1].used - b[1].used);
	for (const [key] of old.slice(0, chunks.size - MAX_CHUNKS)) chunks.delete(key);
}

const visible: Visible[] = [];

export function drawMap(ctx: CanvasRenderingContext2D, state: DrawState, view: View): void {
	const { layers, living, camera } = state;
	if (layers !== forLayers || living !== forLiving) {
		chunks.clear();
		forLayers = layers;
		forLiving = living;
	}
	frame++;
	const season = ((state.season % 4) + 4) % 4;
	const villages = villageSignature(state.villages);
	const s = view.scale;
	const cx0 = Math.floor(view.x0 / CHUNK_TILES);
	const cy0 = Math.floor(view.y0 / CHUNK_TILES);
	const cx1 = Math.floor((view.x1 - 1) / CHUNK_TILES);
	const cy1 = Math.floor((view.y1 - 1) / CHUNK_TILES);

	// the chunks that reach the screen, back to front
	visible.length = 0;
	for (const [cx, cy] of chunkOrder(cx0, cy0, cx1, cy1)) {
		const at = chunkArt(cx, cy);
		const dx = view.originX + at.x * s;
		const dy = view.originY + at.y * s;
		if (
			dx + CHUNK_W * s <= 0 ||
			dy + CHUNK_H * s <= 0 ||
			dx >= camera.width ||
			dy >= camera.height
		) {
			continue;
		}
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
		let stale = false;
		let sigNow = chunk.sig;
		if (chunk.season !== season || chunk.villages !== villages || chunk.checked !== state.tick) {
			const sig = chunkSignature(living, layers.size, cx, cy);
			stale =
				!chunk.drawn || sig !== chunk.sig || chunk.season !== season || chunk.villages !== villages;
			if (!stale) chunk.checked = state.tick;
			sigNow = sig;
		}
		visible.push({ chunk, cx, cy, dx, dy, stale, sig: sigNow });
	}

	// rebuild the stale ones nearest the middle of the screen first; a chunk
	// that has to wait keeps showing its old picture (or nothing, the first time)
	const midX = camera.width / 2;
	const midY = camera.height / 2;
	const dist = (v: Visible) =>
		Math.hypot(v.dx + (CHUNK_W * s) / 2 - midX, v.dy + (CHUNK_H * s) / 2 - midY);
	const todo = visible.filter((v) => v.stale).sort((a, b) => dist(a) - dist(b));
	const started = performance.now();
	let rebuilt = 0;
	for (const v of todo) {
		if (rebuilt >= REBUILDS_PER_FRAME) break;
		if (rebuilt > 0 && performance.now() - started > REBUILD_MS) break;
		rebuilt++;
		drawChunk(v.chunk, state, v.cx, v.cy, season);
		v.chunk.sig = v.sig;
		v.chunk.season = season;
		v.chunk.villages = villages;
		v.chunk.checked = state.tick;
		v.chunk.drawn = true;
	}

	ctx.imageSmoothingEnabled = false;
	for (const v of visible) {
		if (!v.chunk.drawn) continue;
		ctx.drawImage(v.chunk.canvas, v.dx, v.dy, CHUNK_W * s, CHUNK_H * s);
	}
	forget();
}
