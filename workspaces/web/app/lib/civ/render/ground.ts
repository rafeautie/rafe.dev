import { SEA_LEVEL } from '../config';
import { Biome, Built, Deposit, Ground, Water } from '../types';
import { tileColor } from './palette';
import { hash, type DrawState, type View } from './scene';
// (View is the part of the map on screen and how close we are)
import { makeCanvas } from './sprites';

// The ground up close: blended colour, texture, shores, water, fields and
// worn paths. Drawn flat, under everything that stands up, fading in with
// `view.detail` over the overview map so zooming feels continuous.
//
// The base colour is a small texture (a few texels per tile) blended between
// neighbouring tiles' palette colours and stretched with smoothing, so tile
// edges melt into each other. Water is vector shapes with wobbly shores drawn
// on top, so shores stay sharp however far you zoom.

const TAU = Math.PI * 2;

type Rgba = readonly [number, number, number, number];
// how each ground type pulls the biome colour (r, g, b, amount)
const GROUND_TINT: (Rgba | null)[] = [
	[0xdc, 0xcb, 0x9c, 0.55], // sand
	null, // loam
	[0xb8, 0x7c, 0x58, 0.45], // clay
	[0x8e, 0x8c, 0x88, 0.55], // rock
	[0xe6, 0xe2, 0xd2, 0.45], // chalk
	[0x5f, 0x6c, 0x4a, 0.5] // bog
];
// the bed under water tiles, so beaches blend toward wet sand
const WET_SAND: [number, number, number] = [0xc4, 0xb4, 0x86];

const SOIL = ['#6e4f35', '#7a5a3a', '#8a6a40', '#6a5848'];
const BLADE_DARK = [
	'rgba(60,110,45,0.55)',
	'rgba(50,95,40,0.55)',
	'rgba(140,110,40,0.55)',
	'rgba(120,110,85,0.5)'
];
const BLADE_LIGHT = [
	'rgba(175,215,110,0.5)',
	'rgba(190,215,110,0.45)',
	'rgba(215,185,90,0.5)',
	'rgba(200,195,170,0.45)'
];

// scratch space reused between frames
let tex: {
	canvas: ReturnType<typeof makeCanvas>;
	g: CanvasRenderingContext2D;
	img: ImageData;
} | null = null;
let cr = new Uint8Array(0);
let cg = new Uint8Array(0);
let cb = new Uint8Array(0);
let wf = new Uint8Array(0); // 1 = water, with a tile of padding all round

// this frame's numbers, so helpers don't need long argument lists
let ctx: CanvasRenderingContext2D;
let st: DrawState;
let zoom = 1;
let ppm = 1;
let X0 = 0;
let Y0 = 0;
let bx0 = 0;
let by0 = 0;
let bx1 = 0;
let by1 = 0;
let pw = 0;
let dens = 0;
let season = 0;

const tileX = (tx: number) => X0 + (tx - bx0) * zoom;
const tileY = (ty: number) => Y0 + (ty - by0) * zoom;
const isWater = (layers: DrawState['layers'], i: number) =>
	layers.water[i] !== Water.none || layers.biome[i] === Biome.ocean;

export function drawGround(c: CanvasRenderingContext2D, state: DrawState, view: View): void {
	const detail = view.detail;
	if (detail <= 0.001) return;
	ctx = c;
	st = state;
	zoom = view.zoom;
	ppm = view.ppm;
	season = state.season & 3;
	const cam = state.camera;
	bx0 = view.x0;
	by0 = view.y0;
	bx1 = view.x1;
	by1 = view.y1;
	const w = bx1 - bx0;
	const h = by1 - by0;
	if (w <= 0 || h <= 0) return;
	X0 = (bx0 - cam.x) * zoom + cam.width / 2;
	Y0 = (by0 - cam.y) * zoom + cam.height / 2;
	pw = w + 2;
	// how much texture each tile can afford: lots when few tiles are on screen
	dens = Math.min(400, Math.max(2, 5200 / (w * h)));

	const smoothing = ctx.imageSmoothingEnabled;
	ctx.globalAlpha = detail;
	buildTiles(w, h);
	paintBase(w, h);
	paintWorn();
	paintDecor();
	paintFields();
	paintWater();
	ctx.globalAlpha = 1;
	ctx.imageSmoothingEnabled = smoothing;
	ctx.setLineDash([]);
}

