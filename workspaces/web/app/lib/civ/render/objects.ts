import { Biome, Built, Deposit, Ground, Water } from '../types';
import { waterAt } from './ground';
import {
	FENCE_RUN,
	FIRE_FRAMES,
	Kind,
	chunkLook,
	flameLook,
	furnaceGlowLook,
	glowLook,
	kilnGlowLook,
	lookOf,
	puffAt,
	shadowLook,
	spriteOf
} from './pixel/localsprites';
import { drawSprite } from './pixel/sprite';
import { depthOf, hash, snapToArt, type DrawState, type Standing, type View } from './scene';

// Things that stand on the ground: trees, bushes, rocks, ore, and what people
// have built. Each is a `Standing` entry (its foot's depth, x + y in tiles in
// the isometric view, + a draw closure).
// To keep a frame cheap the entries come from a fixed pool: nothing is
// allocated per object per frame, and the closures only read from typed
// arrays filled during collect.
//
// Budget: at most MAX_OBJECTS entries per frame. Buildings and ore come first,
// then trees get up to 70 percent of the budget (thinned into fewer, bigger
// clumps when the view is crowded), then small things (bushes, rocks, grass,
// flowers) share what is left, an equal share per visible tile, which is zero
// when many tiles are on screen. So small things only show up when zoomed in.
//
// Every entry is a pixel sprite drawn at a whole art pixel (`snapToArt`, which
// lifts it to its tile's height) and a whole scale, with a flat 2:1 oval shadow
// under it. Footprints on the ground follow the diamond axes: a pen is a square
// of fence runs along x and y, with its posts as entries of their own.

export const MAX_OBJECTS = 3000;
const POOL = MAX_OBJECTS + 400;
const TREE_SHARE = 0.7;
const MAX_TREES_PER_TILE = 26;
// keep spots this far from a tile's edge so nothing lands in a neighbour
const EDGE = 0.04;

const TAU = Math.PI * 2;
// A pen is a square of fence along the tile's axes, a fifth of a tile (48 art
// pixels, one rail run) between posts, on a 4 x 4 grid of posts in tile
// fractions. Posts (x, y) are on the square's edge; runs are [x, y, alongY]:
// where they start, and whether they run along y (down and left) or x (down and
// right). The middle of the front is left open for a gate.
export const PEN_POSTS: [number, number][] = [];
export const PEN_RUNS: [number, number, boolean][] = [];
for (let i = 1; i <= 4; i++) {
	for (let j = 1; j <= 4; j++)
		if (i === 1 || i === 4 || j === 1 || j === 4) PEN_POSTS.push([i / 5, j / 5]);
}
for (let k = 1; k <= 3; k++) {
	PEN_RUNS.push([k / 5, 1 / 5, false], [1 / 5, k / 5, true], [4 / 5, k / 5, true]);
	if (k !== 2) PEN_RUNS.push([k / 5, 4 / 5, false]);
}
// a fence run sorts at its middle: after the post it starts at, before the one it ends at
const RUN_MID = FENCE_RUN / 240 / 2;

// ---------------------------------------------------------------- pure parts

export function treeCount(wood: number): number {
	const w = wood < 0 ? 0 : wood > 1 ? 1 : wood;
	if (w < 0.02) return 0;
	return Math.max(1, Math.round(w * MAX_TREES_PER_TILE));
}

// A stable spot inside a tile for the j-th thing of a kind (`salt` tells kinds apart)
export function scatter(tx: number, ty: number, j: number, salt: number, out: number[]): void {
	out[0] = EDGE + (1 - 2 * EDGE) * hash(tx, ty, j * 8 + salt, 1);
	out[1] = EDGE + (1 - 2 * EDGE) * hash(tx, ty, j * 8 + salt, 2);
}

export function treeKind(biome: number, h: number): Kind {
	switch (biome) {
		case Biome.forest:
			return h < 0.78 ? Kind.oak : Kind.conifer;
		case Biome.hills:
		case Biome.mountain:
		case Biome.snow:
			return h < 0.8 ? Kind.conifer : Kind.scrub;
		case Biome.scrub:
			return h < 0.7 ? Kind.scrub : Kind.oak;
		default:
			return Kind.oak;
	}
}

