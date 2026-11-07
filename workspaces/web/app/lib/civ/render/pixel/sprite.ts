import { PALETTE, type ColorName } from './palette';

// Pixel-art sprites written as text: each row is a string, each character a
// pixel, `.` is transparent, and `key` maps the other characters to palette
// colours. They are drawn once onto a small canvas at 1 art pixel per pixel
// and then scaled up by whole numbers with smoothing off, so they stay crisp.
//
//   const pine: SpriteDef = {
//     key: { d: 'leafDark', l: 'leaf', b: 'bark' },
//     foot: [3, 7],
//     rows: ['...l...', '..lll..', '.lldll.', 'llddddl', '...b...', '...b...']
//   };
//
// `foot` is the art pixel that sits on the ground at the thing's position
// (usually bottom middle); sorting and placement use it.

export type SpriteDef = {
	rows: string[];
	key: Record<string, ColorName | `#${string}`>;
	// art pixel [x, y] that stands on the thing's position
	foot?: [number, number];
};

export type Sprite = {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	w: number;
	h: number;
	footX: number;
	footY: number;
};

type Recolor = Record<string, ColorName | `#${string}`>;

const cache = new Map<SpriteDef, Map<string, Sprite>>();

function colorOf(c: ColorName | `#${string}`): string {
	return c.startsWith('#') ? c : PALETTE[c as ColorName];
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	return canvas;
}

// The pixels of a sprite as rgba strings (or null), for tests and tools that
// can't make a canvas.
export function pixels(def: SpriteDef, recolor?: Recolor): (string | null)[][] {
	return def.rows.map((row) =>
		[...row].map((ch) => {
			if (ch === '.' || ch === ' ') return null;
			const name = recolor?.[ch] ?? def.key[ch];
			if (!name) throw new Error(`sprite uses '${ch}' with no colour`);
			return colorOf(name);
		})
	);
}

// The sprite drawn onto its own canvas, optionally with some key characters
// mapped to other colours (a village's cloth, autumn leaves). Cached by the
// definition and the recolouring.
export function sprite(def: SpriteDef, recolor?: Recolor): Sprite {
	let byColor = cache.get(def);
	if (!byColor) {
		byColor = new Map();
		cache.set(def, byColor);
	}
	const id = recolor ? JSON.stringify(recolor) : '';
	const hit = byColor.get(id);
	if (hit) return hit;
	const grid = pixels(def, recolor);
	const h = grid.length;
	const w = Math.max(...grid.map((row) => row.length));
	const canvas = makeCanvas(w, h);
	const g = canvas.getContext('2d') as CanvasRenderingContext2D;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < grid[y].length; x++) {
			const c = grid[y][x];
			if (!c) continue;
			g.fillStyle = c;
			g.fillRect(x, y, 1, 1);
		}
	}
	const made: Sprite = {
		canvas,
		w,
		h,
		footX: def.foot?.[0] ?? Math.floor(w / 2),
		footY: def.foot?.[1] ?? h - 1
	};
	byColor.set(id, made);
	return made;
}

// Draws a sprite with its foot at screen point (sx, sy), `scale` screen
// pixels per art pixel, snapped to whole screen pixels. `flip` mirrors it
// left to right around the foot.
export function drawSprite(
	ctx: CanvasRenderingContext2D,
	s: Sprite,
	sx: number,
	sy: number,
	scale: number,
	flip = false
): void {
	const x = Math.round(sx - s.footX * scale);
	const y = Math.round(sy - s.footY * scale);
	ctx.imageSmoothingEnabled = false;
	if (!flip) {
		ctx.drawImage(s.canvas, x, y, s.w * scale, s.h * scale);
		return;
	}
	ctx.save();
	ctx.translate(Math.round(sx), 0);
	ctx.scale(-1, 1);
	ctx.drawImage(s.canvas, x - Math.round(sx), y, s.w * scale, s.h * scale);
	ctx.restore();
}
