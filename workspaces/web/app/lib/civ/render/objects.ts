import { Biome, Built, Deposit, Ground, Water } from '../types';
import { drawSprite, Kind, SPECS } from './sprites';
import { hash, type DrawState, type Standing, type View } from './scene';

// Things that stand on the ground: trees, bushes, rocks, ore, and what people
// have built. Each is a `Standing` entry (foot y in tiles + a draw closure).
// To keep a frame cheap the entries come from a fixed pool: nothing is
// allocated per object per frame, and the closures only read from typed
// arrays filled during collect.
//
// Budget: at most MAX_OBJECTS entries per frame. Buildings and ore come first,
// then trees get up to 70 percent of the budget (thinned into fewer, bigger
// clumps when the view is crowded), then small things (bushes, rocks, grass,
// flowers) share what is left, an equal share per visible tile, which is zero
// when many tiles are on screen. So small things only show up when zoomed in.

export const MAX_OBJECTS = 3000;
const POOL = MAX_OBJECTS + 400;
const TREE_SHARE = 0.7;
const MAX_TREES_PER_TILE = 26;
// keep spots this far from a tile's edge so nothing lands in a neighbour
const EDGE = 0.04;

const TAU = Math.PI * 2;

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
const pScale = new Float32Array(POOL);
const pAlpha = new Float32Array(POOL);
const pool: (Standing | undefined)[] = new Array(POOL);

// entry kinds above the sprite kinds
const MARK_BUILT = 100; // + Built
const MARK_DEPOSIT = 200; // + Deposit
const LIVE_FIRE = 300;
const LIVE_KILN = 301;
const LIVE_FURNACE = 302;

let count = 0;
let outList: Standing[] = [];
let cur: DrawState;
let curPpm = 1;
let curSeason = 0;

function add(
	kind: number,
	v: number,
	x: number,
	y: number,
	scale: number,
	alpha: number,
	sortOff = 0
) {
	if (count >= POOL) return;
	const i = count++;
	let e = pool[i];
	if (!e) {
		e = { y: 0, draw: (ctx) => drawEntry(ctx, i) };
		pool[i] = e;
	}
	pKind[i] = kind;
	pVar[i] = v;
	pX[i] = x;
	pY[i] = y;
	pScale[i] = scale;
	pAlpha[i] = alpha;
	e.y = y + sortOff;
	outList.push(e);
}

// ------------------------------------------------------------------ collecting

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

// small buildings are shown a little larger than life when far, so they stay readable
const boost = (widthM: number, ppm: number) => Math.min(4, Math.max(1, 7 / (widthM * ppm)));
const widthOf = (kind: number) => SPECS[kind].l + SPECS[kind].r;

const spot = [0, 0];