export function bushCount(plants: number, biome: number): number {
	if (biome === Biome.mountain || biome === Biome.snow || biome === Biome.ocean) return 0;
	return Math.round((plants < 0 ? 0 : plants > 1 ? 1 : plants) * 4);
}

// The share of things to keep when `total` wouldn't fit in `room`. It moves in
// coarse steps so things don't pop in and out while panning.
export function keepRatio(total: number, room: number): number {
	if (total <= 0 || total <= room) return 1;
	if (room <= 0) return 0;
	const r = room / total;
	return Math.max(1 / 64, Math.pow(2, -Math.ceil(-Math.log2(r) * 2) / 2));
}

// How many of a tile's `n` things to draw at `ratio`; the odd one is decided
// by the tile so sparse tiles still get some.
export function keptCount(n: number, ratio: number, tx: number, ty: number): number {
	if (ratio >= 1) return n;
	return Math.min(n, Math.floor(n * ratio + hash(tx, ty, 99)));
}

// ------------------------------------------------------------------- the pool

const pKind = new Int16Array(POOL);
const pVar = new Uint8Array(POOL);
const pX = new Float32Array(POOL);
const pY = new Float32Array(POOL);
const pool: (Standing | undefined)[] = new Array(POOL);

// entry kinds above the sprite kinds: things that move
const LIVE_FIRE = 300;
const LIVE_KILN = 301;
const LIVE_FURNACE = 302;

// the high bit of a variant mirrors the sprite, so rows of the same tree differ
const FLIP = 128;
const FLIPPABLE = new Set<number>([
	Kind.oak,
	Kind.conifer,
	Kind.scrub,
	Kind.bush,
	Kind.berry,
	Kind.tuft,
	Kind.reed,
	Kind.boulder,
	Kind.stone,
	Kind.flint,
	Kind.clay,
	Kind.copper,
	Kind.tin,
	Kind.bogIron,
	Kind.obsidian,
	Kind.salt,
	Kind.ochre,
	Kind.meteorite,
	Kind.chunk
]);

let count = 0;
let outList: Standing[] = [];
let cur: DrawState;
let curView: View;
let curSeason = 0;

function add(kind: number, v: number, x: number, y: number, sortOff = 0) {
	if (count >= POOL) return;
	const i = count++;
	let e = pool[i];
	if (!e) {
		e = { y: 0, draw: (ctx) => drawEntry(ctx, i) };
		pool[i] = e;
	}
	if (FLIPPABLE.has(kind) && hash(Math.round(x * 4096), Math.round(y * 4096), 5) < 0.5) v |= FLIP;
	pKind[i] = kind;
	pVar[i] = v;
	pX[i] = x;
	pY[i] = y;
	e.y = depthOf(curView, x, y) + sortOff;
	outList.push(e);
}

// ------------------------------------------------------------------ collecting

// How far past a tile's diamond its things can reach on screen, in art
// pixels: sideways (wide huts, shadows), up (tall trees, smoke) and down
const REACH_X = 60;
const REACH_UP = 90;
const REACH_DOWN = 20;

// Could anything standing on this tile show on screen? The screen is a
// rotated rectangle on the ground, so the view's tile box has many tiles
// that are off it; counting only the visible ones keeps the share of small
// things per tile true.
export function tileOnScreen(view: View, width: number, height: number, tx: number, ty: number) {
	const art = view.artPerTile;
	const s = view.scale;
	const size = Math.sqrt(view.levels.length);
	const top = (tx + ty) * (art / 2) - view.levels[ty * size + tx] * view.liftArt;
	const left = view.originX + ((tx - ty) * art - art - REACH_X) * s;
	const y = view.originY + (top - REACH_UP) * s;
	return (
		left + (art * 2 + REACH_X * 2) * s > 0 &&
		left < width &&
		y + (art + REACH_UP + REACH_DOWN) * s > 0 &&
		y < height
	);
}

const visX: number[] = [];
const visY: number[] = [];

