import { MATERIALS } from '../../discovery/materials';
import { hash } from '../scene';
import { PALETTE, VILLAGE_CLOTH } from './palette';
import { sprite, type Sprite, type SpriteDef } from './sprite';

// Hand-placed pixel art for people, animals, carried things and the tiny map
// icons. Every figure faces right (the other side is a mirror). Figures are
// built from small parts (legs, tunic, head, arms, tool) placed pixel by pixel
// on a grid, then outlined in ink and cropped, so each pose is a plain
// SpriteDef: text rows plus a key. Colours that vary (cloth, skin, hair) use
// their own key letters and are swapped with a recolour map.

type Key = SpriteDef['key'];
type Hex = `#${string}`;

// ------------------------------------------------------------ colour helpers

function hexOf(name: keyof typeof PALETTE): Hex {
	return PALETTE[name] as Hex;
}

function mix(a: string, b: string, t: number): Hex {
	const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
	const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
	const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
	return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const SKINS = ['skin1', 'skin2', 'skin3', 'skin4', 'skin5'] as const;
const HAIRS = ['hairBlack', 'hairBrown', 'hairRed', 'hairBlond', 'hairGrey'] as const;
const GREY_HAIR = 4;
export const CLOTH_COUNT = VILLAGE_CLOTH.length;

// ------------------------------------------------------------ pixel grid

const GW = 56;
const GH = 48;
const GX = 28; // column of x = 0
const GY = 40; // row of u = 0 (the ground line)

// A work grid: x is across (right = forward), u is up from the ground.
class Pix {
	cells: string[] = new Array<string>(GW * GH).fill('.');
	put(x: number, u: number, ch: string): void {
		const c = GX + x;
		const r = GY - u;
		if (c < 0 || r < 0 || c >= GW || r >= GH) return;
		this.cells[r * GW + c] = ch;
	}
	has(x: number, u: number): boolean {
		const c = GX + x;
		const r = GY - u;
		if (c < 0 || r < 0 || c >= GW || r >= GH) return false;
		return this.cells[r * GW + c] !== '.';
	}
	line(x0: number, u0: number, x1: number, u1: number, ch: string): void {
		const n = Math.max(Math.abs(x1 - x0), Math.abs(u1 - u0));
		if (n === 0) {
			this.put(x0, u0, ch);
			return;
		}
		for (let k = 0; k <= n; k++)
			this.put(x0 + Math.round(((x1 - x0) * k) / n), u0 + Math.round(((u1 - u0) * k) / n), ch);
	}
	// outline the silhouette in ink (thin line chars `f` don't get one), crop,
	// and give the sprite its foot at ground level, x = 0
	finish(key: Key, footX = 0): SpriteDef {
		const solid = (ch: string) => ch !== '.' && ch !== 'f';
		const src = this.cells;
		const out = src.slice();
		for (let r = 0; r < GH; r++) {
			for (let c = 0; c < GW; c++) {
				if (src[r * GW + c] !== '.') continue;
				if (
					(r > 0 && solid(src[(r - 1) * GW + c])) ||
					(r < GH - 1 && solid(src[(r + 1) * GW + c])) ||
					(c > 0 && solid(src[r * GW + c - 1])) ||
					(c < GW - 1 && solid(src[r * GW + c + 1]))
				)
					out[r * GW + c] = 'o';
			}
		}
		return crop(out, key, GX + footX, GY);
	}
}

function crop(cells: string[], key: Key, footCol: number, footRow: number): SpriteDef {
	let r0 = GH;
	let r1 = -1;
	let c0 = GW;
	let c1 = -1;
	for (let r = 0; r < GH; r++)
		for (let c = 0; c < GW; c++)
			if (cells[r * GW + c] !== '.') {
				if (r < r0) r0 = r;
				if (r > r1) r1 = r;
				if (c < c0) c0 = c;
				if (c > c1) c1 = c;
			}
	const rows: string[] = [];
	for (let r = r0; r <= r1; r++) rows.push(cells.slice(r * GW + c0, r * GW + c1 + 1).join(''));
	return { rows, key, foot: [footCol - c0, footRow - r0] };
}

// Text rows (fill only) outlined and cropped the same way, for animals, items.
function fromRows(fill: string[], key: Key, outline = true, footFrac = 0.5): SpriteDef {
	const p = new Pix();
	const h = fill.length;
	const w = Math.max(...fill.map((r) => r.length));
	const x0 = -Math.floor(w * footFrac);
	for (let r = 0; r < h; r++)
		for (let c = 0; c < fill[r].length; c++) {
			const ch = fill[r][c];
			if (ch !== '.' && ch !== ' ') p.put(x0 + c, h - r, ch);
		}
	if (outline) return p.finish(key);
	return crop(p.cells, key, GX, GY - 1);
}

// ------------------------------------------------------------ people

export type BodyKind = 'man' | 'woman' | 'child' | 'elderM' | 'elderF';
export type HairStyle = 'short' | 'long' | 'bun' | 'bald' | 'beard';
export type Pose =
	| 'stand'
	| 'walk'
	| 'walkSpear'
	| 'walkRod'
	| 'carry'
	| 'chop'
	| 'strike'
	| 'hammer'
	| 'spear'
	| 'rod'
	| 'kneel'
	| 'sit'
	| 'eat'
	| 'lie'
	| 'pray'
	| 'talk';

export const BODIES: BodyKind[] = ['man', 'woman', 'child', 'elderM', 'elderF'];
export const STYLES: HairStyle[] = ['short', 'long', 'bun', 'bald', 'beard'];
export const POSES: Pose[] = [
	'stand',
	'walk',
	'walkSpear',
	'walkRod',
	'carry',
	'chop',
	'strike',
	'hammer',
	'spear',
	'rod',
	'kneel',
	'sit',
	'eat',
	'lie',
	'pray',
	'talk'
];

export const POSE_FRAMES: Record<Pose, number> = {
	stand: 2,
	walk: 4,
	walkSpear: 4,
	walkRod: 4,
	carry: 4,
	chop: 2,
	strike: 2,
	hammer: 2,
	spear: 2,
	rod: 2,
	kneel: 2,
	sit: 2,
	eat: 2,
	lie: 2,
	pray: 2,
	talk: 2
};

// frames a second for the poses that animate on the clock (nothing above 6)
export const POSE_FPS: Record<Pose, number> = {
	stand: 0.8,
	walk: 5,
	walkSpear: 5,
	walkRod: 5,
	carry: 5,
	chop: 2.5,
	strike: 4,
	hammer: 2.5,
	spear: 1.2,
	rod: 1.2,
	kneel: 2,
	sit: 1.2,
	eat: 1.5,
	lie: 0.6,
	pray: 1.2,
	talk: 3
};

type Dim = { legs: number; torso: number; flare: number; lean: number; child: boolean };
const DIM: Record<BodyKind, Dim> = {
	man: { legs: 4, torso: 6, flare: 0, lean: 0, child: false },
	woman: { legs: 3, torso: 6, flare: 2, lean: 0, child: false },
	child: { legs: 2, torso: 3, flare: 0, lean: 0, child: true },
	elderM: { legs: 4, torso: 4, flare: 0, lean: 2, child: false },
	elderF: { legs: 4, torso: 4, flare: 1, lean: 2, child: false }
};

const isElder = (b: BodyKind) => b === 'elderM' || b === 'elderF';

// Height of a standing figure in art pixels, outline included.
export function figureHeight(body: BodyKind): number {
	const d = DIM[body];
	return d.legs + d.torso + 4 + 2;
}

const CLOTH0 = VILLAGE_CLOTH[0] as Hex;
const PERSON_KEY: Key = {
	o: 'ink',
	e: 'ink',
	c: CLOTH0,
	C: mix(CLOTH0, hexOf('ink'), 0.3),
	l: mix(CLOTH0, '#ffffff', 0.18),
	s: 'skin2',
	S: mix(hexOf('skin2'), hexOf('soilDark'), 0.25),
	h: 'hairBrown',
	H: mix(hexOf('hairBrown'), hexOf('ink'), 0.4),
	t: 'soil',
	T: 'soilDark',
	B: 'bark',
	w: 'wood',
	W: 'bark',
	k: 'stoneLight',
	K: 'stone',
	f: 'chalk',
	y: 'straw',
	r: 'ember'
};
export const RECOLOR_KEYS = ['c', 'C', 'l', 's', 'S', 'h', 'H'];

// head, four rows of four, back of the head on the left
const HEAD: Record<HairStyle, string[]> = {
	short: ['hhhh', 'Hhes', 'HSss', '.sss'],
	long: ['hhhh', 'Hhes', 'HHss', 'Hsss'],
	bun: ['hhhh', 'Hhes', 'HSss', '.sss'],
	bald: ['ssss', 'HSes', 'HSss', '.sss'],
	beard: ['hhhh', 'Hhes', 'HSss', '.hhh']
};

type Vec = [number, number];

// walk cycle: [near leg x, lift], [far leg x, lift], body bob, near arm, far arm
const WALK: { n: Vec; f: Vec; bob: number; na: Vec; fa: Vec }[] = [
	{ n: [2, 0], f: [-3, 0], bob: 0, na: [-1, -3], fa: [1, -3] },
	{ n: [-1, 0], f: [1, 1], bob: 1, na: [0, -3], fa: [0, -3] },
	{ n: [-3, 0], f: [2, 0], bob: 0, na: [1, -3], fa: [-1, -3] },
	{ n: [1, 1], f: [-1, 0], bob: 1, na: [0, -3], fa: [0, -3] }
];

// how much the body bobs on a walk frame (for placing things carried overhead)
export function walkBob(frame: number): number {
	return WALK[frame & 3].bob;
}

function span(d: Dim, i: number): Vec {
	if (d.child) return [-1, 1];
	return i < d.flare ? [-3, 2] : [-2, 1];
}

function drawArm(p: Pix, sx: number, su: number, v: Vec, far: boolean): Vec {
	const n = Math.max(Math.abs(v[0]), Math.abs(v[1])) || 1;
	let hx = sx;
	let hu = su;
	for (let k = 0; k <= n; k++) {
		hx = sx + Math.round((v[0] * k) / n);
		hu = su + Math.round((v[1] * k) / n);
		p.put(hx, hu, k === 0 ? (far ? 'C' : 'c') : far ? 'S' : 's');
	}
	return [hx, hu];
}

function drawHead(p: Pix, x0: number, chin: number, style: HairStyle, body: BodyKind): void {
	// only adult men grow beards and only elders go bald, whatever was asked
	let st = style;
	if (st === 'beard' && (body === 'woman' || body === 'child' || body === 'elderF')) st = 'short';
	if (st === 'bald' && !isElder(body)) st = 'short';
	const rows = HEAD[st];
	for (let r = 0; r < 4; r++)
		for (let c = 0; c < 4; c++) {
			const ch = rows[r][c];
			if (ch !== '.') p.put(x0 + c, chin + 3 - r, ch);
		}
	if (st === 'bun') {
		p.put(x0 - 1, chin + 2, 'h');
		p.put(x0 - 1, chin + 1, 'H');
	}
	if (st === 'long' && body !== 'child') p.put(x0 - 1, chin + 1, 'H');
}

const LIE: Record<BodyKind, { leg: number; tor: number }> = {
	man: { leg: 5, tor: 6 },
	woman: { leg: 4, tor: 6 },
	child: { leg: 3, tor: 4 },
	elderM: { leg: 4, tor: 5 },
	elderF: { leg: 4, tor: 5 }
};

// Where a lying figure's parts are along x: legs start, head start (the head
// is on the right), and the far right edge.
export function lieLayout(body: BodyKind): { start: number; headX: number; end: number } {
	const { leg, tor } = LIE[body];
	const start = -Math.floor((leg + tor + 4) / 2);
	const headX = start + leg + tor;
	return { start, headX, end: headX + 3 };
}

function drawLying(p: Pix, body: BodyKind, style: HairStyle, frame: number): void {
	const { leg, tor } = LIE[body];
	const { start, headX, end } = lieLayout(body);
	const torStart = start + leg;
	const kid = body === 'child';
	const tr = kid ? 2 : 3;
	for (let x = start - 1; x <= end + 1; x++) p.put(x, 1, 'y');
	for (let x = start; x < torStart; x++) {
		p.put(x, 2, 'S');
		if (!kid) p.put(x, 3, 's');
	}
	p.put(start, 2, 'T');
	if (!kid) p.put(start, 3, 'T');
	for (let x = torStart; x < headX; x++)
		for (let k = 0; k < tr; k++) p.put(x, 2 + k, k === tr - 1 ? 'l' : k === 0 ? 'C' : 'c');
	if (body === 'woman' || body === 'elderF')
		for (let x = torStart - 2; x < torStart; x++) {
			p.put(x, 2, 'C');
			p.put(x, 3, 'c');
		}
	// the chest rises and falls
	if (frame === 1)
		for (let x = torStart + 1; x <= torStart + 3 && x < headX; x++) p.put(x, 2 + tr, 'l');
	// hands folded on the chest
	p.put(headX - 3, 1 + tr, 's');
	p.put(headX - 2, 1 + tr, 's');
	void tor;
	const bald = style === 'bald' && isElder(body);
	const rows = bald ? ['ssSH', 'sesH', 'sssH'] : ['sshh', 'sehh', 'sssh'];
	for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) p.put(headX + c, 4 - r, rows[r][c]);
	if (style === 'long' || style === 'bun') {
		p.put(end + 1, 3, 'H');
		p.put(end + 1, 2, 'H');
	}
}