// ------------------------------------------------------------ base colour

function landColor(i: number): number {
	const { layers, living } = st;
	const c = tileColor(i, layers, living, season);
	const biome = layers.biome[i];
	if (biome === Biome.snow || biome === Biome.ocean) return c;
	const t = GROUND_TINT[layers.ground[i]];
	if (!t) return c;
	const f = (s: number, to: number) => ((c >> s) & 255) * (1 - t[3]) + to * t[3];
	return (Math.round(f(16, t[0])) << 16) | (Math.round(f(8, t[1])) << 8) | Math.round(f(0, t[2]));
}

function buildTiles(w: number, h: number): void {
	const { layers } = st;
	const size = layers.size;
	const n = (w + 2) * (h + 2);
	if (cr.length < n) {
		cr = new Uint8Array(n);
		cg = new Uint8Array(n);
		cb = new Uint8Array(n);
		wf = new Uint8Array(n);
	}
	for (let yy = -1; yy <= h; yy++) {
		const ty = Math.min(size - 1, Math.max(0, by0 + yy));
		for (let xx = -1; xx <= w; xx++) {
			const tx = Math.min(size - 1, Math.max(0, bx0 + xx));
			const i = ty * size + tx;
			const p = (yy + 1) * pw + xx + 1;
			if (isWater(layers, i)) {
				wf[p] = 1;
				cr[p] = WET_SAND[0];
				cg[p] = WET_SAND[1];
				cb[p] = WET_SAND[2];
			} else {
				wf[p] = 0;
				const c = landColor(i);
				cr[p] = c >> 16;
				cg[p] = (c >> 8) & 255;
				cb[p] = c & 255;
			}
		}
	}
}

function paintBase(w: number, h: number): void {
	const k = zoom > 300 ? 8 : zoom >= 40 ? 4 : 2;
	const tw = w * k;
	const th = h * k;
	if (!tex || tex.canvas.width !== tw || tex.canvas.height !== th) {
		const canvas = makeCanvas(tw, th);
		const g = canvas.getContext('2d') as CanvasRenderingContext2D;
		tex = { canvas, g, img: g.createImageData(tw, th) };
	}
	const data = tex.img.data;
	// each texel leans toward the nearer neighbours in x and y, bilinearly
	const wt = new Float32Array(k);
	const dir = new Int8Array(k);
	for (let a = 0; a < k; a++) {
		const u = (a + 0.5) / k;
		wt[a] = Math.abs(u - 0.5);
		dir[a] = u < 0.5 ? -1 : 1;
	}
	for (let ty = 0; ty < h; ty++) {
		for (let tx = 0; tx < w; tx++) {
			const p = (ty + 1) * pw + tx + 1;
			for (let b = 0; b < k; b++) {
				const wy = wt[b];
				const py = p + dir[b] * pw;
				for (let a = 0; a < k; a++) {
					const wx = wt[a];
					const px = p + dir[a];
					const pxy = py + dir[a];
					const w00 = (1 - wx) * (1 - wy);
					const w10 = wx * (1 - wy);
					const w01 = (1 - wx) * wy;
					const w11 = wx * wy;
					const o = ((ty * k + b) * tw + tx * k + a) * 4;
					data[o] = cr[p] * w00 + cr[px] * w10 + cr[py] * w01 + cr[pxy] * w11;
					data[o + 1] = cg[p] * w00 + cg[px] * w10 + cg[py] * w01 + cg[pxy] * w11;
					data[o + 2] = cb[p] * w00 + cb[px] * w10 + cb[py] * w01 + cb[pxy] * w11;
					data[o + 3] = 255;
				}
			}
		}
	}
	tex.g.putImageData(tex.img, 0, 0);
	ctx.imageSmoothingEnabled = true;
	ctx.drawImage(tex.canvas, 0, 0, tw, th, X0, Y0, w * zoom, h * zoom);
}

