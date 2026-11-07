import { hash } from './scene';

// Code-drawn pictures of trees, rocks, huts and so on, each painted once onto
// a small offscreen canvas and then stamped with drawImage. Everything is
// painted in metres with the origin at the object's foot (y grows downward),
// so sizes stay true to the world. A sprite is cached per kind, variant,
// season and size bucket, at the device pixel ratio so it stays crisp.

type Ctx = CanvasRenderingContext2D;
type Canvas = HTMLCanvasElement | OffscreenCanvas;

const TAU = Math.PI * 2;

export const Kind = {
	oak: 0,
	conifer: 1,
	scrub: 2,
	bush: 3,
	berry: 4,
	tuft: 5,
	flower: 6,
	reed: 7,
	boulder: 8,
	stone: 9,
	flint: 10,
	clay: 11,
	copper: 12,
	tin: 13,
	bogIron: 14,
	obsidian: 15,
	salt: 16,
	ochre: 17,
	meteorite: 18,
	tent: 19,
	hut: 20,
	kiln: 21,
	fenceH: 22,
	fenceV: 23,
	altar: 24,
	standing: 25,
	store: 26,
	furnace: 27,
	fireRing: 28
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

// how far a sprite reaches from its foot, in metres, and how many looks it has
export type Spec = {
	l: number;
	r: number;
	u: number;
	d: number;
	variants: number;
	seasonal: boolean;
	paint: (g: Ctx, v: number, season: number) => void;
};

export type Sprite = {
	img: CanvasImageSource;
	w: number;
	h: number;
	ox: number;
	oy: number;
	ppm: number;
};

// ------------------------------------------------------------- helpers

let ppmNow = 1;
// outlines never get thinner than about a pixel
const lw = (m: number) => Math.max(m, 0.9 / ppmNow);
const OUTLINE = 'rgba(32, 28, 22, 0.6)';

const hx = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const clamp255 = (v: number) => (v > 255 ? 255 : v < 0 ? 0 : Math.round(v));
function mulHex(n: number, f: number): string {
	const r = clamp255(((n >> 16) & 255) * f);
	const g = clamp255(((n >> 8) & 255) * f);
	const b = clamp255((n & 255) * f);
	return `rgb(${r}, ${g}, ${b})`;
}
function mixHex(a: number, b: number, t: number): string {
	const f = (s: number) => ((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t;
	return `rgb(${clamp255(f(16))}, ${clamp255(f(8))}, ${clamp255(f(0))})`;
}

function shadow(g: Ctx, x: number, y: number, rx: number, ry: number): void {
	g.fillStyle = 'rgba(24, 32, 18, 0.24)';
	g.beginPath();
	g.ellipse(x, y, rx, ry, 0, 0, TAU);
	g.fill();
}

function disc(g: Ctx, x: number, y: number, r: number, fill: string, outline = false): void {
	g.beginPath();
	g.arc(x, y, r, 0, TAU);
	g.fillStyle = fill;
	g.fill();
	if (outline) {
		g.lineWidth = lw(0.12);
		g.strokeStyle = OUTLINE;
		g.stroke();
	}
}

function path(g: Ctx, pts: number[], close = true): void {
	g.beginPath();
	g.moveTo(pts[0], pts[1]);
	for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
	if (close) g.closePath();
}

function poly(g: Ctx, pts: number[], fill: string, outline = true): void {
	path(g, pts);
	g.fillStyle = fill;
	g.fill();
	if (outline) {
		g.lineWidth = lw(0.12);
		g.lineJoin = 'round';
		g.strokeStyle = OUTLINE;
		g.stroke();
	}
}

function line(g: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, w: number) {
	g.beginPath();
	g.moveTo(x0, y0);
	g.lineTo(x1, y1);
	g.strokeStyle = color;
	g.lineWidth = lw(w);
	g.lineCap = 'round';
	g.stroke();
}

// an irregular ring of points around (cx, cy)
function rockPts(v: number, k: number, rx: number, ry: number, cx: number, cy: number): number[] {
	const out: number[] = [];
	const n = 8;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * TAU + hash(v, k, i) * 0.4;
		const r = 0.8 + 0.3 * hash(v, k, i + 20);
		out.push(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r);
	}
	return out;
}

// light from the north-west: lit patch up-left, dark patch down-right, kept
// inside the outline by clipping
function litAndDark(g: Ctx, pts: number[], cx: number, cy: number, rx: number, ry: number) {
	g.save();
	path(g, pts);
	g.clip();
	g.fillStyle = 'rgba(255, 255, 255, 0.22)';
	g.beginPath();
	g.ellipse(cx - rx * 0.35, cy - ry * 0.4, rx * 0.7, ry * 0.6, 0, 0, TAU);
	g.fill();
	g.fillStyle = 'rgba(0, 0, 0, 0.2)';
	g.beginPath();
	g.ellipse(cx + rx * 0.55, cy + ry * 0.55, rx * 0.8, ry * 0.7, 0, 0, TAU);
	g.fill();
	g.restore();
}

function leaves(season: number, v: number): [string, string, string] {
	let base: number;
	if (season === 0) base = [0x7aa650, 0x82ae55, 0x72a04c, 0x86b45e][v & 3];
	else if (season === 1) base = [0x4f8442, 0x57904a, 0x497a3f, 0x5c9446][v & 3];
	else if (season === 2) base = [0xcb9a31, 0xbd6a2b, 0x9c4d2c, 0x73893a][v & 3];
	else base = 0x8a6b3a;
	return [mulHex(base, 0.76), hx(base), mulHex(base, 1.2)];
}

// ------------------------------------------------------------- plants

function paintOak(g: Ctx, v: number, season: number): void {
	const rnd = (k: number) => hash(v + 11, k, 3);
	shadow(g, 2, 0.4, 4.3, 1.7);
	poly(g, [-0.6, 0, -0.35, -2.8, 0.35, -2.8, 0.6, 0], '#6b4a2e');
	const R = 3.4 * (0.92 + 0.16 * rnd(0));
	const cy = -4.6;
	const lobes: number[] = [];
	for (let k = 0; k < 6; k++) {
		const a = (k / 6) * TAU + rnd(k + 1) * 0.6;
		const d = R * 0.55;
		lobes.push(Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, R * (0.5 + 0.18 * rnd(k + 9)));
	}
	if (season === 3) {
		// bare branches with a few stubborn leaves
		for (let k = 0; k < lobes.length; k += 3) {
			const x = lobes[k] * 1.3;
			const y = cy + (lobes[k + 1] - cy) * 1.3;
			line(g, 0, -2.6, x, y, '#5a4028', 0.22);
			line(g, x * 0.6, -2.6 + (y + 2.6) * 0.6, x * 0.6 + 0.9, y - 0.6, '#5a4028', 0.12);
			line(g, x * 0.6, -2.6 + (y + 2.6) * 0.6, x * 0.6 - 0.9, y - 0.5, '#5a4028', 0.12);
			if (v < 2) disc(g, x, y, 0.22, '#9a6b3a');
		}
		return;
	}
	const [dk, mid, lt] = leaves(season, v);
	g.fillStyle = dk;
	g.strokeStyle = OUTLINE;
	g.lineWidth = lw(0.3);
	for (let k = 0; k < lobes.length; k += 3) {
		g.beginPath();
		g.arc(lobes[k], lobes[k + 1], lobes[k + 2], 0, TAU);
		g.stroke();
	}
	disc(g, 0, cy, R * 0.75, dk);
	for (let k = 0; k < lobes.length; k += 3) disc(g, lobes[k], lobes[k + 1], lobes[k + 2], dk);
	for (let k = 0; k < lobes.length; k += 3)
		disc(g, lobes[k] - 0.3, lobes[k + 1] - 0.4, lobes[k + 2] * 0.78, mid);
	for (let k = 0; k < 4; k++) {
		const a = TAU * (0.5 + rnd(k + 30) * 0.25);
		disc(g, Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.5, R * 0.2, lt);
	}
	if (season === 0 && v === 3) {
		for (let k = 0; k < 9; k++)
			disc(g, (rnd(k + 40) - 0.5) * R * 1.6, cy + (rnd(k + 50) - 0.5) * R * 1.4, 0.22, '#f4d9e0');
	}
	if (season === 2) {
		for (let k = 0; k < 6; k++)
			disc(g, (rnd(k + 60) - 0.5) * R * 1.5, cy + (rnd(k + 70) - 0.5) * R * 1.3, 0.3, dk);
	}
}

function paintConifer(g: Ctx, v: number, season: number): void {
	shadow(g, 2.2, 0.5, 3.4, 1.2);
	poly(g, [-0.4, 0, -0.3, -1.4, 0.3, -1.4, 0.4, 0], '#5a3d26');
	const base = [0x2f5d44, 0x2a5640, 0x35634a, 0x2d5a47][v & 3];
	const green = season === 0 ? mixHex(base, 0x7aa650, 0.18) : hx(base);
	for (let i = 0; i < 3; i++) {
		const by = -1.2 - i * 2.6;
		const w = 2.8 - i * 0.6;
		const ty = by - 3.8;
		poly(g, [-w, by, 0, ty, w, by], green);
		// the lit left half
		path(g, [-w, by, 0, ty, 0, by - 0.2]);
		g.fillStyle = 'rgba(255, 255, 255, 0.12)';
		g.fill();
		if (season === 3) {
			// snow sits on the upper part of each tier
			const f = 0.55;
			const sx = w * (1 - f);
			const sy = by - 3.8 * f;
			path(g, [-sx, sy, 0, ty, sx, sy, sx * 0.5, sy + 0.5, 0, sy + 0.1, -sx * 0.5, sy + 0.5]);
			g.fillStyle = '#f2f6f8';
			g.fill();
		}
	}
}

function paintScrub(g: Ctx, v: number, season: number): void {
	shadow(g, 1.2, 0.3, 2.2, 0.8);
	g.beginPath();
	g.moveTo(0, 0);
	g.bezierCurveTo(-0.4, -1, 0.5, -1.6, 0.2, -2.6);
	g.strokeStyle = '#5e4630';
	g.lineWidth = lw(0.4);
	g.stroke();
	if (season === 3) {
		line(g, 0.2, -2.4, -0.9, -3.4, '#5e4630', 0.14);
		line(g, 0.2, -2.4, 1.0, -3.6, '#5e4630', 0.14);
		return;
	}
	const [dk, mid] = leaves(season, v);
	const spots = [-0.7, -3.0, 1.1, -3.4, 0.2, -4.0];
	for (let i = 0; i < spots.length; i += 2) disc(g, spots[i], spots[i + 1], 1.05, dk, true);
	for (let i = 0; i < spots.length; i += 2) disc(g, spots[i] - 0.2, spots[i + 1] - 0.25, 0.75, mid);
}

function paintBush(g: Ctx, v: number, season: number, berries: boolean): void {
	shadow(g, 1, 0.3, 1.9, 0.7);
	if (season === 3) {
		for (let k = 0; k < 7; k++) {
			const a = -Math.PI * (0.15 + 0.7 * (k / 6));
			line(g, 0, -0.2, Math.cos(a) * 1.6, -0.2 + Math.sin(a) * 1.7, '#5e4630', 0.1);
		}
		if (berries)
			for (let k = 0; k < 3; k++) disc(g, (k - 1) * 0.6, -1.1 - (k % 2) * 0.3, 0.1, '#5a2a2a');
		return;
	}
	const [dk, mid, lt] = leaves(season === 2 && !berries ? 1 : season, v);
	const spots = [-0.9, -0.9, 0.9, -0.9, 0, -1.4, 0, -0.5];
	for (let i = 0; i < spots.length; i += 2) disc(g, spots[i], spots[i + 1], 1.0, dk, true);
	for (let i = 0; i < spots.length; i += 2) disc(g, spots[i] - 0.15, spots[i + 1] - 0.2, 0.72, mid);
	disc(g, -0.35, -1.5, 0.35, lt);
	if (!berries) return;
	let color: string | null = null;
	if (season === 1) color = v & 1 ? '#4a5aa8' : '#c0392b';
	else if (season === 2) color = v & 1 ? '#5b3a85' : '#9e2a2a';
	else if (season === 0) color = '#f4efe0';
	if (!color) return;
	for (let k = 0; k < 9; k++) {
		const x = (hash(v, k, 5) - 0.5) * 2.0;
		const y = -0.4 - hash(v, k, 6) * 1.5;
		disc(g, x, y, season === 0 ? 0.13 : 0.17, color);
		if (season !== 0) disc(g, x - 0.05, y - 0.05, 0.05, 'rgba(255,255,255,0.7)');
	}
}

function paintTuft(g: Ctx, v: number, season: number): void {
	const dark = ['#5c8c3e', '#6a9a46', '#a79a42', '#9a9068'][season];
	const light = ['#8fbf5a', '#9cc460', '#c9b858', '#b9ae80'][season];
	for (let k = 0; k < 6; k++) {
		const x0 = (k - 2.5) * 0.12;
		const lean = (hash(v, k, 1) - 0.5) * 0.8;
		const h = 0.6 + hash(v, k, 2) * 0.5;
		line(g, x0, 0, x0 + lean, -h, k % 2 ? dark : light, 0.09);
	}
	if (season === 3) disc(g, 0, -0.1, 0.25, 'rgba(255,255,255,0.7)');
}

const PETALS = ['#f4f1e6', '#f0cf3e', '#e48ab0', '#8f6cc4'];
function paintFlower(g: Ctx, v: number): void {
	line(g, 0, 0, 0, -0.7, '#4f7a3c', 0.07);
	line(g, 0, -0.1, -0.25, -0.35, '#5f8f46', 0.06);
	for (let k = 0; k < 5; k++) {
		const a = (k / 5) * TAU;
		disc(g, Math.cos(a) * 0.14, -0.8 + Math.sin(a) * 0.14, 0.12, PETALS[v & 3]);
	}
	disc(g, 0, -0.8, 0.08, '#e8b923');
}

function paintReed(g: Ctx, v: number, season: number): void {
	shadow(g, 0.5, 0.15, 1.1, 0.35);
	const col = ['#8fb35a', '#6f8f45', '#a88f4a', '#b9a67a'][season];
	for (let k = 0; k < 7; k++) {
		const x0 = (k - 3) * 0.16;
		const h = 1.8 + hash(v, k, 1) * 0.9;
		const bend = (hash(v, k, 2) - 0.5) * 1.3;
		g.beginPath();
		g.moveTo(x0, 0);
		g.quadraticCurveTo(x0 + bend * 0.2, -h * 0.6, x0 + bend, -h);
		g.strokeStyle = col;
		g.lineWidth = lw(0.1);
		g.stroke();
		if (season !== 3 && k % 2 === 0) {
			g.save();
			g.translate(x0 + bend * 0.92, -h * 0.9);
			g.rotate(bend * 0.3);
			g.fillStyle = '#5a3a22';
			g.beginPath();
			g.ellipse(0, 0, 0.1, 0.32, 0, 0, TAU);
			g.fill();
			g.restore();
		}
	}
}

// ------------------------------------------------------------- rocks

const ROCK = [0x8e8c88, 0x9a958a, 0x807f80, 0xa09a8c];

function paintBoulder(g: Ctx, v: number, s: number): void {
	shadow(g, 1.4 * s, 0.3 * s, 2.5 * s, 0.9 * s);
	const pts = rockPts(v, 1, 1.9 * s, 1.35 * s, 0, -1.2 * s);
	poly(g, pts, hx(ROCK[v & 3]));
	litAndDark(g, pts, 0, -1.2 * s, 1.9 * s, 1.35 * s);
	if (s > 0.5) {
		g.beginPath();
		g.moveTo(-0.2 * s, -2.1 * s);
		g.lineTo(0.1 * s, -1.3 * s);
		g.lineTo(-0.2 * s, -0.7 * s);
		g.strokeStyle = 'rgba(30, 28, 25, 0.45)';
		g.lineWidth = lw(0.08);
		g.stroke();
		if (v & 1) disc(g, -0.9 * s, -1.9 * s, 0.4 * s, 'rgba(100, 140, 70, 0.7)');
	}
}

function paintStone(g: Ctx, v: number): void {
	for (let k = 0; k < 3; k++) {
		const x = (k - 1) * 0.55 + (hash(v, k, 1) - 0.5) * 0.2;
		const y = -0.2 - hash(v, k, 2) * 0.2;
		const r = 0.22 + hash(v, k, 3) * 0.16;
		shadow(g, x + 0.12, y + 0.12, r, r * 0.5);
		const pts = rockPts(v, k + 3, r, r * 0.75, x, y);
		poly(g, pts, hx(ROCK[(v + k) & 3]));
	}
}

type Deco = (g: Ctx, v: number) => void;

function mound(
	g: Ctx,
	v: number,
	rx: number,
	h: number,
	base: number,
	deco: Deco,
	flat = false
): void {
	shadow(g, rx * 0.5, 0.35, rx * 1.1, 0.9);
	const pts: number[] = [-rx, 0];
	const n = 8;
	for (let i = 1; i < n; i++) {
		const t = Math.PI + (Math.PI * i) / n;
		const j = 1 + (hash(v, i, 9) - 0.5) * 0.35;
		pts.push(Math.cos(t) * rx * j, Math.sin(t) * h * j * (flat ? 0.6 : 1));
	}
	pts.push(rx, 0, rx * 0.5, 0.5, -rx * 0.5, 0.5);
	poly(g, pts, hx(base));
	litAndDark(g, pts, 0, -h * 0.5, rx, h * 0.6);
	g.save();
	path(g, pts);
	g.clip();
	deco(g, v);
	g.restore();
}

const blobs = (g: Ctx, v: number, k: number, n: number, rx: number, y0: number, y1: number) => {
	const out: number[] = [];
	for (let i = 0; i < n; i++)
		out.push((hash(v, k, i) - 0.5) * rx * 2, y0 + hash(v, k, i + 40) * (y1 - y0));
	return out;
};

function paintDeposit(g: Ctx, v: number, kind: number): void {
	switch (kind) {
		case Kind.flint:
			mound(g, v, 2.6, 2.3, 0xd9d5c6, (g2) => {
				const p = blobs(g2, v, 1, 6, 2, -2.1, -0.3);
				for (let i = 0; i < p.length; i += 2) {
					g2.fillStyle = '#2e3238';
					g2.beginPath();
					g2.ellipse(p[i], p[i + 1], 0.45, 0.28, 0.3, 0, TAU);
					g2.fill();
					disc(g2, p[i] - 0.15, p[i + 1] - 0.1, 0.07, '#8a9aa6');
				}
			});
			for (let i = 0; i < 2; i++) disc(g, 2.9 + i * 0.5, 0.2 - i * 0.2, 0.28, '#2e3238');
			break;
		case Kind.clay:
			mound(g, v, 2.8, 2.0, 0xb9663f, (g2) => {
				for (let y = -1.8; y < 0; y += 0.55) {
					g2.beginPath();
					g2.moveTo(-3, y + hash(v, 5, 1) * 0.2);
					g2.quadraticCurveTo(0, y - 0.3, 3, y + 0.1);
					g2.strokeStyle = y % 1 < 0.5 ? 'rgba(110, 50, 25, 0.45)' : 'rgba(230, 150, 100, 0.35)';
					g2.lineWidth = lw(0.12);
					g2.stroke();
				}
			});
			break;
		case Kind.copper:
			mound(g, v, 2.5, 2.3, 0x7f827c, (g2) => {
				const p = blobs(g2, v, 2, 6, 2, -2.1, -0.3);
				for (let i = 0; i < p.length; i += 2) {
					g2.fillStyle = i % 4 ? '#2fb596' : '#6fd3b8';
					g2.beginPath();
					g2.ellipse(p[i], p[i + 1], 0.55, 0.32, 0.4, 0, TAU);
					g2.fill();
				}
			});
			break;
		case Kind.tin:
			mound(g, v, 2.4, 2.2, 0xc7ced4, (g2) => {
				for (let i = 0; i < 4; i++) {
					const y = -1.9 + i * 0.5;
					line(g2, -2 + hash(v, i, 1), y, 1 + hash(v, i, 2), y - 0.4, '#eef2f5', 0.16);
					line(g2, -1 + hash(v, i, 3), y + 0.2, 2, y - 0.1, '#8c97a1', 0.1);
				}
			});
			break;
		case Kind.bogIron:
			g.fillStyle = 'rgba(40, 30, 25, 0.45)';
			g.beginPath();
			g.ellipse(0, 0, 3.2, 1.1, 0, 0, TAU);
			g.fill();
			for (let i = 0; i < 6; i++) {
				const x = (hash(v, i, 1) - 0.5) * 3.8;
				const y = -0.3 - hash(v, i, 2) * 0.8;
				const r = 0.6 + hash(v, i, 3) * 0.5;
				disc(g, x, y, r, '#7a4b3a', true);
				disc(g, x - 0.2, y - 0.2, r * 0.45, '#b8693a');
			}
			break;
		case Kind.obsidian:
			shadow(g, 1.2, 0.3, 2.6, 0.8);
			for (let i = 0; i < 5; i++) {
				const x = (i - 2) * 0.8 + (hash(v, i, 1) - 0.5) * 0.4;
				const h = 1.4 + hash(v, i, 2) * 1.6;
				const w = 0.5 + hash(v, i, 3) * 0.3;
				poly(g, [x - w, 0, x - w * 0.2, -h, x + w * 0.5, -h * 0.85, x + w, 0], '#1d1d28');
				line(g, x - w * 0.2, -h, x - w * 0.8, -0.2, '#5a6a8a', 0.08);
				disc(g, x - w * 0.1, -h * 0.8, 0.07, '#c4d4ff');
			}
			break;
		case Kind.salt:
			for (let i = 0; i < 3; i++) {
				const x = (i - 1) * 1.8;
				g.beginPath();
				g.ellipse(x + 0.2, 0.1, 1.2, 0.5, 0, 0, TAU);
				g.fillStyle = '#cfdde6';
				g.fill();
				g.beginPath();
				g.ellipse(x, -0.2, 1.15, 0.5, 0, 0, TAU);
				g.fillStyle = '#f5f5ef';
				g.fill();
				for (let k = 0; k < 4; k++)
					g.fillRect(x + (hash(v, i, k) - 0.5) * 1.8, -0.4 + hash(v, i, k + 9) * 0.3, 0.07, 0.07);
			}
			break;
		case Kind.ochre:
			mound(g, v, 2.5, 2.1, 0xc9722d, (g2) => {
				for (let i = 0; i < 4; i++) {
					const y = -1.8 + i * 0.5;
					line(g2, -3, y, 3, y - 0.3, i % 2 ? '#d9a03a' : '#a8481f', 0.3);
				}
			});
			break;
		default:
			// meteorite: scorched ground and a dark, metallic lump
			g.fillStyle = 'rgba(30, 20, 20, 0.4)';
			g.beginPath();
			g.ellipse(0, 0.1, 3.0, 1.2, 0, 0, TAU);
			g.fill();
			mound(g, v, 1.6, 1.5, 0x463f52, (g2) => {
				disc(g2, -0.5, -1.0, 0.7, 'rgba(123, 90, 192, 0.5)');
				line(g2, -1, -1.4, 0.8, -0.5, 'rgba(220, 210, 240, 0.4)', 0.08);
			});
	}
}

// ------------------------------------------------------------- buildings

const HIDE = [0xb58a5e, 0xa97c52, 0xc09a6c, 0x9b7a58];

function paintTent(g: Ctx, v: number): void {
	shadow(g, 2.8, 0.5, 3.4, 1.0);
	const c = HIDE[v & 3];
	poly(g, [-2.6, 0, 0, -3.4, 2.6, 0], hx(c));
	path(g, [-2.6, 0, 0, -3.4, 0, 0]);
	g.fillStyle = 'rgba(255, 255, 255, 0.14)';
	g.fill();
	path(g, [0, -3.4, 2.6, 0, 0, 0]);
	g.fillStyle = 'rgba(0, 0, 0, 0.12)';
	g.fill();
	// the doorway and its flaps
	poly(g, [-0.75, 0, 0, -1.9, 0.75, 0], '#3a2a1c', false);
	line(g, -0.75, 0, 0, -1.9, mulHex(c, 0.7), 0.1);
	line(g, 0.75, 0, 0, -1.9, mulHex(c, 0.7), 0.1);
	// pole tips crossing at the top, and a seam of stitches
	line(g, -0.55, -4.0, 0.55, -3.0, '#6b4a2e', 0.16);
	line(g, 0.55, -4.0, -0.55, -3.0, '#6b4a2e', 0.16);
	for (let i = 0; i < 4; i++) {
		const t = 0.2 + i * 0.2;
		line(
			g,
			-1.7 * t,
			-3.4 * (1 - t) * 0.5 - 0.1,
			-1.7 * t + 0.25,
			-3.4 * (1 - t) * 0.5 - 0.1,
			'rgba(60,40,25,0.5)',
			0.07
		);
	}
}

function paintHut(g: Ctx, v: number): void {
	shadow(g, 3.2, 0.5, 4.6, 1.5);
	// clay wall
	g.beginPath();
	g.moveTo(-3.3, -1.9);
	g.lineTo(-3.3, -0.4);
	g.bezierCurveTo(-3.3, 1.4, 3.3, 1.4, 3.3, -0.4);
	g.lineTo(3.3, -1.9);
	g.closePath();
	g.fillStyle = v & 1 ? '#b98458' : '#c4916a';
	g.fill();
	g.lineWidth = lw(0.14);
	g.strokeStyle = OUTLINE;
	g.stroke();
	// doorway
	g.beginPath();
	g.moveTo(-0.6, 0.6);
	g.lineTo(-0.6, -1.1);
	g.quadraticCurveTo(0, -1.9, 0.6, -1.1);
	g.lineTo(0.6, 0.6);
	g.closePath();
	g.fillStyle = '#2e2018';
	g.fill();
	// thatched roof
	const roof = () => {
		g.beginPath();
		g.moveTo(-4.4, -1.9);
		g.quadraticCurveTo(-1.6, -3.2, 0, -6.2);
		g.quadraticCurveTo(1.6, -3.2, 4.4, -1.9);
		g.bezierCurveTo(2.6, -0.4, -2.6, -0.4, -4.4, -1.9);
		g.closePath();
	};
	roof();
	g.fillStyle = v & 2 ? '#c9ab55' : '#bf9f4c';
	g.fill();
	g.save();
	roof();
	g.clip();
	g.fillStyle = 'rgba(255, 255, 255, 0.14)';
	g.fillRect(-5, -7, 5, 8);
	g.fillStyle = 'rgba(60, 40, 15, 0.16)';
	g.fillRect(1.5, -7, 4, 8);
	for (let k = -6; k <= 6; k++) {
		const x = k * 0.75;
		line(g, 0, -6.1, x, -1.2 + Math.abs(k) * 0.02, 'rgba(100, 72, 28, 0.5)', 0.09);
	}
	g.restore();
	roof();
	g.lineWidth = lw(0.14);
	g.strokeStyle = OUTLINE;
	g.stroke();
}

function paintKiln(g: Ctx, v: number): void {
	shadow(g, 2.4, 0.5, 3.2, 1.0);
	g.beginPath();
	g.moveTo(-2.7, 0);
	g.lineTo(-2.7, -1.2);
	g.bezierCurveTo(-2.7, -4.6, 2.7, -4.6, 2.7, -1.2);
	g.lineTo(2.7, 0);
	g.bezierCurveTo(1.5, 0.7, -1.5, 0.7, -2.7, 0);
	g.closePath();
	g.fillStyle = v & 1 ? '#b06a4c' : '#a8644a';
	g.fill();
	g.lineWidth = lw(0.14);
	g.strokeStyle = OUTLINE;
	g.stroke();
	g.save();
	g.clip();
	g.fillStyle = 'rgba(255,255,255,0.16)';
	g.beginPath();
	g.ellipse(-1.1, -2.4, 1.3, 1.6, 0, 0, TAU);
	g.fill();
	for (let i = 0; i < 3; i++) {
		g.beginPath();
		g.ellipse(0, -0.5 - i * 0.9, 2.7 - i * 0.2, 0.35, 0, 0, Math.PI);
		g.strokeStyle = 'rgba(70, 30, 20, 0.35)';
		g.lineWidth = lw(0.1);
		g.stroke();
	}
	g.restore();
	g.fillStyle = '#241410';
	g.beginPath();
	g.ellipse(0, -0.8, 0.95, 0.75, 0, 0, TAU);
	g.fill();
	g.strokeStyle = '#8c5a42';
	g.lineWidth = lw(0.22);
	g.stroke();
	g.fillStyle = '#241410';
	g.beginPath();
	g.ellipse(0, -3.7, 0.5, 0.25, 0, 0, TAU);
	g.fill();
}

// a run of fence: 6 m wide, posts every 2 m
function paintFenceH(g: Ctx): void {
	g.fillStyle = 'rgba(24, 32, 18, 0.2)';
	g.fillRect(-2.8, 0.15, 6, 0.4);
	line(g, -3, -0.55, 3, -0.55, '#7a5632', 0.16);
	line(g, -3, -1.0, 3, -1.0, '#7a5632', 0.16);
	for (let i = 0; i < 4; i++) {
		const x = -3 + i * 2;
		poly(g, [x - 0.18, 0, x - 0.18, -1.3, x + 0.18, -1.3, x + 0.18, 0], '#6f4e2e');
	}
}
// a 20 m run running down the screen
function paintFenceV(g: Ctx): void {
	g.fillStyle = 'rgba(24, 32, 18, 0.2)';
	g.fillRect(0.2, -20, 0.4, 20.4);
	line(g, 0, -20, 0, 0, '#7a5632', 0.2);
	for (let i = 0; i <= 8; i++) {
		const y = -i * 2.5;
		poly(g, [-0.18, y, -0.18, y - 1.3, 0.18, y - 1.3, 0.18, y], '#6f4e2e');
	}
}

function paintAltar(g: Ctx): void {
	g.fillStyle = 'rgba(24, 32, 18, 0.2)';
	g.beginPath();
	g.ellipse(0.2, 0.2, 2.1, 1.0, 0, 0, TAU);
	g.fill();
	g.beginPath();
	g.ellipse(0, 0, 1.9, 0.9, 0, 0, TAU);
	g.fillStyle = '#bdb59f';
	g.fill();
	g.strokeStyle = OUTLINE;
	g.lineWidth = lw(0.12);
	g.stroke();
	g.beginPath();
	g.ellipse(0, 0, 1.0, 0.45, 0, 0, TAU);
	g.fillStyle = '#4a3f38';
	g.fill();
}

function paintStanding(g: Ctx, v: number): void {
	const h = 2.4 + hash(v, 1, 1) * 1.0;
	const w = 0.55 + hash(v, 2, 1) * 0.2;
	g.fillStyle = 'rgba(24, 32, 18, 0.22)';
	path(g, [w, 0, w + h * 0.7, 0.5, w + h * 0.7 + 0.8, 0.9, 0.2, 0.5]);
	g.fill();
	poly(g, [-w, 0, -w * 0.85, -h, 0, -h - 0.25, w * 0.8, -h + 0.1, w, 0], '#cfc8b4');
	path(g, [w * 0.2, 0, 0, -h - 0.25, w * 0.8, -h + 0.1, w, 0]);
	g.fillStyle = 'rgba(70, 60, 40, 0.28)';
	g.fill();
	disc(g, -w * 0.3, -h * 0.35, 0.22, 'rgba(100, 140, 70, 0.6)');
}

function paintStore(g: Ctx, v: number): void {
	shadow(g, 3, 0.5, 4.2, 1.2);
	// four stilts under a plank box
	for (const x of [-2.4, -0.8, 0.8, 2.4])
		poly(g, [x - 0.2, 0, x - 0.2, -1.8, x + 0.2, -1.8, x + 0.2, 0], '#6f4e2e');
	poly(g, [-3.2, -1.7, -3.2, -4.2, 3.2, -4.2, 3.2, -1.7], v & 1 ? '#a47c52' : '#9a7448');
	for (let i = 1; i < 6; i++)
		line(g, -3.2 + i * 1.07, -1.7, -3.2 + i * 1.07, -4.2, 'rgba(60,40,20,0.35)', 0.08);
	poly(g, [-3.2, -4.1, 0, -6.4, 3.2, -4.1, 3.7, -3.7, 0, -6.9, -3.7, -3.7], '#c2a35a');
	path(g, [-3.7, -3.7, 0, -6.9, 0, -6.2, -3.2, -4.1]);
	g.fillStyle = 'rgba(255,255,255,0.14)';
	g.fill();
	poly(g, [-0.6, -1.7, -0.6, -3.3, 0.6, -3.3, 0.6, -1.7], '#2e2018', false);
	line(g, 1.4, 0.2, 2.2, -1.7, '#6f4e2e', 0.14);
	line(g, 1.9, 0.2, 2.6, -1.7, '#6f4e2e', 0.14);
}

function paintFurnace(g: Ctx): void {
	shadow(g, 2.2, 0.5, 3.0, 1.0);
	poly(g, [-2.2, 0, -1.4, -6.2, 1.4, -6.2, 2.2, 0], '#6a6f75');
	g.save();
	path(g, [-2.2, 0, -1.4, -6.2, 1.4, -6.2, 2.2, 0]);
	g.clip();
	g.fillStyle = 'rgba(255,255,255,0.14)';
	g.fillRect(-3, -7, 2.4, 8);
	g.fillStyle = 'rgba(0,0,0,0.18)';
	g.fillRect(0.9, -7, 3, 8);
	for (let r = 0; r < 6; r++) {
		const y = -r * 1.05;
		line(g, -3, y, 3, y, 'rgba(30,30,30,0.35)', 0.08);
		for (let c = -2; c < 3; c++)
			line(
				g,
				c * 1.0 + (r % 2) * 0.5,
				y,
				c * 1.0 + (r % 2) * 0.5,
				y - 1.05,
				'rgba(30,30,30,0.3)',
				0.08
			);
	}
	g.restore();
	g.fillStyle = '#1c1512';
	g.beginPath();
	g.moveTo(-0.8, 0);
	g.lineTo(-0.8, -1.2);
	g.quadraticCurveTo(0, -1.9, 0.8, -1.2);
	g.lineTo(0.8, 0);
	g.fill();
	g.beginPath();
	g.ellipse(0, -6.2, 1.4, 0.4, 0, 0, TAU);
	g.fillStyle = '#2a2a2c';
	g.fill();
}

function paintFireRing(g: Ctx): void {
	g.fillStyle = '#3a312b';
	g.beginPath();
	g.ellipse(0, 0, 1.2, 0.6, 0, 0, TAU);
	g.fill();
	for (let i = 0; i < 9; i++) {
		const a = (i / 9) * TAU;
		disc(g, Math.cos(a) * 1.35, Math.sin(a) * 0.7, 0.3, hx(ROCK[i & 3]), true);
	}
	line(g, -0.7, 0.1, 0.7, -0.15, '#4a3322', 0.22);
	line(g, -0.6, -0.2, 0.6, 0.2, '#3d2a1c', 0.22);
}

// ------------------------------------------------------------- the table

export const SPECS: Record<number, Spec> = {
	[Kind.oak]: { l: 5.4, r: 6.8, u: 9.8, d: 2.4, variants: 4, seasonal: true, paint: paintOak },
	[Kind.conifer]: {
		l: 3.6,
		r: 5.8,
		u: 10.4,
		d: 1.9,
		variants: 4,
		seasonal: true,
		paint: paintConifer
	},
	[Kind.scrub]: { l: 2.6, r: 3.6, u: 5.4, d: 1.3, variants: 4, seasonal: true, paint: paintScrub },
	[Kind.bush]: {
		l: 2.4,
		r: 3.1,
		u: 2.9,
		d: 1.1,
		variants: 4,
		seasonal: true,
		paint: (g, v, s) => paintBush(g, v, s, false)
	},
	[Kind.berry]: {
		l: 2.4,
		r: 3.1,
		u: 2.9,
		d: 1.1,
		variants: 4,
		seasonal: true,
		paint: (g, v, s) => paintBush(g, v, s, true)
	},
	[Kind.tuft]: { l: 0.9, r: 0.9, u: 1.3, d: 0.3, variants: 4, seasonal: true, paint: paintTuft },
	[Kind.flower]: {
		l: 0.5,
		r: 0.5,
		u: 1.1,
		d: 0.2,
		variants: 4,
		seasonal: false,
		paint: paintFlower
	},
	[Kind.reed]: { l: 1.5, r: 1.6, u: 3.0, d: 0.6, variants: 4, seasonal: true, paint: paintReed },
	[Kind.boulder]: {
		l: 2.7,
		r: 4.2,
		u: 2.9,
		d: 1.4,
		variants: 4,
		seasonal: false,
		paint: (g, v) => paintBoulder(g, v, 1)
	},
	[Kind.stone]: { l: 1.4, r: 1.6, u: 0.8, d: 0.7, variants: 4, seasonal: false, paint: paintStone },
	[Kind.flint]: dep(Kind.flint),
	[Kind.clay]: dep(Kind.clay),
	[Kind.copper]: dep(Kind.copper),
	[Kind.tin]: dep(Kind.tin),
	[Kind.bogIron]: dep(Kind.bogIron),
	[Kind.obsidian]: dep(Kind.obsidian),
	[Kind.salt]: dep(Kind.salt),
	[Kind.ochre]: dep(Kind.ochre),
	[Kind.meteorite]: dep(Kind.meteorite),
	[Kind.tent]: { l: 3.4, r: 6.2, u: 4.4, d: 1.6, variants: 4, seasonal: false, paint: paintTent },
	[Kind.hut]: { l: 4.6, r: 8.0, u: 6.8, d: 1.9, variants: 4, seasonal: false, paint: paintHut },
	[Kind.kiln]: { l: 3.0, r: 5.8, u: 4.4, d: 1.4, variants: 2, seasonal: false, paint: paintKiln },
	[Kind.fenceH]: {
		l: 3.4,
		r: 3.4,
		u: 1.5,
		d: 0.8,
		variants: 1,
		seasonal: false,
		paint: paintFenceH
	},
	[Kind.fenceV]: {
		l: 0.6,
		r: 1.0,
		u: 21,
		d: 0.8,
		variants: 1,
		seasonal: false,
		paint: paintFenceV
	},
	[Kind.altar]: { l: 2.4, r: 2.6, u: 1.4, d: 1.4, variants: 1, seasonal: false, paint: paintAltar },
	[Kind.standing]: {
		l: 1.2,
		r: 5.0,
		u: 4.2,
		d: 1.3,
		variants: 4,
		seasonal: false,
		paint: paintStanding
	},
	[Kind.store]: { l: 4.0, r: 7.4, u: 7.4, d: 1.8, variants: 2, seasonal: false, paint: paintStore },
	[Kind.furnace]: {
		l: 3.0,
		r: 5.2,
		u: 6.8,
		d: 1.4,
		variants: 1,
		seasonal: false,
		paint: paintFurnace
	},
	[Kind.fireRing]: {
		l: 2.0,
		r: 2.0,
		u: 1.2,
		d: 1.2,
		variants: 1,
		seasonal: false,
		paint: paintFireRing
	}
};

function dep(kind: number): Spec {
	return {
		l: 3.4,
		r: 5.2,
		u: 3.4,
		d: 1.5,
		variants: 4,
		seasonal: false,
		paint: (g, v) => paintDeposit(g, v, kind)
	};
}

// ------------------------------------------------------------- the cache

export function makeCanvas(w: number, h: number): Canvas {
	if (typeof document !== 'undefined') {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		return c;
	}
	return new OffscreenCanvas(w, h);
}

const MIN_BUCKET = -6;
// ppm reaches 24 at the closest zoom and big trees are drawn up to 2.2x, so
// buckets go up to about 2^6.5 px per metre to stay crisp
const MAX_BUCKET = 13;
const cache = new Map<number, Sprite>();
let cacheDpr = 0;

// sizes come in steps of a factor of 1.41, so a sprite is stamped at most
// about 20 percent off the size it was painted at
export function bucketFor(ppm: number): number {
	const b = Math.round(Math.log2(Math.max(ppm, 0.01)) * 2);
	return b < MIN_BUCKET ? MIN_BUCKET : b > MAX_BUCKET ? MAX_BUCKET : b;
}

export function getSprite(
	kind: number,
	variant: number,
	season: number,
	bucket: number,
	dpr: number
): Sprite {
	if (dpr !== cacheDpr || cache.size > 900) {
		cache.clear();
		cacheDpr = dpr;
	}
	const spec = SPECS[kind];
	const v = variant % spec.variants;
	const s = spec.seasonal ? season & 3 : 0;
	const key = (((kind * 8 + v) * 4 + s) * 32 + (bucket - MIN_BUCKET)) | 0;
	const hit = cache.get(key);
	if (hit) return hit;

	const ppm = Math.pow(2, bucket / 2);
	const pad = 2;
	const w = Math.ceil((spec.l + spec.r) * ppm + pad * 2);
	const h = Math.ceil((spec.u + spec.d) * ppm + pad * 2);
	const ox = spec.l * ppm + pad;
	const oy = spec.u * ppm + pad;
	const canvas = makeCanvas(Math.ceil(w * dpr), Math.ceil(h * dpr));
	const g = canvas.getContext('2d') as Ctx;
	g.setTransform(ppm * dpr, 0, 0, ppm * dpr, 0, 0);
	g.translate(ox / ppm, oy / ppm);
	ppmNow = ppm;
	g.lineJoin = 'round';
	spec.paint(g, v, s);
	const sprite: Sprite = { img: canvas, w, h, ox, oy, ppm };
	cache.set(key, sprite);
	return sprite;
}

// Stamp a sprite with its foot at (sx, sy); `ppm` is the size it should have
export function drawSprite(
	ctx: Ctx,
	kind: number,
	variant: number,
	season: number,
	sx: number,
	sy: number,
	ppm: number,
	dpr: number
): void {
	const s = getSprite(kind, variant, season, bucketFor(ppm), dpr);
	const f = ppm / s.ppm;
	ctx.drawImage(s.img, sx - s.ox * f, sy - s.oy * f, s.w * f, s.h * f);
}