function buildPerson(body: BodyKind, style: HairStyle, pose: Pose, frame: number): SpriteDef {
	const d = DIM[body];
	const p = new Pix();
	if (pose === 'lie') {
		drawLying(p, body, style, frame);
		return p.finish(PERSON_KEY);
	}
	const f = frame % POSE_FRAMES[pose];
	const elder = isElder(body);
	let hip = d.legs;
	let torso = d.torso;
	let lean = d.lean;
	let drop = 0;
	let bob = 0;
	let legMode: 'walk' | 'kneel' | 'sit' = 'walk';
	let near: Vec = [0, 0];
	let far: Vec = [-1, 0];
	let nearArm: Vec = [0, -3];
	let farArm: Vec = [0, -3];
	let tool = '';
	switch (pose) {
		case 'stand':
			drop = f === 1 ? 1 : 0;
			if (elder) {
				nearArm = [2, -3];
				tool = 'stick';
			}
			break;
		case 'walk':
		case 'walkSpear':
		case 'walkRod':
		case 'carry': {
			const w = WALK[f];
			near = w.n;
			far = w.f;
			bob = w.bob;
			nearArm = w.na;
			farArm = w.fa;
			if (pose === 'walkSpear') {
				nearArm = [1, -2];
				tool = 'spearHeld';
			} else if (pose === 'walkRod') {
				nearArm = [1, -2];
				tool = 'rodShoulder';
			} else if (pose === 'carry') {
				nearArm = [1, 4];
				farArm = [-1, 4];
			} else if (elder) {
				nearArm = [2, -3];
				tool = 'stick';
			}
			break;
		}
		case 'chop':
			near = [2, 0];
			far = [-2, 0];
			lean += f === 0 ? 1 : 2;
			nearArm = f === 0 ? [2, 3] : [3, 0];
			farArm = f === 0 ? [1, 2] : [2, -1];
			tool = f === 0 ? 'axeUp' : 'axeDown';
			break;
		case 'strike':
			near = [1, 0];
			far = [-2, 0];
			lean += 2;
			nearArm = f === 0 ? [3, 0] : [3, -2];
			farArm = [2, -2];
			tool = 'stone';
			break;
		case 'hammer':
			near = [2, 0];
			far = [-2, 0];
			lean += 1;
			nearArm = f === 0 ? [2, 3] : [3, -1];
			farArm = [1, -2];
			tool = f === 0 ? 'malletUp' : 'malletDown';
			break;
		case 'spear':
			near = [1, 0];
			far = [-2, 0];
			nearArm = f === 0 ? [1, -2] : [3, 0];
			farArm = [1, -2];
			lean += f;
			tool = f === 0 ? 'spearHeld' : 'spearAim';
			break;
		case 'rod':
			near = [1, 0];
			far = [-2, 0];
			nearArm = f === 0 ? [3, 0] : [3, 1];
			farArm = [1, -2];
			tool = 'rod';
			break;
		case 'kneel':
			legMode = 'kneel';
			hip = d.child ? 1 : 2;
			torso = d.child ? 2 : elder ? 3 : 4;
			lean += 2;
			nearArm = f === 0 ? [3, -4] : [4, -4];
			farArm = f === 0 ? [2, -3] : [3, -3];
			break;
		case 'sit':
		case 'eat':
			legMode = 'sit';
			hip = 1;
			if (pose === 'sit') {
				nearArm = f === 0 ? [2, -2] : [2, -1];
				farArm = [1, -3];
			} else {
				nearArm = f === 0 ? [2, 2] : [2, -1];
				farArm = [1, -3];
			}
			break;
		case 'pray':
			nearArm = f === 0 ? [2, 4] : [2, 5];
			farArm = f === 0 ? [-2, 4] : [-2, 5];
			break;
		case 'talk':
			nearArm = f === 0 ? [2, 1] : [2, -1];
			break;
		default:
			break;
	}

	const hipEff = hip + bob;
	const leg = (x: number, lift: number, ch: string) => {
		for (let u = 1 + lift; u <= hipEff; u++) p.put(x, u, ch);
		p.put(x, 1 + lift, 'T');
		p.put(x + 1, 1 + lift, 'T');
	};
	if (legMode === 'walk') {
		leg(far[0], far[1], 'S');
		leg(near[0], near[1], 's');
	} else if (legMode === 'kneel') {
		for (let x = -4; x <= -1; x++) p.put(x, 1, 'S');
		p.put(-5, 1, 'T');
		for (let u = 2; u <= hip; u++) p.put(2, u, 's');
		p.put(1, hip, 's');
		p.put(2, 1, 'T');
		p.put(3, 1, 'T');
	} else {
		for (let x = -3; x <= 3; x++) p.put(x, 1, x % 2 === 0 ? 's' : 'S');
		for (let x = 1; x <= 3; x++) p.put(x, 2, 's');
		p.put(-3, 1, 'T');
		p.put(3, 1, 'T');
	}

	// tunic, leaning forward a little more toward the top
	const u0 = hipEff + 1;
	const belt = d.child ? -1 : torso - 3;
	let topX0 = 0;
	let topX1 = 0;
	let shTop = 0;
	for (let i = 0; i < torso; i++) {
		const u = u0 + i;
		const sh = lean > 0 ? Math.floor((lean * (i + 1)) / torso) : 0;
		const [a, b] = span(d, i);
		for (let x = a + sh; x <= b + sh; x++) {
			let ch = 'c';
			if (i === torso - 1 && x < b + sh) ch = 'l';
			if (x === b + sh || i === 0) ch = 'C';
			if (i === belt) ch = 'B';
			p.put(x, u, ch);
		}
		if (i === torso - 1) {
			topX0 = a + sh;
			topX1 = b + sh;
			shTop = sh;
		}
	}
	const su = u0 + torso - 1;

	// far arm behind the head, near arm after it
	drawArm(p, topX0 - 1, su, farArm, true);
	drawHead(p, -1 + shTop + (elder ? 1 : 0), su + 1 - drop, style, body);
	const hand = drawArm(p, topX1 + 1, su, nearArm, false);
	drawTool(p, tool, hand, f);
	return p.finish(PERSON_KEY);
}