// ------------------------------------------------- paths, trampling, stains

const WORN = new Set<number>([
	Built.camp,
	Built.hut,
	Built.store,
	Built.kiln,
	Built.furnace,
	Built.shrine
]);

function blob(x: number, y: number, rx: number, ry: number): void {
	ctx.beginPath();
	ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
	ctx.fill();
}

function paintWorn(): void {
	const { layers, living, villages, camera } = st;
	const size = layers.size;

	// trampled earth round buildings, stains round ore, straw in pens
	for (let ty = by0; ty < by1; ty++) {
		for (let tx = bx0; tx < bx1; tx++) {
			const i = ty * size + tx;
			const built = living.built[i];
			const dep = layers.deposit[i];
			if (built === Built.none && dep === Deposit.none) continue;
			const x = tileX(tx);
			const y = tileY(ty);
			if (WORN.has(built)) {
				ctx.fillStyle = 'rgba(120, 92, 58, 0.2)';
				const big = built === Built.camp ? 1.3 : 1;
				for (let j = 0; j < 9; j++) {
					const a = hash(tx, ty, j, 20) * TAU;
					const d = Math.sqrt(hash(tx, ty, j, 21)) * 0.3 * big;
					const r = (0.1 + 0.12 * hash(tx, ty, j, 22)) * zoom;
					blob(
						x + (0.5 + Math.cos(a) * d) * zoom,
						y + (0.55 + Math.sin(a) * d) * zoom,
						r,
						r * 0.75
					);
				}
			} else if (built === Built.pen) {
				ctx.fillStyle = 'rgba(125, 95, 60, 0.35)';
				ctx.fillRect(x + 0.125 * zoom, y + 0.25 * zoom, 0.75 * zoom, 0.5 * zoom);
				ctx.fillStyle = 'rgba(214, 190, 110, 0.5)';
				const sp = Math.max(1, 0.25 * ppm);
				const n = Math.min(80, Math.floor(dens * 0.5));
				for (let j = 0; j < n; j++)
					ctx.fillRect(
						x + (0.14 + 0.72 * hash(tx, ty, j, 23)) * zoom,
						y + (0.27 + 0.46 * hash(tx, ty, j, 24)) * zoom,
						sp * 3,
						sp
					);
			}
			if (dep !== Deposit.none) stain(dep, tx, ty, x, y);
		}
	}

	// worn tracks from each village centre to the buildings around it
	if (villages.length === 0) return;
	const p = new Path2D();
	for (const v of villages) {
		if (v.x < bx0 - 6 || v.x > bx1 + 6 || v.y < by0 - 6 || v.y > by1 + 6) continue;
		const cx = (v.x + 0.5 - camera.x) * zoom + camera.width / 2;
		const cy = (v.y + 0.5 - camera.y) * zoom + camera.height / 2;
		ctx.fillStyle = 'rgba(120, 92, 58, 0.16)';
		for (let j = 0; j < 14; j++) {
			const a = hash(v.x, v.y, j, 30) * TAU;
			const d = Math.sqrt(hash(v.x, v.y, j, 31)) * 0.9 * zoom;
			const r = (0.2 + 0.3 * hash(v.x, v.y, j, 32)) * zoom;
			blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * 0.7);
		}
		for (let dy = -5; dy <= 5; dy++) {
			for (let dx = -5; dx <= 5; dx++) {
				const tx = v.x + dx;
				const ty = v.y + dy;
				if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
				const b = living.built[ty * size + tx];
				if (b === Built.none || b === Built.field || (dx === 0 && dy === 0)) continue;
				if (tx < bx0 - 1 && v.x < bx0 - 1) continue;
				const ex = (tx + 0.5 - camera.x) * zoom + camera.width / 2;
				const ey = (ty + 0.62 - camera.y) * zoom + camera.height / 2;
				const wob = (hash(tx, ty, 33) - 0.5) * 0.5 * zoom;
				p.moveTo(cx, cy);
				p.quadraticCurveTo((cx + ex) / 2 + wob, (cy + ey) / 2 - wob, ex, ey);
			}
		}
	}
	ctx.lineCap = 'round';
	ctx.strokeStyle = 'rgba(128, 98, 62, 0.34)';
	ctx.lineWidth = Math.max(1.5, 2.6 * ppm);
	ctx.stroke(p);
	ctx.strokeStyle = 'rgba(165, 135, 92, 0.22)';
	ctx.lineWidth = Math.max(1, 1.2 * ppm);
	ctx.stroke(p);
}