export function collectObjects(state: DrawState, view: View, out: Standing[]): void {
	const { camera, layers, living } = state;
	cur = state;
	outList = out;
	count = 0;
	curPpm = view.ppm;
	curSeason = state.season & 3;
	const size = layers.size;
	const detail = view.detail;
	const ppm = view.ppm;

	// tiles that can touch the screen (objects reach a few metres past their tile)
	const a = camera.toWorld(0, 0);
	const b = camera.toWorld(camera.width, camera.height);
	const bx0 = Math.max(view.x0, Math.floor(a.x - 0.5));
	const by0 = Math.max(view.y0, Math.floor(a.y - 0.5));
	const bx1 = Math.min(view.x1, Math.ceil(b.x + 0.5));
	const by1 = Math.min(view.y1, Math.ceil(b.y + 0.5));
	if (bx1 <= bx0 || by1 <= by0) return;
	const nTiles = (bx1 - bx0) * (by1 - by0);

	// 1. buildings and ore, plus the cheap far-away markers
	const markerAlpha = 1 - detail;
	for (let ty = by0; ty < by1; ty++) {
		for (let tx = bx0; tx < bx1; tx++) {
			const i = ty * size + tx;
			const built = living.built[i];
			const dep = layers.deposit[i];
			if (built === Built.none && dep === Deposit.none) continue;
			if (markerAlpha > 0.01) {
				if (built !== Built.none) add(MARK_BUILT + built, 0, tx + 0.5, ty + 0.5, 1, markerAlpha);
				if (dep !== Deposit.none && view.zoom >= 8)
					add(MARK_DEPOSIT + dep, 0, tx + 0.5, ty + 0.5, 1, markerAlpha);
			}
			if (detail > 0.02) {
				if (built !== Built.none) addBuilt(built, tx, ty, ppm, detail, state.tick);
				if (dep !== Deposit.none) addDeposit(dep, tx, ty, detail, view.zoom);
			}
		}
	}
	if (detail <= 0.02) return;

	// 2. trees, thinned into bigger clumps when there are too many
	let total = 0;
	for (let ty = by0; ty < by1; ty++) {
		for (let tx = bx0; tx < bx1; tx++) {
			const i = ty * size + tx;
			if (living.built[i] !== Built.none || isWater(layers, i)) continue;
			total += treeCount(living.wood[i]);
		}
	}
	const ratio = keepRatio(total, Math.floor(MAX_OBJECTS * TREE_SHARE) - count);
	const clump = ratio > 0 ? Math.min(2.2, 1 / Math.sqrt(ratio)) : 1;
	if (ratio > 0) {
		for (let ty = by0; ty < by1; ty++) {
			for (let tx = bx0; tx < bx1; tx++) {
				const i = ty * size + tx;
				if (living.built[i] !== Built.none || isWater(layers, i)) continue;
				const n = treeCount(living.wood[i]);
				if (n === 0) continue;
				const k = keptCount(n, ratio, tx, ty);
				const biome = layers.biome[i];
				for (let j = 0; j < k && count < MAX_OBJECTS; j++) {
					scatter(tx, ty, j, 0, spot);
					const kind = treeKind(biome, hash(tx, ty, j, 5));
					const base = kind === Kind.scrub ? 0.8 : 0.75;
					const sc = (base + 0.5 * hash(tx, ty, j, 6)) * clump;
					add(kind, Math.floor(hash(tx, ty, j, 7) * 4), tx + spot[0], ty + spot[1], sc, detail);
				}
			}
		}
	}

	// 3. small things share what is left, evenly per tile
	const cap = Math.floor((MAX_OBJECTS - count) / nTiles);
	if (cap <= 0) return;
	const zoom = view.zoom;
	for (let ty = by0; ty < by1; ty++) {
		for (let tx = bx0; tx < bx1; tx++) {
			const i = ty * size + tx;
			if (living.built[i] !== Built.none || isWater(layers, i)) continue;
			addSmall(state, view, tx, ty, i, cap, zoom, detail);
		}
	}
}

function isWater(layers: DrawState['layers'], i: number): boolean {
	return layers.water[i] !== Water.none || layers.biome[i] === Biome.ocean;
}

function nearWater(layers: DrawState['layers'], tx: number, ty: number): boolean {
	const size = layers.size;
	for (let k = 0; k < 4; k++) {
		const x = tx + (k === 0 ? -1 : k === 1 ? 1 : 0);
		const y = ty + (k === 2 ? -1 : k === 3 ? 1 : 0);
		if (x < 0 || y < 0 || x >= size || y >= size) continue;
		const w = layers.water[y * size + x];
		if (w === Water.lake || w === Water.river || w === Water.spring) return true;
	}
	return false;
}