function drawTool(p: Pix, tool: string, hand: Vec, f: number): void {
	const [hx, hu] = hand;
	switch (tool) {
		case 'stick':
			for (let u = 1; u < hu; u++) p.put(hx, u, 'w');
			break;
		case 'axeUp':
		case 'axeDown': {
			const tx = hx + 2;
			const tu = tool === 'axeUp' ? hu + 3 : hu - 5;
			p.line(hx, hu, tx, tu, 'w');
			p.put(tx, tu, 'K');
			p.put(tx + 1, tu, 'k');
			p.put(tx + 1, tu - 1, 'k');
			break;
		}
		case 'malletUp':
		case 'malletDown': {
			const tx = hx + (tool === 'malletUp' ? 1 : 2);
			const tu = tool === 'malletUp' ? hu + 3 : hu - 3;
			p.line(hx, hu, tx, tu, 'w');
			for (let x = tx - 1; x <= tx + 1; x++) {
				p.put(x, tu, 'W');
				p.put(x, tu + 1, 'w');
			}
			break;
		}
		case 'stone': {
			p.put(hx + 1, hu, 'k');
			p.put(hx + 1, hu + 1, 'k');
			p.put(hx, hu + 1, 'k');
			// the rock being worked sits on the ground in front
			const gx = hx + 2;
			for (let x = gx; x <= gx + 2; x++) p.put(x, 1, 'K');
			p.put(gx + 1, 2, 'k');
			p.put(gx + 2, 2, 'K');
			break;
		}
		case 'spearHeld':
			for (let u = 1; u <= hu + 8; u++) p.put(hx, u, 'w');
			p.put(hx, hu + 9, 'k');
			p.put(hx, hu + 10, 'k');
			break;
		case 'spearAim':
			p.line(hx - 4, hu - 1, hx + 7, hu + 2, 'w');
			p.put(hx + 8, hu + 2, 'k');
			p.put(hx + 9, hu + 3, 'k');
			break;
		case 'rodShoulder':
			p.line(hx - 1, hu - 1, hx + 7, hu + 5, 'w');
			break;
		case 'rod': {
			const tx = hx + 8;
			const tu = hu + 5 + f;
			p.line(hx - 1, hu, tx, tu, 'w');
			for (let u = 2; u < tu; u++) p.put(tx, u, 'f');
			p.put(tx, 2, 'r');
			break;
		}
		default:
			break;
	}
}