// flat patches of colour on the ground under some ore
function stain(dep: number, tx: number, ty: number, x: number, y: number): void {
	let color: string | null = null;
	if (dep === Deposit.salt) color = 'rgba(248, 248, 240, 0.6)';
	else if (dep === Deposit.clay) color = 'rgba(170, 95, 60, 0.35)';
	else if (dep === Deposit.ochre) color = 'rgba(200, 120, 45, 0.35)';
	else if (dep === Deposit.bogIron) color = 'rgba(120, 70, 45, 0.3)';
	else if (dep === Deposit.meteorite) color = 'rgba(40, 28, 28, 0.35)';
	if (!color) return;
	ctx.fillStyle = color;
	for (let j = 0; j < 6; j++) {
		const r = (0.1 + 0.12 * hash(tx, ty, j, 40)) * zoom;
		blob(
			x + (0.3 + 0.4 * hash(tx, ty, j, 41)) * zoom,
			y + (0.35 + 0.35 * hash(tx, ty, j, 42)) * zoom,
			r * 1.4,
			r
		);
	}
}

// -------------------------------------------------- texture on the ground

function paintDecor(): void {
	const { layers, living, weather } = st;
	const size = layers.size;
	const patchLight = new Path2D();
	const patchDark = new Path2D();
	const fleckLight = new Path2D();
	const fleckDark = new Path2D();
	const bladeDark = new Path2D();
	const bladeLight = new Path2D();
	const cracks = new Path2D();
	const ripples = new Path2D();
	const pools = new Path2D();
	const snow = new Path2D();
	const snowy = season === 3 || weather === 'snow';
	const speck = Math.max(1, 0.22 * ppm);

	for (let ty = by0; ty < by1; ty++) {
		for (let tx = bx0; tx < bx1; tx++) {
			const p = (ty - by0 + 1) * pw + tx - bx0 + 1;
			if (wf[p]) continue;
			const i = ty * size + tx;
			const built = living.built[i];
			if (built === Built.field) continue;
			const biome = layers.biome[i];
			const ground = layers.ground[i];
			const plants = living.plants[i];
			const x = tileX(tx);
			const y = tileY(ty);

			// broad soft patches of lighter and darker ground
			const np = 2 + Math.floor(dens * 0.05);
			for (let j = 0; j < np; j++) {
				const px = x + hash(tx, ty, j, 10) * zoom;
				const py = y + hash(tx, ty, j, 11) * zoom;
				const r = (3 + 6 * hash(tx, ty, j, 12)) * ppm;
				const g = j & 1 ? patchLight : patchDark;
				g.moveTo(px + r, py);
				g.ellipse(px, py, r, r * 0.7, 0, 0, TAU);
			}

			// specks of soil and grit
			const ns = Math.floor(dens * 0.5);
			for (let j = 0; j < ns; j++) {
				const g = hash(tx, ty, j, 13) < 0.5 ? fleckDark : fleckLight;
				g.rect(x + hash(tx, ty, j, 14) * zoom, y + hash(tx, ty, j, 15) * zoom, speck, speck);
			}

			const rocky = ground === Ground.rock || biome === Biome.mountain;
			const leafy =
				biome === Biome.grassland ||
				biome === Biome.forest ||
				biome === Biome.scrub ||
				biome === Biome.hills ||
				biome === Biome.wetland;
			if (leafy && !rocky && ground !== Ground.sand) {
				// blades of grass, more where more plants grow
				const nb = Math.floor(dens * 0.35 * (0.5 + plants));
				for (let j = 0; j < nb; j++) {
					const g = j & 1 ? bladeDark : bladeLight;
					const bx = x + hash(tx, ty, j, 16) * zoom;
					const by = y + hash(tx, ty, j, 17) * zoom;
					const hgt = Math.max(3, (0.5 + 0.7 * hash(tx, ty, j, 18)) * ppm);
					g.moveTo(bx, by);
					g.lineTo(bx + (hash(tx, ty, j, 19) - 0.5) * hgt * 0.8, by - hgt);
				}
			}
			if (rocky || ground === Ground.clay) {
				// cracks and chips
				const nc = Math.min(8, 1 + Math.floor(dens / 25));
				for (let j = 0; j < nc; j++) {
					let cx = x + hash(tx, ty, j, 50) * zoom;
					let cy = y + hash(tx, ty, j, 51) * zoom;
					cracks.moveTo(cx, cy);
					for (let s = 0; s < 3; s++) {
						const len = (2 + 3 * hash(tx, ty, j * 4 + s, 52)) * ppm;
						const ang = hash(tx, ty, j * 4 + s, 53) * TAU;
						cx += Math.cos(ang) * len;
						cy += Math.sin(ang) * len;
						cracks.lineTo(cx, cy);
					}
				}
				const chips = Math.floor(dens * 0.15);
				for (let j = 0; j < chips; j++)
					fleckLight.rect(
						x + hash(tx, ty, j, 54) * zoom,
						y + hash(tx, ty, j, 55) * zoom,
						speck * 2,
						speck * 1.4
					);
			}
			if (ground === Ground.sand) {
				const nr = 1 + Math.floor(dens * 0.06);
				for (let j = 0; j < nr; j++) {
					const rx = x + hash(tx, ty, j, 56) * zoom;
					const ry = y + hash(tx, ty, j, 57) * zoom;
					const len = (3 + 4 * hash(tx, ty, j, 58)) * ppm;
					ripples.moveTo(rx, ry);
					ripples.quadraticCurveTo(rx + len / 2, ry - len * 0.15, rx + len, ry);
				}
			}
			if (ground === Ground.bog) {
				const nb = 1 + Math.floor(dens * 0.03);
				for (let j = 0; j < nb; j++) {
					const px = x + (0.1 + 0.8 * hash(tx, ty, j, 59)) * zoom;
					const py = y + (0.1 + 0.8 * hash(tx, ty, j, 60)) * zoom;
					const r = (1.5 + 3 * hash(tx, ty, j, 61)) * ppm;
					pools.moveTo(px + r, py);
					pools.ellipse(px, py, r, r * 0.55, 0, 0, TAU);
				}
			}
			if (snowy && biome !== Biome.ocean) {
				const nsn = 2 + Math.floor(dens * 0.04);
				for (let j = 0; j < nsn; j++) {
					const px = x + hash(tx, ty, j, 62) * zoom;
					const py = y + hash(tx, ty, j, 63) * zoom;
					const r = (4 + 6 * hash(tx, ty, j, 64)) * ppm;
					snow.moveTo(px + r, py);
					snow.ellipse(px, py, r, r * 0.7, 0, 0, TAU);
				}
			}
		}
	}

	ctx.fillStyle = 'rgba(255, 248, 170, 0.09)';
	ctx.fill(patchLight);
	ctx.fillStyle = 'rgba(25, 50, 20, 0.08)';
	ctx.fill(patchDark);
	ctx.fillStyle = 'rgba(40, 70, 40, 0.4)';
	ctx.fill(pools);
	ctx.fillStyle = 'rgba(255, 255, 240, 0.3)';
	ctx.fill(fleckLight);
	ctx.fillStyle = 'rgba(55, 40, 22, 0.24)';
	ctx.fill(fleckDark);
	ctx.lineCap = 'round';
	ctx.lineWidth = Math.max(1, ppm * 0.14);
	ctx.strokeStyle = BLADE_DARK[season];
	ctx.stroke(bladeDark);
	ctx.strokeStyle = BLADE_LIGHT[season];
	ctx.stroke(bladeLight);
	ctx.lineWidth = Math.max(1, ppm * 0.1);
	ctx.strokeStyle = 'rgba(45, 40, 36, 0.32)';
	ctx.stroke(cracks);
	ctx.strokeStyle = 'rgba(255, 255, 235, 0.3)';
	ctx.lineWidth = Math.max(1, ppm * 0.18);
	ctx.stroke(ripples);
	if (snowy) {
		ctx.fillStyle = 'rgba(250, 252, 255, 0.38)';
		ctx.fill(snow);
	}
}