const DEPOSIT_KIND: Record<number, Kind> = {
	[Deposit.flint]: Kind.flint,
	[Deposit.clay]: Kind.clay,
	[Deposit.copper]: Kind.copper,
	[Deposit.tin]: Kind.tin,
	[Deposit.bogIron]: Kind.bogIron,
	[Deposit.obsidian]: Kind.obsidian,
	[Deposit.salt]: Kind.salt,
	[Deposit.ochre]: Kind.ochre,
	[Deposit.meteorite]: Kind.meteorite
};

const spot = [0, 0];

export function collectObjects(state: DrawState, view: View, out: Standing[]): void {
	// the close-up scene only: further out the map layers draw the buildings
	if (view.mode !== 'local') return;
	const { camera, layers, living } = state;
	cur = state;
	curView = view;
	outList = out;
	count = 0;
	curSeason = state.season & 3;
	const size = layers.size;

	// tiles that can touch the screen
	let nTiles = 0;
	let bx0 = size;
	let by0 = size;
	let bx1 = 0;
	let by1 = 0;
	for (let ty = view.y0; ty < view.y1; ty++) {
		for (let tx = view.x0; tx < view.x1; tx++) {
			if (!tileOnScreen(view, camera.width, camera.height, tx, ty)) continue;
			visX[nTiles] = tx;
			visY[nTiles] = ty;
			nTiles++;
			bx0 = Math.min(bx0, tx);
			by0 = Math.min(by0, ty);
			bx1 = Math.max(bx1, tx + 1);
			by1 = Math.max(by1, ty + 1);
		}
	}
	if (nTiles === 0) return;

	// villages whose clearing can reach the tiles being drawn
	villageCount = 0;
	for (const v of state.villages) {
		if (v.x < bx0 - 3 || v.x > bx1 + 3 || v.y < by0 - 3 || v.y > by1 + 3) continue;
		vxs[villageCount] = v.x + 0.5;
		vys[villageCount] = v.y + 0.5;
		villageCount++;
	}

	// 1. buildings and ore
	for (let k = 0; k < nTiles; k++) {
		const tx = visX[k];
		const ty = visY[k];
		const i = ty * size + tx;
		const built = living.built[i];
		const dep = layers.deposit[i];
		if (built !== Built.none) addBuilt(built, tx, ty);
		if (dep !== Deposit.none) addDeposit(dep, tx, ty);
	}

	// 2. trees, thinned into bigger clumps when there are too many
	let total = 0;
	for (let k = 0; k < nTiles; k++) {
		const i = visY[k] * size + visX[k];
		if (living.built[i] !== Built.none || isOpenWater(layers, i)) continue;
		total += treeCount(living.wood[i]);
	}
	const ratio = keepRatio(total, Math.floor(MAX_OBJECTS * TREE_SHARE) - count);
	if (ratio > 0) {
		for (let t = 0; t < nTiles; t++) {
			const tx = visX[t];
			const ty = visY[t];
			const i = ty * size + tx;
			if (living.built[i] !== Built.none || isOpenWater(layers, i)) continue;
			const n = treeCount(living.wood[i]);
			if (n === 0) continue;
			const k = keptCount(n, ratio, tx, ty);
			const biome = layers.biome[i];
			for (let j = 0; j < k && count < MAX_OBJECTS; j++) {
				scatter(tx, ty, j, 0, spot);
				const kind = treeKind(biome, hash(tx, ty, j, 5));
				put(kind, Math.floor(hash(tx, ty, j, 7) * 4), tx + spot[0], ty + spot[1]);
			}
		}
	}

	// 3. small things share what is left, evenly per tile
	const cap = Math.floor((MAX_OBJECTS - count) / nTiles);
	if (cap <= 0) return;
	for (let k = 0; k < nTiles; k++) {
		const tx = visX[k];
		const ty = visY[k];
		const i = ty * size + tx;
		if (living.built[i] !== Built.none || isOpenWater(layers, i)) continue;
		addSmall(state, tx, ty, i, cap);
	}
}

// lakes and sea; river tiles are mostly bank, and `put` keeps things out of the channel
function isOpenWater(layers: DrawState['layers'], i: number): boolean {
	const w = layers.water[i];
	return (w !== Water.none && w !== Water.river) || layers.biome[i] === Biome.ocean;
}