// ------------------------------------------------------------ looks and sheets

export type Look = { skin: number; hair: number; style: HairStyle };

export function bodyOf(sex: 'f' | 'm', child: boolean, elder: boolean): BodyKind {
	if (child) return 'child';
	if (elder) return sex === 'f' ? 'elderF' : 'elderM';
	return sex === 'f' ? 'woman' : 'man';
}

// Everything about how someone looks comes from their id.
export function lookOf(id: number, sex: 'f' | 'm', child: boolean, elder: boolean): Look {
	const skin = Math.floor(hash(id, 31) * SKINS.length);
	const hr = hash(id, 32);
	let hair = hr < 0.3 ? 0 : hr < 0.72 ? 1 : hr < 0.84 ? 2 : 3;
	if (elder) hair = GREY_HAIR;
	let style: HairStyle;
	const s = hash(id, 34);
	if (child) style = s < 0.5 ? 'short' : 'long';
	else if (sex === 'f') style = s < 0.55 ? 'long' : s < 0.8 ? 'bun' : 'short';
	else if (elder) style = s < 0.3 ? 'bald' : s < 0.7 ? 'beard' : 'short';
	else style = s < 0.28 ? 'beard' : 'short';
	return { skin, hair, style };
}

export function clothIndex(village: number): number {
	return ((village % CLOTH_COUNT) + CLOTH_COUNT) % CLOTH_COUNT;
}