// ------------------------------------------------------------------- fields

function paintFields(): void {
	const { layers, living } = st;
	const size = layers.size;
	const soil = new Path2D();
	const furrows = new Path2D();
	const crops = new Path2D();
	const edges = new Path2D();
	let any = false;
	const rows = zoom >= 100 ? 17 : Math.min(17, Math.max(4, Math.round(zoom / 6)));
	const rowPx = zoom / rows;
	const isField = (tx: number, ty: number) =>
		tx >= 0 && ty >= 0 && tx < size && ty < size && living.built[ty * size + tx] === Built.field;

	for (let ty = by0; ty < by1; ty++) {
		for (let tx = bx0; tx < bx1; tx++) {
			if (!isField(tx, ty)) continue;
			any = true;
			const x = tileX(tx);
			const y = tileY(ty);
			soil.rect(x - 0.4, y - 0.4, zoom + 0.8, zoom + 0.8);
			for (let r = 0; r < rows; r++) {
				const ry = y + (r + 0.3) * rowPx;
				crops.moveTo(x, ry);
				crops.lineTo(x + zoom, ry);
				const fy = y + (r + 0.78) * rowPx;
				furrows.moveTo(x, fy);
				furrows.lineTo(x + zoom, fy);
			}
			if (!isField(tx, ty - 1)) {
				edges.moveTo(x, y);
				edges.lineTo(x + zoom, y);
			}
			if (!isField(tx, ty + 1)) {
				edges.moveTo(x, y + zoom);
				edges.lineTo(x + zoom, y + zoom);
			}
			if (!isField(tx - 1, ty)) {
				edges.moveTo(x, y);
				edges.lineTo(x, y + zoom);
			}
			if (!isField(tx + 1, ty)) {
				edges.moveTo(x + zoom, y);
				edges.lineTo(x + zoom, y + zoom);
			}
		}
	}
	if (!any) return;
	ctx.fillStyle = SOIL[season];
	ctx.fill(soil);
	ctx.lineCap = 'butt';
	ctx.strokeStyle = 'rgba(40, 26, 14, 0.5)';
	ctx.lineWidth = Math.max(1, rowPx * 0.28);
	ctx.stroke(furrows);

	// crops by season: sprouts, tall green, golden ripe, stubble
	const style: [string, number, number, number][] = [
		['#8fbf55', 0.2, 0.12, 0.3],
		['#5f9a3c', 0.42, 0.45, 0.08],
		['#d4b04a', 0.42, 0.45, 0.08],
		['#9a8660', 0.12, 0.1, 0.3]
	];
	const [color, wid, dash, gap] = style[season];
	ctx.strokeStyle = color;
	ctx.lineWidth = Math.max(1, rowPx * wid);
	ctx.setLineDash([Math.max(1, rowPx * dash), Math.max(1, rowPx * gap)]);
	ctx.stroke(crops);
	if (season === 1 || season === 2) {
		// light on the lit side of the stalks
		ctx.strokeStyle = season === 1 ? 'rgba(190, 230, 120, 0.4)' : 'rgba(250, 230, 150, 0.4)';
		ctx.lineWidth = Math.max(1, rowPx * 0.12);
		ctx.stroke(crops);
	}
	ctx.setLineDash([]);
	if (season === 3) {
		ctx.fillStyle = 'rgba(245, 248, 252, 0.2)';
		ctx.fill(soil);
	}
	ctx.strokeStyle = 'rgba(50, 34, 20, 0.45)';
	ctx.lineWidth = Math.max(1, ppm * 0.3);
	ctx.stroke(edges);
}