function addSmall(
	state: DrawState,
	_view: View,
	tx: number,
	ty: number,
	i: number,
	cap: number,
	zoom: number,
	detail: number
): void {
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

	if (zoom >= 24) {
		// boulders
		let n = rocky ? 1 + Math.floor(h0 * 2.5) : h0 > 0.93 ? 1 : 0;
		n = Math.min(n, left);
		for (let j = 0; j < n; j++, left--) {
			scatter(tx, ty, j, 3, spot);
			add(
				Kind.boulder,
				Math.floor(hash(tx, ty, j, 31) * 4),
				tx + spot[0],
				ty + spot[1],
				0.7 + 0.8 * hash(tx, ty, j, 32),
				detail
			);
		}
		// bushes, half of them berry bushes
		n = Math.min(bushCount(plants, biome), left);
		for (let j = 0; j < n; j++, left--) {
			scatter(tx, ty, j, 2, spot);
			add(
				j % 2 === 0 ? Kind.berry : Kind.bush,
				Math.floor(hash(tx, ty, j, 21) * 4),
				tx + spot[0],
				ty + spot[1],
				0.8 + 0.5 * hash(tx, ty, j, 22),
				detail
			);
		}
	}
	if (zoom >= 30 && left > 0 && biome !== Biome.mountain && biome !== Biome.hills) {
		// reeds in clumps, thick in wetland and thin along fresh water
		let n = 0;
		if (biome === Biome.wetland) n = 4 + Math.floor(h0 * 5);
		else if (nearWater(layers, tx, ty)) n = 1 + Math.floor(h0 * 3);
		n = Math.min(n, left);
		if (n > 0) scatter(tx, ty, 0, 5, spot);
		const cx = spot[0];
		const cy = spot[1];
		for (let j = 0; j < n; j++, left--) {
			const x = Math.min(1 - EDGE, Math.max(EDGE, cx + (hash(tx, ty, j, 41) - 0.5) * 0.2));
			const y = Math.min(1 - EDGE, Math.max(EDGE, cy + (hash(tx, ty, j, 42) - 0.5) * 0.12));
			add(
				Kind.reed,
				Math.floor(hash(tx, ty, j, 43) * 4),
				tx + x,
				ty + y,
				0.8 + 0.4 * hash(tx, ty, j, 44),
				detail
			);
		}
	}
	if (zoom >= 70 && left > 0) {
		const n = Math.min(rocky ? 4 : Math.floor(hash(tx, ty, 78) * 2.2), left);
		for (let j = 0; j < n; j++, left--) {
			scatter(tx, ty, j, 4, spot);
			add(Kind.stone, Math.floor(hash(tx, ty, j, 51) * 4), tx + spot[0], ty + spot[1], 1, detail);
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
	if (
		zoom >= 100 &&
		left > 0 &&
		season < 3 &&
		(biome === Biome.grassland || biome === Biome.scrub)
	) {
		let n = Math.round(plants * 5);
		n = Math.min(n, left);
		for (let j = 0; j < n; j++) {
			if (season === 2 && j % 3 !== 0) continue;
			scatter(tx, ty, j, 6, spot);
			add(Kind.flower, Math.floor(hash(tx, ty, j, 61) * 4), tx + spot[0], ty + spot[1], 1, detail);
			left--;
		}
	}
	if (zoom >= 80 && left > 0 && grassy) {
		const n = Math.min(Math.round(1 + plants * 9), left);
		for (let j = 0; j < n; j++) {
			scatter(tx, ty, j, 7, spot);
			add(
				Kind.tuft,
				Math.floor(hash(tx, ty, j, 71) * 4),
				tx + spot[0],
				ty + spot[1],
				0.8 + 0.6 * hash(tx, ty, j, 72),
				detail
			);
		}
	}
}

function addDeposit(dep: number, tx: number, ty: number, detail: number, zoom: number): void {
	const kind = DEPOSIT_KIND[dep];
	if (kind === undefined) return;
	const x = tx + 0.3 + 0.4 * hash(tx, ty, 1, 90);
	const y = ty + 0.4 + 0.3 * hash(tx, ty, 2, 90);
	const v = Math.floor(hash(tx, ty, 3, 90) * 4);
	const mine = widthOf(kind);
	const sc = (0.9 + 0.5 * hash(tx, ty, 4, 90)) * boost(mine, (zoom / 40) * 1.2);
	add(kind, v, x, y, sc, detail);
	// a few loose chunks around it
	if (zoom >= 40) {
		for (let k = 0; k < 3; k++) {
			const cx = Math.min(tx + 0.95, Math.max(tx + 0.05, x + (hash(tx, ty, k, 91) - 0.5) * 0.4));
			const cy = Math.min(ty + 0.95, Math.max(ty + 0.05, y + (hash(tx, ty, k, 92) - 0.3) * 0.3));
			add(kind, (v + k + 1) & 3, cx, cy, 0.3, detail);
		}
	}
}

function addBuilt(built: number, tx: number, ty: number, ppm: number, detail: number, _t: number) {
	const v = Math.floor(hash(tx, ty, 5, 95) * 4);
	switch (built) {
		case Built.camp: {
			const bs = boost(widthOf(Kind.tent), ppm);
			add(Kind.tent, v, tx + 0.33, ty + 0.36, bs, detail);
			add(Kind.tent, v + 1, tx + 0.68, ty + 0.4, bs, detail);
			add(Kind.tent, v + 2, tx + 0.5, ty + 0.72, bs, detail);
			add(Kind.fireRing, 0, tx + 0.5, ty + 0.52, bs, detail, -0.06);
			add(LIVE_FIRE, 0, tx + 0.5, ty + 0.52, bs, detail, 0.001);
			break;
		}
		case Built.hut:
			add(Kind.hut, v, tx + 0.5, ty + 0.58, boost(widthOf(Kind.hut), ppm), detail);
			break;
		case Built.kiln: {
			const bs = boost(widthOf(Kind.kiln), ppm);
			add(Kind.kiln, v, tx + 0.5, ty + 0.56, bs, detail);
			add(LIVE_KILN, 0, tx + 0.5, ty + 0.56, bs, detail, 0.001);
			break;
		}
		case Built.pen: {
			// fence runs: back, front with a gap for the gate, and two sides
			for (let k = -2; k <= 2; k++)
				add(Kind.fenceH, 0, tx + 0.5 + (k * 6) / 40, ty + 0.25, 1, detail);
			for (const k of [-2, -1, 1, 2])
				add(Kind.fenceH, 0, tx + 0.5 + (k * 6) / 40, ty + 0.75, 1, detail);
			add(Kind.fenceV, 0, tx + 0.5 - 15 / 40, ty + 0.75, 1, detail);
			add(Kind.fenceV, 0, tx + 0.5 + 15 / 40, ty + 0.75, 1, detail);
			break;
		}
		case Built.shrine: {
			add(Kind.altar, 0, tx + 0.5, ty + 0.5, 1, detail, -0.3);
			for (let j = 0; j < 8; j++) {
				const ang = (j / 8) * TAU + 0.2;
				add(
					Kind.standing,
					j,
					tx + 0.5 + (6 * Math.sin(ang)) / 40,
					ty + 0.5 + (3.4 * Math.cos(ang)) / 40,
					boost(2, ppm),
					detail
				);
			}
			break;
		}
		case Built.store:
			add(Kind.store, v, tx + 0.5, ty + 0.58, boost(widthOf(Kind.store), ppm), detail);
			break;
		case Built.furnace: {
			const bs = boost(widthOf(Kind.furnace), ppm);
			add(Kind.furnace, 0, tx + 0.5, ty + 0.58, bs, detail);
			add(LIVE_FURNACE, 0, tx + 0.5, ty + 0.58, bs, detail, 0.001);
			break;
		}
		default:
			break; // fields are part of the ground
	}
}

// -------------------------------------------------------------------- drawing

function drawEntry(ctx: CanvasRenderingContext2D, i: number): void {
	const cam = cur.camera;
	const sx = (pX[i] - cam.x) * cam.zoom + cam.width / 2;
	const sy = (pY[i] - cam.y) * cam.zoom + cam.height / 2;
	const kind = pKind[i];
	const alpha = pAlpha[i];
	if (alpha < 0.01) return;
	ctx.globalAlpha = alpha;
	if (kind < MARK_BUILT) {
		drawSprite(ctx, kind, pVar[i], curSeason, sx, sy, curPpm * pScale[i], cur.dpr);
	} else if (kind < MARK_DEPOSIT) {
		drawBuiltMarker(ctx, kind - MARK_BUILT, sx, sy, cam.zoom);
	} else if (kind < LIVE_FIRE) {
		drawDepositMarker(ctx, kind - MARK_DEPOSIT, sx, sy, cam.zoom);
	} else {
		drawLive(ctx, kind, sx, sy, curPpm * pScale[i], pX[i] * 7 + pY[i] * 13);
	}
	ctx.globalAlpha = 1;
}

const MARK_COLOR: Record<number, string> = {
	[Built.camp]: '#8a5a3c',
	[Built.hut]: '#b98458',
	[Built.field]: '#d9c35c',
	[Built.kiln]: '#7a4c46',
	[Built.pen]: '#8c6a45',
	[Built.shrine]: '#ebe5d2',
	[Built.store]: '#a47c52',
	[Built.furnace]: '#555a60'
};
const DEPOSIT_COLOR: Record<number, string> = {
	[Deposit.flint]: '#6d7378',
	[Deposit.clay]: '#b5653f',
	[Deposit.copper]: '#2fb596',
	[Deposit.tin]: '#c3ccd4',
	[Deposit.bogIron]: '#7a4b3a',
	[Deposit.obsidian]: '#1d1d28',
	[Deposit.salt]: '#ffffff',
	[Deposit.ochre]: '#d38b2c',
	[Deposit.meteorite]: '#7b5ac0'
};
const MARK_EDGE = 'rgba(0, 0, 0, 0.4)';

// The old overview shapes: a speck when tiny, a little glyph when there is room
function drawBuiltMarker(
	ctx: CanvasRenderingContext2D,
	built: number,
	cx: number,
	cy: number,
	s: number
) {
	ctx.fillStyle = MARK_COLOR[built] ?? '#888';
	ctx.strokeStyle = MARK_EDGE;
	ctx.lineWidth = 1;
	if (s < 4) {
		const half = Math.max(1, s * 0.35);
		ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
		return;
	}
	const h = s * 0.38;
	ctx.beginPath();
	switch (built) {
		case Built.camp:
			ctx.moveTo(cx, cy - h);
			ctx.lineTo(cx + h, cy + h * 0.8);
			ctx.lineTo(cx - h, cy + h * 0.8);
			ctx.closePath();
			break;
		case Built.field:
			ctx.rect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
			break;
		case Built.kiln:
			ctx.arc(cx, cy, h, 0, TAU);
			break;
		case Built.pen:
			ctx.rect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84);
			ctx.fillStyle = 'rgba(140, 106, 69, 0.35)';
			break;
		case Built.shrine:
			ctx.moveTo(cx, cy - h * 1.2);
			ctx.lineTo(cx + h * 0.8, cy);
			ctx.lineTo(cx, cy + h * 1.2);
			ctx.lineTo(cx - h * 0.8, cy);
			ctx.closePath();
			break;
		case Built.hut:
			ctx.moveTo(cx - h * 1.2, cy);
			ctx.lineTo(cx, cy - h * 1.1);
			ctx.lineTo(cx + h * 1.2, cy);
			ctx.lineTo(cx + h, cy + h);
			ctx.lineTo(cx - h, cy + h);
			ctx.closePath();
			break;
		default:
			ctx.rect(cx - h, cy - h * 0.8, h * 2, h * 1.6);
	}
	ctx.fill();
	ctx.stroke();
	if (built === Built.furnace || built === Built.kiln) {
		ctx.fillStyle = '#f2994a';
		ctx.fillRect(cx - h * 0.35, cy - h * 0.35, h * 0.7, h * 0.7);
	}
}

function drawDepositMarker(
	ctx: CanvasRenderingContext2D,
	dep: number,
	cx: number,
	cy: number,
	s: number
) {
	const r = s * 0.17;
	ctx.fillStyle = DEPOSIT_COLOR[dep] ?? '#999';
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(cx, cy - r);
	ctx.lineTo(cx + r, cy);
	ctx.lineTo(cx, cy + r);
	ctx.lineTo(cx - r, cy);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
}

// Flames, glow and smoke: drawn live each frame since they move
function drawLive(
	ctx: CanvasRenderingContext2D,
	kind: number,
	sx: number,
	sy: number,
	ppm: number,
	seed: number
) {
	const t = cur.now;
	const flick = Math.sin(t * 0.013 + seed) * 0.12 + Math.sin(t * 0.031 + seed * 2) * 0.08;
	if (kind === LIVE_FIRE) {
		const m = ppm;
		glow(ctx, sx, sy - 0.5 * m, 6 * m, 0.28 + flick * 0.3);
		const h = 1.7 * m * (1 + flick);
		flame(ctx, sx, sy - 0.1 * m, 0.55 * m, h, '#e8742a');
		flame(ctx, sx, sy - 0.1 * m, 0.38 * m, h * 0.72, '#f6c04a');
		flame(ctx, sx, sy - 0.1 * m, 0.2 * m, h * 0.4, '#fff2b0');
	} else if (kind === LIVE_KILN) {
		const m = ppm;
		glow(ctx, sx, sy - 0.8 * m, 4 * m, 0.3 + flick * 0.3);
		ctx.fillStyle = `rgba(255, 150, 50, ${0.75 + flick})`;
		ctx.beginPath();
		ctx.ellipse(sx, sy - 0.8 * m, 0.6 * m, 0.45 * m, 0, 0, TAU);
		ctx.fill();
		smoke(ctx, sx, sy - 3.7 * m, m, t, seed, 0.8);
	} else {
		const m = ppm;
		glow(ctx, sx, sy - 0.6 * m, 5 * m, 0.34 + flick * 0.3);
		ctx.fillStyle = `rgba(255, 140, 40, ${0.8 + flick})`;
		ctx.beginPath();
		ctx.moveTo(sx - 0.6 * m, sy);
		ctx.lineTo(sx - 0.6 * m, sy - 1.0 * m);
		ctx.quadraticCurveTo(sx, sy - 1.6 * m, sx + 0.6 * m, sy - 1.0 * m);
		ctx.lineTo(sx + 0.6 * m, sy);
		ctx.fill();
		smoke(ctx, sx, sy - 6.3 * m, m, t, seed, 1.2);
	}
}

function flame(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	color: string
) {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(x - w, y);
	ctx.quadraticCurveTo(x - w * 1.1, y - h * 0.55, x, y - h);
	ctx.quadraticCurveTo(x + w * 1.1, y - h * 0.55, x + w, y);
	ctx.closePath();
	ctx.fill();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
	if (r < 5) return;
	const g = ctx.createRadialGradient(x, y, 0, x, y, r);
	g.addColorStop(0, `rgba(255, 170, 70, ${Math.max(0, a)})`);
	g.addColorStop(1, 'rgba(255, 170, 70, 0)');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, TAU);
	ctx.fill();
}

function smoke(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	m: number,
	t: number,
	seed: number,
	strength: number
) {
	if (m < 0.6) return;
	for (let k = 0; k < 4; k++) {
		const p = (t / 3200 + k / 4 + seed * 0.37) % 1;
		const px = x + (Math.sin(p * 5 + k) * 0.8 + p * 1.8) * m;
		const py = y - p * 6 * m;
		ctx.fillStyle = `rgba(95, 95, 100, ${(1 - p) * 0.28 * strength})`;
		ctx.beginPath();
		ctx.arc(px, py, (0.4 + p * 1.1) * m, 0, TAU);
		ctx.fill();
	}
}