function recolorOf(cloth: number, skin: number, hair: number): Record<string, Hex> {
	const c = VILLAGE_CLOTH[cloth] as Hex;
	const s = hexOf(SKINS[skin]);
	const h = hexOf(HAIRS[hair]);
	return {
		c,
		C: mix(c, hexOf('ink'), 0.3),
		l: mix(c, '#ffffff', 0.18),
		s,
		S: mix(s, hexOf('soilDark'), 0.25),
		h,
		H: mix(h, hexOf('ink'), 0.4)
	};
}

// A person's sprites for one cloth/skin/hair combination, filled in as used.
export type Sheet = { recolor: Record<string, Hex>; sprites: (Sprite | undefined)[] };
const sheets: (Sheet | undefined)[] = [];

export function sheetFor(cloth: number, look: Look): Sheet {
	const k = (cloth * SKINS.length + look.skin) * HAIRS.length + look.hair;
	let s = sheets[k];
	if (!s) {
		s = { recolor: recolorOf(cloth, look.skin, look.hair), sprites: [] };
		sheets[k] = s;
	}
	return s;
}

const MAXF = 4;
export function personId(body: BodyKind, style: HairStyle, pose: Pose, frame: number): number {
	return (
		((BODIES.indexOf(body) * STYLES.length + STYLES.indexOf(style)) * POSES.length +
			POSES.indexOf(pose)) *
			MAXF +
		(frame % POSE_FRAMES[pose])
	);
}

const personDefs: (SpriteDef | undefined)[] = [];
export function personDef(body: BodyKind, style: HairStyle, pose: Pose, frame: number): SpriteDef {
	const id = personId(body, style, pose, frame);
	return (personDefs[id] ??= buildPerson(body, style, pose, frame));
}

export function personSprite(
	sheet: Sheet,
	body: BodyKind,
	style: HairStyle,
	pose: Pose,
	frame: number
): Sprite {
	const id = personId(body, style, pose, frame);
	return (sheet.sprites[id] ??= sprite(personDef(body, style, pose, frame), sheet.recolor));
}

// What a body does for an activity. Walking wins whenever they are on the move.
export function poseOf(activity: string, moving: boolean): Pose {
	if (moving) return 'walk';
	switch (activity) {
		case 'sleep':
			return 'lie';
		case 'gather':
			return 'chop';
		case 'craft':
			return 'strike';
		case 'build':
			return 'hammer';
		case 'hunt':
			return 'spear';
		case 'fish':
			return 'rod';
		case 'forage':
		case 'drink':
		case 'care':
			return 'kneel';
		case 'eat':
			return 'eat';
		case 'socialize':
			return 'sit';
		case 'teach':
			return 'talk';
		case 'pray':
			return 'pray';
		default:
			return 'stand';
	}
}

// The walking pose for what someone is doing or carrying.
export function walkPose(activity: string, carrying: boolean): Pose {
	if (carrying) return 'carry';
	if (activity === 'hunt') return 'walkSpear';
	if (activity === 'fish') return 'walkRod';
	return 'walk';
}

// ------------------------------------------------------------ carried things