// -------------------------------------------------------------------- water

const css = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
const J = 0.17; // how far a shore corner may wander, in tiles

const corner = [0, 0];

// Where the corner (cx, cy) of the tile grid lands on screen. Corners that
// touch land wander a little so shores are wobbly; open water stays square.
function cornerPos(cx: number, cy: number): void {
	const rx = cx - bx0;
	const ry = cy - by0;
	const a = wf[ry * pw + rx];
	const b = wf[ry * pw + rx + 1];
	const c = wf[(ry + 1) * pw + rx];
	const d = wf[(ry + 1) * pw + rx + 1];
	let jx = 0;
	let jy = 0;
	if (!(a && b && c && d)) {
		jx = (hash(cx, cy, 3, 5) - 0.5) * 2 * J * zoom;
		jy = (hash(cx, cy, 4, 5) - 0.5) * 2 * J * zoom;
	}
	corner[0] = X0 + rx * zoom + jx;
	corner[1] = Y0 + ry * zoom + jy;
}

function waterClass(i: number): number {
	const { layers } = st;
	const w = layers.water[i];
	if (w === Water.lake) return 6;
	if (w === Water.river) return 7;
	if (w === Water.spring) return 8;
	const depth = Math.min(1, Math.max(0, (SEA_LEVEL - layers.height[i]) / SEA_LEVEL));
	return Math.min(5, Math.floor(depth * 6));
}