// Place a thing unless it would stand in a river channel, or (for trees and
// bushes) in a village clearing.
function put(kind: number, v: number, x: number, y: number) {
	const layers = cur.layers;
	if (
		layers.water[Math.floor(y) * layers.size + Math.floor(x)] === Water.river &&
		waterAt(layers, x, y)
	)
		return;
	if (
		villageCount > 0 &&
		(kind === Kind.oak ||
			kind === Kind.conifer ||
			kind === Kind.scrub ||
			kind === Kind.bush ||
			kind === Kind.berry) &&
		hash(Math.round(x * 4096), Math.round(y * 4096), 11) >=
			clearFactor(x, y, vxs, vys, villageCount)
	)
		return;
	add(kind, v, x, y);
}

// 0 at a village centre, rising to 1 about 2 tiles out: the share of trees and
// bushes allowed to stay. Depends only on position, so nothing pops.
export function clearFactor(
	x: number,
	y: number,
	vx: ArrayLike<number>,
	vy: ArrayLike<number>,
	n: number
): number {
	let f = 1;
	for (let k = 0; k < n; k++) {
		const t = (Math.hypot(x - vx[k], y - vy[k]) - 0.6) / 1.5;
		const s = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
		if (s < f) f = s;
	}
	return f;
}

const vxs: number[] = [];
const vys: number[] = [];
let villageCount = 0;

function nearWater(layers: DrawState['layers'], tx: number, ty: number): boolean {
	const size = layers.size;
	if (layers.water[ty * size + tx] === Water.river) return true;
	for (let k = 0; k < 4; k++) {
		const x = tx + (k === 0 ? -1 : k === 1 ? 1 : 0);
		const y = ty + (k === 2 ? -1 : k === 3 ? 1 : 0);
		if (x < 0 || y < 0 || x >= size || y >= size) continue;
		const w = layers.water[y * size + x];
		if (w === Water.lake || w === Water.river || w === Water.spring) return true;
	}
	return false;
}

function addSmall(state: DrawState, tx: number, ty: number, i: number, cap: number): void {
	const { layers, living } = state;
	const biome = layers.biome[i];
	const ground = layers.ground[i];
	const plants = living.plants[i];
	const season = curSeason;
	let left = cap;
	const rocky =
		ground === Ground.rock ||
		biome === Biome.hills ||
		biome === Biome.mountain ||
		biome === Biome.snow;
	const h0 = hash(tx, ty, 77);

	// boulders
	let n = rocky ? 1 + Math.floor(h0 * 2.5) : h0 > 0.93 ? 1 : 0;
	n = Math.min(n, left);
	for (let j = 0; j < n; j++, left--) {
		scatter(tx, ty, j, 3, spot);
		put(Kind.boulder, Math.floor(hash(tx, ty, j, 31) * 4), tx + spot[0], ty + spot[1]);
	}
	// bushes, half of them berry bushes
	n = Math.min(bushCount(plants, biome), left);
	for (let j = 0; j < n; j++, left--) {
		scatter(tx, ty, j, 2, spot);
		put(
			j % 2 === 0 ? Kind.berry : Kind.bush,
			Math.floor(hash(tx, ty, j, 21) * 3),
			tx + spot[0],
			ty + spot[1]
		);
	}
	if (left > 0 && biome !== Biome.mountain && biome !== Biome.hills) {
		// reeds in clumps, thick in wetland and thin along fresh water
		let m = 0;
		if (biome === Biome.wetland) m = 4 + Math.floor(h0 * 5);
		else if (nearWater(layers, tx, ty)) m = 1 + Math.floor(h0 * 3);
		m = Math.min(m, left);
		if (m > 0) scatter(tx, ty, 0, 5, spot);
		const cx = spot[0];
		const cy = spot[1];
		for (let j = 0; j < m; j++, left--) {
			const x = Math.min(1 - EDGE, Math.max(EDGE, cx + (hash(tx, ty, j, 41) - 0.5) * 0.2));
			const y = Math.min(1 - EDGE, Math.max(EDGE, cy + (hash(tx, ty, j, 42) - 0.5) * 0.12));
			put(Kind.reed, Math.floor(hash(tx, ty, j, 43) * 2), tx + x, ty + y);
		}
	}
	if (left > 0) {
		const m = Math.min(rocky ? 4 : Math.floor(hash(tx, ty, 78) * 2.2), left);
		for (let j = 0; j < m; j++, left--) {
			scatter(tx, ty, j, 4, spot);
			put(Kind.stone, Math.floor(hash(tx, ty, j, 51) * 3), tx + spot[0], ty + spot[1]);
		}
	}
	const grassy =
		ground !== Ground.rock &&
		ground !== Ground.sand &&
		(biome === Biome.grassland ||
			biome === Biome.forest ||
			biome === Biome.scrub ||
			biome === Biome.wetland ||
			biome === Biome.hills);
	if (left > 0 && season < 3 && (biome === Biome.grassland || biome === Biome.scrub)) {
		let m = Math.round(plants * 5);
		m = Math.min(m, left);
		for (let j = 0; j < m; j++) {
			if (season === 2 && j % 3 !== 0) continue;
			scatter(tx, ty, j, 6, spot);
			put(Kind.flower, Math.floor(hash(tx, ty, j, 61) * 4), tx + spot[0], ty + spot[1]);
			left--;
		}
	}
	if (left > 0 && grassy) {
		const m = Math.min(Math.round(1 + plants * 9), left);
		for (let j = 0; j < m; j++) {
			scatter(tx, ty, j, 7, spot);
			put(Kind.tuft, Math.floor(hash(tx, ty, j, 71) * 3), tx + spot[0], ty + spot[1]);
		}
	}
}