export type ItemKind =
	| 'wood'
	| 'stone'
	| 'berry'
	| 'grain'
	| 'meat'
	| 'root'
	| 'nut'
	| 'clay'
	| 'ore'
	| 'metal'
	| 'copper'
	| 'bronze'
	| 'iron'
	| 'hide'
	| 'fiber'
	| 'tool'
	| 'water'
	| 'fuel'
	| 'mineral'
	| 'goods';

const ITEM_ROWS: Record<ItemKind, { rows: string[]; key: Key }> = {
	wood: { rows: ['swwws', 'wwwww', 'sWWWs'], key: { s: 'sandLight', w: 'wood', W: 'bark' } },
	stone: { rows: ['.aa.', 'abbb', 'bddd'], key: { a: 'stoneLight', b: 'stone', d: 'stoneDark' } },
	berry: { rows: ['.gg.', 'rrrr', 'rBrr'], key: { g: 'leaf', r: 'berry', B: 'ember' } },
	grain: { rows: ['y.y.y', 'yyyyy', '.Y.Y.'], key: { y: 'gold', Y: 'straw' } },
	meat: { rows: ['.mmm', 'mmmM', 'cmMM'], key: { m: 'ember', M: 'berry', c: 'chalk' } },
	root: { rows: ['t.t.', 'tttt', '.tT.'], key: { t: 'sand', T: 'soilLight' } },
	nut: { rows: ['.n.', 'nnN'], key: { n: 'soilLight', N: 'soil' } },
	clay: { rows: ['.cc.', 'cccc', 'cRRR'], key: { c: 'clay', R: 'rust' } },
	ore: { rows: ['.dd.', 'dOOd', 'dddd'], key: { d: 'stoneDark', O: 'copper' } },
	metal: { rows: ['tttt', 'bbbb'], key: { t: 'tin', b: 'stone' } },
	copper: { rows: ['gggg', 'OOOO'], key: { g: 'orange', O: 'ochre' } },
	bronze: { rows: ['gggg', 'OOOO'], key: { g: 'gold', O: 'ochre' } },
	iron: { rows: ['aaaa', 'bbbb'], key: { a: 'stone', b: 'stoneDark' } },
	hide: { rows: ['hhhh', 'hHHh', '.hh.'], key: { h: 'wood', H: 'soilLight' } },
	fiber: { rows: ['g.g.g', 'ggggg', 'GGGGG'], key: { g: 'moss', G: 'grass' } },
	tool: { rows: ['.aa', '.w.', 'w..'], key: { a: 'stoneLight', w: 'wood' } },
	water: { rows: ['cwwc', 'cccc'], key: { c: 'clay', w: 'waterLight' } },
	fuel: { rows: ['.dd.', 'dKdd', 'dddd'], key: { d: 'obsidian', K: 'stoneDark' } },
	mineral: { rows: ['.ww.', 'wwww', 'wWWw'], key: { w: 'chalk', W: 'stoneLight' } },
	goods: { rows: ['ssss', 'sSsS', 'SSSS'], key: { s: 'straw', S: 'wood' } }
};
export const ITEM_KINDS = Object.keys(ITEM_ROWS) as ItemKind[];

const itemKey = (key: Key): Key => ({ o: 'ink', ...key });
const itemDefs = new Map<ItemKind, SpriteDef>();
export function itemDef(kind: ItemKind): SpriteDef {
	let d = itemDefs.get(kind);
	if (!d) {
		const r = ITEM_ROWS[kind];
		d = fromRows(r.rows, itemKey(r.key));
		itemDefs.set(kind, d);
	}
	return d;
}

const itemKinds = new Map<string, ItemKind>();
// What a carried thing looks like, by the kind of material it is.
export function itemKindOf(id: string): ItemKind {
	let c = itemKinds.get(id);
	if (c) return c;
	const kind = MATERIALS[id]?.kind;
	if (/copper/.test(id)) c = 'copper';
	else if (/bronze/.test(id)) c = 'bronze';
	else if (/iron/.test(id)) c = 'iron';
	else if (/grass|reed|flax/.test(id)) c = 'fiber';
	else if (kind === 'food') {
		if (/berr/.test(id)) c = 'berry';
		else if (/nut/.test(id)) c = 'nut';
		else if (/root/.test(id)) c = 'root';
		else if (/grain/.test(id)) c = 'grain';
		else if (/meat|fish|fat/.test(id)) c = 'meat';
		else c = hash(id.length, id.charCodeAt(0) | 0) < 0.5 ? 'berry' : 'root';
	} else {
		switch (kind) {
			case 'stone':
				c = 'stone';
				break;
			case 'mineral':
				c = 'mineral';
				break;
			case 'liquid':
				c = 'water';
				break;
			case 'wood':
				c = 'wood';
				break;
			case 'fuel':
				c = 'fuel';
				break;
			case 'fiber':
				c = 'fiber';
				break;
			case 'animal':
				c = 'hide';
				break;
			case 'clay':
				c = 'clay';
				break;
			case 'ore':
				c = 'ore';
				break;
			case 'metal':
				c = 'metal';
				break;
			case 'tool':
				c = 'tool';
				break;
			default:
				c = 'goods';
		}
	}
	itemKinds.set(id, c);
	return c;
}

const itemSprites = new Map<ItemKind, Sprite>();
export function itemSprite(kind: ItemKind): Sprite {
	let s = itemSprites.get(kind);
	if (!s) {
		s = sprite(itemDef(kind));
		itemSprites.set(kind, s);
	}
	return s;
}

// ------------------------------------------------------------ small effects