function paintWater(): void {
	const { layers } = st;
	const size = layers.size;
	const now = st.now;
	const classes: (Path2D | undefined)[] = new Array(9);
	const classColor: number[] = new Array(9);
	const shore = new Path2D();
	const sparkB = new Path2D();
	const sparkD = new Path2D();
	const waves = new Path2D();
	const streaks = new Path2D();
	let any = false;
	let anyShore = false;
	const nSpark = Math.min(40, Math.max(1, Math.floor(dens * 0.04)));
	const sparkLen = Math.max(3, 2 * ppm);
	const pts = [0, 0, 0, 0, 0, 0, 0, 0];

	for (let ty = by0; ty < by1; ty++) {
		for (let tx = bx0; tx < bx1; tx++) {
			const p = (ty - by0 + 1) * pw + tx - bx0 + 1;
			if (!wf[p]) continue;
			any = true;
			const i = Math.min(size - 1, ty) * size + Math.min(size - 1, tx);
			const cls = waterClass(i);
			let path = classes[cls];
			if (!path) {
				path = new Path2D();
				classes[cls] = path;
				classColor[cls] = tileColor(i, layers, st.living, season);
			}
			const x = tileX(tx);
			const y = tileY(ty);
			const open =
				wf[p - 1] &&
				wf[p + 1] &&
				wf[p - pw] &&
				wf[p + pw] &&
				wf[p - pw - 1] &&
				wf[p - pw + 1] &&
				wf[p + pw - 1] &&
				wf[p + pw + 1];
			if (open) {
				path.rect(x - 0.5, y - 0.5, zoom + 1, zoom + 1);
			} else {
				for (let c = 0; c < 4; c++) {
					cornerPos(tx + (c === 1 || c === 2 ? 1 : 0), ty + (c >= 2 ? 1 : 0));
					pts[c * 2] = corner[0];
					pts[c * 2 + 1] = corner[1];
				}
				path.moveTo(pts[0], pts[1]);
				const wet = [wf[p - pw], wf[p + 1], wf[p + pw], wf[p - 1]];
				for (let e = 0; e < 4; e++) {
					const fx = pts[e * 2];
					const fy = pts[e * 2 + 1];
					const tx2 = pts[((e + 1) % 4) * 2];
					const ty2 = pts[((e + 1) % 4) * 2 + 1];
					if (wet[e]) {
						path.lineTo(tx2, ty2);
						continue;
					}
					// a land edge: bow it a little and remember it for foam
					const dx = tx2 - fx;
					const dy = ty2 - fy;
					const len = Math.hypot(dx, dy) || 1;
					const amt = (hash(tx, ty, e, 6) - 0.5) * 0.3 * zoom;
					const qx = (fx + tx2) / 2 - (dy / len) * amt;
					const qy = (fy + ty2) / 2 + (dx / len) * amt;
					path.quadraticCurveTo(qx, qy, tx2, ty2);
					shore.moveTo(fx, fy);
					shore.quadraticCurveTo(qx, qy, tx2, ty2);
					anyShore = true;
				}
				path.closePath();
			}

			// shimmer
			for (let j = 0; j < nSpark; j++) {
				const sx = x + hash(tx, ty, j, 15) * zoom;
				const sy = y + hash(tx, ty, j, 16) * zoom;
				const ph = Math.sin(now * 0.0012 + hash(tx, ty, j, 17) * TAU);
				const g = ph > 0.55 ? sparkB : ph > 0.1 ? sparkD : null;
				if (!g) continue;
				g.moveTo(sx, sy);
				g.lineTo(sx + sparkLen * (0.6 + hash(tx, ty, j, 18)), sy);
			}
			if (cls === 7) {
				// river streaks run downhill
				const hh = layers.height;
				let best = hh[i];
				let dx = 1;
				let dy = 0;
				for (let k = 0; k < 4; k++) {
					const nx = Math.min(size - 1, Math.max(0, tx + (k === 0 ? -1 : k === 1 ? 1 : 0)));
					const ny = Math.min(size - 1, Math.max(0, ty + (k === 2 ? -1 : k === 3 ? 1 : 0)));
					const hn = hh[ny * size + nx];
					if (hn < best) {
						best = hn;
						dx = nx - tx;
						dy = ny - ty;
					}
				}
				for (let s = 0; s < 2; s++) {
					const off = (hash(tx, ty, s, 19) - 0.5) * 0.5;
					const t = (now / 5000 + hash(tx, ty, s, 20)) % 1;
					const cx = x + (0.5 + dx * (t - 0.5) - dy * off) * zoom;
					const cy = y + (0.5 + dy * (t - 0.5) + dx * off) * zoom;
					streaks.moveTo(cx, cy);
					streaks.lineTo(cx + dx * 0.16 * zoom, cy + dy * 0.16 * zoom);
				}
			} else if (zoom >= 30) {
				// slow swells on open water
				const hw = hash(tx, ty, 21);
				const wx = x + (0.15 + 0.5 * hw + 0.05 * Math.sin(now * 0.0004 + hw * TAU)) * zoom;
				const wy = y + hash(tx, ty, 22) * zoom;
				const len = (5 + 5 * hw) * ppm;
				waves.moveTo(wx, wy);
				waves.quadraticCurveTo(wx + len / 2, wy - len * 0.12, wx + len, wy);
			}
		}
	}
	if (!any) return;

	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	if (anyShore) {
		// wet sand along the edge, half of it hidden by the water drawn next
		ctx.strokeStyle = 'rgba(105, 88, 55, 0.22)';
		ctx.lineWidth = Math.max(3, ppm * 5);
		ctx.stroke(shore);
	}
	for (let c = 0; c < 9; c++) {
		const path = classes[c];
		if (!path) continue;
		const color = css(classColor[c]);
		ctx.fillStyle = color;
		ctx.fill(path);
		// a hairline of the same colour hides seams between neighbouring shapes
		ctx.strokeStyle = color;
		ctx.lineWidth = 1;
		ctx.stroke(path);
		if (c === 6 && season === 3) {
			ctx.fillStyle = 'rgba(235, 245, 250, 0.32)';
			ctx.fill(path);
		}
	}
	ctx.lineWidth = Math.max(1, ppm * 0.16);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
	ctx.stroke(waves);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
	ctx.stroke(streaks);
	ctx.lineWidth = Math.max(1, ppm * 0.2);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
	ctx.stroke(sparkD);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
	ctx.stroke(sparkB);
	if (anyShore) {
		ctx.strokeStyle = 'rgba(200, 235, 248, 0.14)';
		ctx.lineWidth = Math.max(2, ppm * 3.2);
		ctx.stroke(shore);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
		ctx.lineWidth = Math.max(2.5, ppm * 1.8);
		ctx.stroke(shore);
		ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + 0.2 * Math.sin(now * 0.002)})`;
		ctx.lineWidth = Math.max(1, ppm * 0.45);
		ctx.stroke(shore);
	}
}