function addDeposit(dep: number, tx: number, ty: number): void {
	const kind = DEPOSIT_KIND[dep];
	if (kind === undefined) return;
	const x = tx + 0.3 + 0.4 * hash(tx, ty, 1, 90);
	const y = ty + 0.4 + 0.3 * hash(tx, ty, 2, 90);
	const v = Math.floor(hash(tx, ty, 3, 90) * 2);
	add(kind, v, x, y);
	// a few loose chunks around it, in its colours (the variant holds which ore)
	for (let k = 0; k < 3; k++) {
		const cx = Math.min(tx + 0.95, Math.max(tx + 0.05, x + (hash(tx, ty, k, 91) - 0.5) * 0.4));
		const cy = Math.min(ty + 0.95, Math.max(ty + 0.05, y + (hash(tx, ty, k, 92) - 0.3) * 0.3));
		add(Kind.chunk, kind, cx, cy);
	}
}

function addBuilt(built: number, tx: number, ty: number) {
	const v = Math.floor(hash(tx, ty, 5, 95) * 4);
	switch (built) {
		case Built.camp: {
			add(Kind.tent, v, tx + 0.33, ty + 0.36);
			add(Kind.tent, v + 1, tx + 0.68, ty + 0.4);
			add(Kind.tent, v + 2, tx + 0.5, ty + 0.72);
			add(Kind.fireRing, 0, tx + 0.5, ty + 0.52, -0.0005);
			add(LIVE_FIRE, 0, tx + 0.5, ty + 0.52, 0.0005);
			break;
		}
		case Built.hut:
			add(Kind.hut, v, tx + 0.5, ty + 0.58);
			break;
		case Built.kiln:
			add(Kind.kiln, v, tx + 0.5, ty + 0.56);
			add(LIVE_KILN, 0, tx + 0.5, ty + 0.56, 0.0005);
			break;
		case Built.pen:
			for (const [x, y] of PEN_POSTS) add(Kind.fenceV, 0, tx + x, ty + y);
			// a run starts at its post; mirrored (FLIP) it runs down and left, along y
			for (const [x, y, alongY] of PEN_RUNS)
				add(Kind.fenceH, alongY ? FLIP : 0, tx + x, ty + y, RUN_MID);
			break;
		case Built.shrine: {
			add(Kind.altar, 0, tx + 0.5, ty + 0.5, -0.3);
			// a ring of stones, round on the ground
			for (let j = 0; j < 8; j++) {
				const ang = (j / 8) * TAU + 0.2;
				add(
					Kind.standing,
					j,
					tx + 0.5 + (30 * Math.sin(ang)) / 240,
					ty + 0.5 + (30 * Math.cos(ang)) / 240
				);
			}
			break;
		}
		case Built.store:
			add(Kind.store, v, tx + 0.5, ty + 0.58);
			break;
		case Built.furnace:
			add(Kind.furnace, 0, tx + 0.5, ty + 0.58);
			add(LIVE_FURNACE, 0, tx + 0.5, ty + 0.58, 0.0005);
			break;
		default:
			break; // fields are part of the ground
	}
}