const BUBBLE_KEY: Key = { o: 'ink', w: 'white', i: 'stoneDark' };
export const BUBBLE_DEFS: SpriteDef[] = [
	fromRows(['wwwwwww', 'wiwiwiw', 'wwwwwww', '..w....'], BUBBLE_KEY),
	fromRows(['wwwwwww', 'wwiwiwi', 'wwwwwww', '..w....'], BUBBLE_KEY)
];
export const Z_DEF: SpriteDef = fromRows(['zzz', '.z.', 'zzz'], { o: 'ink', z: 'white' });

const bubbleSprites: Sprite[] = [];
export function bubbleSprite(frame: number): Sprite {
	return (bubbleSprites[frame & 1] ??= sprite(BUBBLE_DEFS[frame & 1]));
}
let zSprite: Sprite | null = null;
export function sleepZ(): Sprite {
	return (zSprite ??= sprite(Z_DEF));
}

// ------------------------------------------------------------ map icons

const ICON_PERSON: SpriteDef = {
	key: { s: 'skin2', c: CLOTH0, C: mix(CLOTH0, hexOf('ink'), 0.35) },
	rows: ['.s.', 'ccc', '.c.', 'C.C']
};
const ICON_CHILD: SpriteDef = {
	key: { s: 'skin2', c: CLOTH0, C: mix(CLOTH0, hexOf('ink'), 0.35) },
	rows: ['.s.', 'ccc', 'C.C'],
	foot: [1, 2]
};
export const PERSON_ICONS = { adult: ICON_PERSON, child: ICON_CHILD };

const iconSprites: (Sprite | undefined)[] = [];
export function personIcon(cloth: number, child: boolean): Sprite {
	const k = cloth * 2 + (child ? 1 : 0);
	return (iconSprites[k] ??= sprite(child ? ICON_CHILD : ICON_PERSON, recolorOf(cloth, 1, 1)));
}

// ------------------------------------------------------------ animals

export type AnimalKind = 'deer' | 'aurochs' | 'boar' | 'goat' | 'wolf';
export const ANIMAL_KINDS: AnimalKind[] = ['deer', 'aurochs', 'boar', 'goat', 'wolf'];
// stand, two walk frames, graze
export const ANIMAL_STATES = 4;

type AnimalSpec = {
	key: Key;
	// alternate coat for a second look
	alt: Record<string, Hex>;
	top: string[];
	// leg columns: far back, near back, far front, near front
	legs: number[];
	legRows: number;
	graze: string[];
	// extra rows above the head for the stag's antlers (variant 1), deer only
	crown?: string[];
	// where a tame animal's collar goes, art px from the foot: [x, up]
	collar: Vec;
};

const ANIMALS: Record<AnimalKind, AnimalSpec> = {
	deer: {
		key: {
			o: 'ink',
			b: 'wood',
			d: 'bark',
			l: 'sandLight',
			w: 'white',
			a: 'chalk',
			n: 'ink'
		},
		alt: { b: hexOf('soilLight'), d: hexOf('soil') },
		top: [
			'........bb..',
			'.......bbbbn',
			'.......bbb..',
			'wbbbbbbbb...',
			'wbbbbbbbbb..',
			'.lllllll....'
		],
		legs: [1, 2, 8, 9],
		legRows: 3,
		graze: [
			'............',
			'............',
			'............',
			'wbbbbbbb....',
			'wbbbbbbbbb..',
			'.lllllllbbb.',
			'.db...db.bb.',
			'.db...db.bbn',
			'.nn...nn....'
		],
		crown: ['.......a.a..', '........aa..'],
		collar: [3, 5]
	},
	aurochs: {
		key: { o: 'ink', b: 'soilDark', d: 'barkDark', a: 'chalk', n: 'ink', l: 'soil' },
		alt: { b: hexOf('soil'), d: hexOf('soilDark'), l: hexOf('soilLight') },
		top: [
			'.......bbbb.......',
			'..bbbbbbbbbbb.a..a',
			'dbbbbbbbbbbbbbbbbn',
			'dbbbbbbbbbbbbbbbb.',
			'.llllllllll.....'
		],
		legs: [3, 4, 11, 12],
		legRows: 4,
		graze: [
			'..................',
			'.......bbbb.......',
			'..bbbbbbbbbbb.....',
			'dbbbbbbbbbbbbbb...',
			'dbbbbbbbbbbbbbbbb.',
			'.llllllllll.baabn.',
			'...dd......dd.baan',
			'...dd......dd.....',
			'...dd......dd.....',
			'...nn......nn.....'
		],
		collar: [5, 7]
	},
	boar: {
		key: { o: 'ink', b: 'barkDark', d: 'obsidian', l: 'soilLight', t: 'chalk', n: 'ink' },
		alt: { b: hexOf('soil'), d: hexOf('barkDark') },
		top: ['..dddddd..', 'bbbbbbbbbb', 'bbbbbbbbbn', '.lllllllt.'],
		legs: [1, 2, 7, 8],
		legRows: 2,
		graze: ['..dddddd..', 'bbbbbbbbb.', 'bbbbbbbbbb', '.llllllbbn', '.dd...dd.t'],
		collar: [3, 3]
	},
	goat: {
		key: { o: 'ink', b: 'chalk', d: 'stoneLight', a: 'sand', n: 'ink' },
		alt: { b: hexOf('sand'), d: hexOf('soilLight') },
		top: ['......a.a', '.....bbbn', '.bbbbbbb.', 'bbbbbbbb.', '.dddd....'],
		legs: [1, 2, 6, 7],
		legRows: 3,
		graze: ['.........', '.bbbbbb..', 'bbbbbbbb.', '.dddd.bbb', '.dd.ddbbn', '.dd.dd...'],
		collar: [3, 5]
	},
	wolf: {
		key: { o: 'ink', b: 'stone', d: 'stoneDark', l: 'stoneLight', n: 'ink' },
		alt: { b: hexOf('stoneDark'), d: hexOf('obsidian'), l: hexOf('stone') },
		top: ['.........b.b', '.........bbb', 'dd.bbbbbbbbn', '.dbbbbbbbb..', '..dlllll....'],
		legs: [3, 4, 8, 9],
		legRows: 3,
		graze: [
			'............',
			'dd.bbbbbb...',
			'.dbbbbbbbbb.',
			'..dlllllbbbb',
			'..dd...dd.bn',
			'..dd...dd...',
			'..nn...nn...'
		],
		collar: [3, 4]
	}
};

function legRows(spec: AnimalSpec, state: number): string[] {
	const w = Math.max(...spec.top.map((r) => r.length));
	const rows: string[] = [];
	// walking swings the legs in pairs by a pixel or two
	const swing = state === 1 ? 1 : state === 2 ? -1 : 0;
	for (let r = 0; r < spec.legRows; r++) {
		const line = new Array<string>(w).fill('.');
		const last = r === spec.legRows - 1;
		for (let i = 0; i < 4; i++) {
			const far = i % 2 === 0;
			const front = i >= 2;
			const dir = (front ? 1 : -1) * (far ? -swing : swing);
			const c = spec.legs[i] + Math.round((dir * (r + 1)) / 2);
			if (c >= 0 && c < w) line[c] = last ? 'n' : far ? 'd' : 'b';
		}
		rows.push(line.join(''));
	}
	return rows;
}

const animalDefs = new Map<string, SpriteDef>();
export function animalDef(kind: AnimalKind, state: number, variant: number): SpriteDef {
	const id = `${kind}${state}${variant}`;
	let d = animalDefs.get(id);
	if (d) return d;
	const spec = ANIMALS[kind];
	let rows: string[];
	if (state === 3) rows = spec.graze.slice();
	else rows = [...spec.top, ...legRows(spec, state)];
	if (variant === 1 && spec.crown && state !== 3) rows = [...spec.crown, ...rows];
	const key: Key = { ...spec.key };
	if (variant === 1 && !spec.crown) Object.assign(key, spec.alt);
	d = fromRows(rows, key, true, 0.5);
	animalDefs.set(id, d);
	return d;
}

export function animalKindOf(kind: string): AnimalKind {
	return (ANIMAL_KINDS as string[]).includes(kind) ? (kind as AnimalKind) : 'goat';
}

export function animalCollar(kind: AnimalKind): Vec {
	return ANIMALS[kind].collar;
}

const animalSprites = new Map<string, (Sprite | undefined)[]>();
export function animalSprite(kind: AnimalKind, state: number, variant: number): Sprite {
	let list = animalSprites.get(kind);
	if (!list) {
		list = [];
		animalSprites.set(kind, list);
	}
	const i = variant * ANIMAL_STATES + state;
	return (list[i] ??= sprite(animalDef(kind, state, variant)));
}

// 4–6 pixel herd icons for the map view
const ICON_ANIMALS: Record<AnimalKind, { rows: string[]; key: Key }> = {
	deer: {
		rows: ['...bb.', '.bbbbb', 'bbbbb.', 'd.d.d.'],
		key: { b: 'wood', d: 'bark' }
	},
	aurochs: {
		rows: ['.bbb.a', 'bbbbbb', 'bbbbbb', 'd.d.d.'],
		key: { b: 'soilDark', d: 'ink', a: 'chalk' }
	},
	boar: { rows: ['.dddd', 'bbbbbb', 'd.d.d'], key: { b: 'barkDark', d: 'ink' } },
	goat: {
		rows: ['..a.b', '.bbbb', 'bbbb.', 'd.d.d'],
		key: { b: 'chalk', d: 'stoneLight', a: 'sand' }
	},
	wolf: { rows: ['.d..bb', 'bbbbbb', 'd.d.d.'], key: { b: 'stone', d: 'stoneDark' } }
};
export const HERD_ICON_DEFS: Record<AnimalKind, SpriteDef> = {
	deer: fromRows(ICON_ANIMALS.deer.rows, ICON_ANIMALS.deer.key, false),
	aurochs: fromRows(ICON_ANIMALS.aurochs.rows, ICON_ANIMALS.aurochs.key, false),
	boar: fromRows(ICON_ANIMALS.boar.rows, ICON_ANIMALS.boar.key, false),
	goat: fromRows(ICON_ANIMALS.goat.rows, ICON_ANIMALS.goat.key, false),
	wolf: fromRows(ICON_ANIMALS.wolf.rows, ICON_ANIMALS.wolf.key, false)
};
const herdIcons = new Map<AnimalKind, Sprite>();
export function herdIcon(kind: AnimalKind): Sprite {
	let s = herdIcons.get(kind);
	if (!s) {
		s = sprite(HERD_ICON_DEFS[kind]);
		herdIcons.set(kind, s);
	}
	return s;
}