// -------------------------------------------------------------------- drawing

// the ground is painted at 6 art pixels a metre; shadows fall down and right
const SHADOW_DX = 2;
const SHADOW_DY = 1;

function drawEntry(ctx: CanvasRenderingContext2D, i: number): void {
	const view = curView;
	const kind = pKind[i];
	const at = snapToArt(view, pX[i], pY[i]);
	const scale = view.scale;
	if (kind >= LIVE_FIRE) {
		drawLive(ctx, kind, at.x, at.y, scale, pX[i] * 7 + pY[i] * 13);
		return;
	}
	const flip = pVar[i] >= FLIP;
	const v = pVar[i] & (FLIP - 1);
	const look = kind === Kind.chunk ? chunkLook(v) : lookOf(kind, v, curSeason);
	const shadow = shadowLook(kind);
	if (shadow) {
		ctx.globalAlpha = 0.35;
		drawSprite(
			ctx,
			spriteOf(shadow),
			at.x + SHADOW_DX * scale * (flip ? -1 : 1),
			at.y + SHADOW_DY * scale,
			scale
		);
		ctx.globalAlpha = 1;
	}
	drawSprite(ctx, spriteOf(look), at.x, at.y, scale, flip);
}

// Flames, glow and smoke: frames picked from the clock, a few a second
function drawLive(
	ctx: CanvasRenderingContext2D,
	kind: number,
	sx: number,
	sy: number,
	scale: number,
	seed: number
) {
	const t = cur.now;
	const art = (n: number) => Math.round(n) * scale;
	if (kind === LIVE_FIRE) {
		const frame = Math.floor(t / 170 + seed) % FIRE_FRAMES;
		ctx.globalAlpha = 0.16 + (frame & 1) * 0.06;
		drawSprite(ctx, spriteOf(glowLook(30, 18)), sx, sy - art(2), scale);
		ctx.globalAlpha = 1;
		drawSprite(ctx, spriteOf(flameLook(frame)), sx, sy - art(1), scale);
		return;
	}
	const frame = Math.floor(t / 220 + seed) % 3;
	if (kind === LIVE_KILN) {
		ctx.globalAlpha = 0.14 + (frame & 1) * 0.05;
		drawSprite(ctx, spriteOf(glowLook(18, 10)), sx, sy - art(1), scale);
		ctx.globalAlpha = 1;
		drawSprite(ctx, spriteOf(kilnGlowLook(frame)), sx, sy, scale);
		smoke(ctx, sx, sy - art(13), scale, t, seed);
	} else {
		ctx.globalAlpha = 0.16 + (frame & 1) * 0.05;
		drawSprite(ctx, spriteOf(glowLook(20, 11)), sx, sy - art(1), scale);
		ctx.globalAlpha = 1;
		drawSprite(ctx, spriteOf(furnaceGlowLook(frame)), sx, sy, scale);
		smoke(ctx, sx, sy - art(23), scale, t, seed);
	}
}

// Three puffs rising and thinning, each moving a whole art pixel at a time
function smoke(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	scale: number,
	t: number,
	seed: number
) {
	for (let k = 0; k < 3; k++) {
		const p = (t / 3200 + k / 3 + seed * 0.37) % 1;
		const px = x + Math.round(Math.sin(p * 5 + k) * 2 + p * 5) * scale;
		const py = y - Math.round(p * 24) * scale;
		ctx.globalAlpha = (1 - p) * 0.6;
		drawSprite(ctx, spriteOf(puffAt(p < 0.33 ? 0 : p < 0.66 ? 1 : 2)), px, py, scale);
	}
	ctx.globalAlpha = 1;
}
