import { MATERIALS } from '../discovery/materials';
import type { PersonView } from '../types';
import type { Camera } from './camera';
import { villageColor } from './palette';
import { hash, type DrawState, type Standing, type View } from './scene';

// the zooms the old close-up crossfade ran between (replaced by pixel modes)
const DETAIL_START = 18;
const DETAIL_FULL = 60;

// People and animals. Zoomed out they are the old coloured dots; up close they
// are small figures drawn in code, in metres, so their size matches the trees
// and buildings around them. Everything about how someone looks comes from
// hash(id), never from chance.

const TAU = Math.PI * 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ADULT_M = 1.7;
// People and animals are drawn larger than life, as games of this kind do, so
// a figure reads clearly next to trees and huts. Only their size changes,
// not where they stand.
export const FIGURE_SCALE = 1.6;
// history runs fast, so a drawn person eases toward where they "are" instead
// of sprinting: this is how long (seconds) it takes to cover most of a move
const PERSON_TAU = 0.55;
const HERD_TAU = 1.1;
// a jump bigger than this (tiles) is a teleport, not a walk, so just snap
const SNAP_TILES = 14;
const MAX_ANIMALS = 12;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (v: number, lo: number, hi: number) => {
	const t = clamp((v - lo) / (hi - lo), 0, 1);
	return t * t * (3 - 2 * t);
};
const frac = (v: number) => v - Math.floor(v);

// How much of the close-up figure to show (0 = just the dot). Figures only
// read once they are several pixels tall, so the crossfade also waits for that.
export function closeUpAmount(detail: number, ppm: number, heightM = ADULT_M): number {
	return detail * smooth(ppm * heightM, 7, 15);
}

function detailOfZoom(zoom: number): number {
	const t =
		(Math.log(zoom) - Math.log(DETAIL_START)) / (Math.log(DETAIL_FULL) - Math.log(DETAIL_START));
	return clamp(t, 0, 1);
}

// ------------------------------------------------------------ easing state

type Look = { skin: string; hair: string; long: boolean; bun: boolean; bald: boolean };

type Mover = {
	x: number;
	y: number;
	t: number;
	seen: number;
	moving: boolean;
	// direction of travel (radians) and which way a person faces
	ang: number;
	face: 1 | -1;
	// walk cycle, advanced by how fast they actually move
	phase: number;
	look: Look | null;
	lookKey: number;
};

const people = new Map<number, Mover>();
const herdMovers = new Map<number, Mover>();
let frameId = 0;
// the last frame's close-up amount, so personPosition (called from
// the camera and from clicking) agrees with what was drawn
let lastDetail = 0;

function newMover(x: number, y: number, now: number, seed: number): Mover {
	return {
		x,
		y,
		t: now,
		seen: frameId,
		moving: false,
		ang: hash(seed, 21) * TAU,
		face: hash(seed, 22) < 0.5 ? 1 : -1,
		phase: hash(seed, 23) * TAU,
		look: null,
		lookKey: -1
	};
}

function snapTo(m: Mover, tx: number, ty: number, now: number): void {
	m.x = tx;
	m.y = ty;
	m.t = now;
	m.moving = false;
}

// Move m toward the target by an exponential ease. Safe to call many times
// with the same `now` (only the first call moves it).
function advance(m: Mover, tx: number, ty: number, now: number, tau: number): void {
	if (m.t === now) return;
	const dt = (now - m.t) / 1000;
	const dx = tx - m.x;
	const dy = ty - m.y;
	const dist = Math.hypot(dx, dy);
	if (dt < 0 || dt > 1.5 || dist > SNAP_TILES || dist < 0.002) {
		snapTo(m, tx, ty, now);
		return;
	}
	m.t = now;
	const k = 1 - Math.exp(-dt / tau);
	const sx = dx * k;
	const sy = dy * k;
	m.x += sx;
	m.y += sy;
	const speed = Math.hypot(sx, sy) / dt; // tiles per second
	const left = Math.hypot(tx - m.x, ty - m.y);
	// hysteresis so the walk cycle doesn't flicker at the end of a move
	if (!m.moving && left > 0.05) m.moving = true;
	else if (m.moving && left < 0.02) m.moving = false;
	if (m.moving) {
		if (speed > 0.02) m.ang = Math.atan2(sy, sx);
		if (Math.abs(sx) > 1e-5) m.face = sx > 0 ? 1 : -1;
		// ~28 tiles/s of travel per gait cycle per second (1.4 m stride), capped
		m.phase += clamp(speed * 28.6, 0.6, 3) * TAU * dt;
	}
}

// ------------------------------------------------------------ in-tile spots

const WORKING = new Set(['gather', 'craft', 'build', 'fish', 'hunt', 'forage', 'drink', 'eat']);
const GATHERED = new Set(['socialize', 'teach', 'care', 'pray']);

// Where in its tile (offset from the centre, in tiles) a person stands.
// Sleepers lie close in, people who talk or pray ring round the middle (the
// fire), workers stand at their own spot near the work.
export function spotInto(out: { dx: number; dy: number }, id: number, activity: string): void {
	let angle = hash(id, 11) * TAU;
	let r = Math.sqrt(hash(id, 12)) * 0.34;
	if (activity === 'sleep') {
		angle = hash(id, 13) * TAU;
		r = 0.1 + hash(id, 12) * 0.2;
	} else if (GATHERED.has(activity)) {
		angle = hash(id, 14) * TAU;
		r = 0.15 + hash(id, 12) * 0.08;
	} else if (WORKING.has(activity)) {
		angle = hash(id, 15) * TAU;
		r = 0.12 + Math.sqrt(hash(id, 12)) * 0.24;
	}
	out.dx = Math.cos(angle) * r;
	out.dy = Math.sin(angle) * r * 0.85;
}

const spot = { dx: 0, dy: 0 };

function positionInto(person: PersonView, now: number, out: { x: number; y: number }): void {
	spotInto(spot, person.id, person.activity);
	const tx = person.x + 0.5 + spot.dx;
	const ty = person.y + 0.5 + spot.dy;
	let m = people.get(person.id);
	if (!m) {
		m = newMover(tx, ty, now, person.id);
		people.set(person.id, m);
	}
	m.seen = frameId;
	if (lastDetail <= 0) {
		// zoomed out: the tile centre, but keep the state in step so zooming in
		// doesn't slide everyone in from the wrong place
		snapTo(m, tx, ty, now);
		out.x = person.x + 0.5;
		out.y = person.y + 0.5;
		return;
	}
	advance(m, tx, ty, now, PERSON_TAU);
	out.x = person.x + 0.5 + (m.x - person.x - 0.5) * lastDetail;
	out.y = person.y + 0.5 + (m.y - person.y - 0.5) * lastDetail;
}

// The eased on-screen position (tiles) used for drawing, following and clicking.
export function personPosition(person: PersonView, now: number): { x: number; y: number } {
	const out = { x: 0, y: 0 };
	positionInto(person, now, out);
	return out;
}

// ------------------------------------------------------------ appearance

const SKIN = [
	'#f3cfae',
	'#e6b88e',
	'#d29c6f',
	'#bb8052',
	'#9a6439',
	'#7b4a2b',
	'#5c3822',
	'#e0ac7e'
];
const HAIR = [
	'#1e1915',
	'#2c2119',
	'#46301f',
	'#65462a',
	'#8b5a2b',
	'#a8442a',
	'#b98d52',
	'#d6b878'
];
const GREY = ['#b7b6b1', '#cfcfca', '#9d9c98'];

export function lookOf(id: number, sex: 'f' | 'm', child: boolean, elder: boolean): Look {
	const skin = SKIN[Math.floor(hash(id, 31) * SKIN.length)];
	let hair = HAIR[Math.floor(hash(id, 32) * HAIR.length)];
	if (elder) hair = GREY[Math.floor(hash(id, 33) * GREY.length)];
	const longChance = sex === 'f' ? 0.75 : 0.25;
	return {
		skin,
		hair,
		long: hash(id, 34) < longChance && !child,
		bun: hash(id, 35) < 0.4,
		bald: elder && sex === 'm' && hash(id, 36) < 0.3
	};
}

// Height scale against a 1.7 m adult.
export function scaleOf(p: Pick<PersonView, 'id' | 'sex' | 'child' | 'elder'>): number {
	if (p.child) return 0.62 + hash(p.id, 3) * 0.1;
	const base = 0.96 + hash(p.id, 3) * 0.07;
	return (p.sex === 'f' ? base * 0.96 : base) * (p.elder ? 0.96 : 1);
}

const CARRY_COLORS: Record<string, string> = {
	stone: '#8d8d88',
	mineral: '#c8bfa6',
	liquid: '#6aa8d6',
	wood: '#7a5230',
	fuel: '#2d2a28',
	fiber: '#b9a35e',
	animal: '#b08a62',
	clay: '#b8683a',
	ore: '#7a6a62',
	metal: '#9ab0bf',
	tool: '#9a8a70',
	structure: '#8a7a62',
	goods: '#a8845a'
};
const carryCache = new Map<string, string>();

// What a carried thing looks like, by the kind of material it is.
export function carryColor(id: string): string {
	let c = carryCache.get(id);
	if (c) return c;
	const kind = MATERIALS[id]?.kind;
	if (/copper/.test(id)) c = '#c27a46';
	else if (/bronze/.test(id)) c = '#b08a3e';
	else if (/iron/.test(id)) c = '#6c7480';
	else if (/grass|reed|flax/.test(id)) c = '#8aa352';
	else if (kind === 'food') {
		if (/berr/.test(id)) c = '#b8343a';
		else if (/nut/.test(id)) c = '#8a6a40';
		else if (/root/.test(id)) c = '#b98a55';
		else if (/grain/.test(id)) c = '#d3bd62';
		else if (/meat|fish|fat/.test(id)) c = '#c95b4a';
		else c = hash(id.length, id.charCodeAt(0) | 0) < 0.5 ? '#bf4a3d' : '#6f9a4a';
	} else c = (kind && CARRY_COLORS[kind]) || '#a0865a';
	carryCache.set(id, c);
	return c;
}

// ------------------------------------------------------------ poses

export type Pose =
	| 'walk'
	| 'stand'
	| 'chop'
	| 'strike'
	| 'hammer'
	| 'spear'
	| 'rod'
	| 'kneel'
	| 'sit'
	| 'lie'
	| 'pray'
	| 'talk';

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

// ------------------------------------------------------------ slots

// One reusable record per thing drawn, with its draw function made once, so a
// busy frame makes no garbage.
type AnimalSpec = {
	len: number;
	wid: number;
	body: string;
	dark: string;
	light: string;
};
const ANIMALS: Record<string, AnimalSpec> = {
	deer: { len: 1.25, wid: 0.42, body: '#b98d5c', dark: '#9c7048', light: '#ecdcc0' },
	aurochs: { len: 2.0, wid: 0.85, body: '#3a2e27', dark: '#2a211c', light: '#e6dfc9' },
	boar: { len: 1.2, wid: 0.55, body: '#54453a', dark: '#2c241d', light: '#d9d2c4' },
	goat: { len: 0.95, wid: 0.36, body: '#e7e0d1', dark: '#8f866f', light: '#f6f2e8' },
	wolf: { len: 1.15, wid: 0.34, body: '#8a766a', dark: '#5f5149', light: '#b9a898' }
};
const OTHER_ANIMAL: AnimalSpec = {
	len: 1.1,
	wid: 0.42,
	body: '#a58660',
	dark: '#7a6044',
	light: '#d8c6a4'
};

const Kind = { person: 0, animal: 1, dots: 2 } as const;

class Slot {
	st: Standing;
	kind: number = Kind.person;
	sx = 0;
	sy = 0;
	g = 0;
	ppm = 1;
	zoom = 1;
	now = 0;
	theme: 'light' | 'dark' = 'light';
	// people
	face = 1;
	scale = 1;
	pose: Pose = 'stand';
	activity = '';
	walkPh = 0;
	ph0 = 0;
	elder = false;
	child = false;
	female = false;
	tunic = '';
	carry = '';
	look: Look | null = null;
	// animals and herd dots
	spec = OTHER_ANIMAL;
	akind = '';
	heading = 0;
	aph = 0;
	moving = false;
	tame = false;
	special = false;
	count = 0;
	herdId = 0;
	constructor() {
		this.st = { y: 0, draw: (ctx) => this.render(ctx) };
	}
	render(ctx: CanvasRenderingContext2D): void {
		if (this.kind === Kind.person) drawPersonSlot(ctx, this);
		else if (this.kind === Kind.animal) drawAnimal(ctx, this);
		else drawHerdDots(ctx, this);
	}
}

const slots: Slot[] = [];
let used = 0;
function takeSlot(): Slot {
	if (used === slots.length) slots.push(new Slot());
	return slots[used++];
}

const posTmp = { x: 0, y: 0 };

export function collectActors(state: DrawState, view: View, out: Standing[]): void {
	frameId++;
	used = 0;
	lastDetail = view.detail;
	const { camera, now } = state;
	const w2 = camera.width / 2;
	const h2 = camera.height / 2;
	const ppm = view.ppm * FIGURE_SCALE;
	const zoom = view.zoom;
	const gPerson = closeUpAmount(view.detail, ppm);

	for (const p of state.people) {
		positionInto(p, now, posTmp);
		const m = people.get(p.id);
		if (!m) continue;
		const sx = (posTmp.x - camera.x) * zoom + w2;
		const sy = (posTmp.y - camera.y) * zoom + h2;
		const reach = gPerson > 0 ? 3 * ppm + 12 : 12;
		if (sx < -reach || sy < -reach * 1.6 || sx > camera.width + reach || sy > camera.height + reach)
			continue;
		const s = takeSlot();
		s.kind = Kind.person;
		s.st.y = posTmp.y;
		s.sx = sx;
		s.sy = sy;
		s.g = gPerson;
		s.ppm = ppm;
		s.zoom = zoom;
		s.now = now;
		s.theme = state.theme;
		s.activity = p.activity;
		s.tunic = villageColor(p.village);
		s.child = p.child;
		s.elder = p.elder;
		s.female = p.sex === 'f';
		if (gPerson > 0) {
			const key = (p.elder ? 1 : 0) | (p.child ? 2 : 0) | (p.sex === 'f' ? 4 : 0);
			if (!m.look || m.lookKey !== key) {
				m.look = lookOf(p.id, p.sex, p.child, p.elder);
				m.lookKey = key;
			}
			s.look = m.look;
			s.scale = scaleOf(p);
			s.face = m.face;
			s.walkPh = m.phase;
			s.ph0 = hash(p.id, 41) * TAU;
			s.pose = poseOf(p.activity, m.moving);
			s.carry = p.carrying ? carryColor(p.carrying) : '';
		}
		out.push(s.st);
	}
	if (people.size > state.people.length) {
		for (const [id, m] of people) if (m.seen !== frameId) people.delete(id);
	}

	collectHerds(state, view, out);
}

function collectHerds(state: DrawState, view: View, out: Standing[]): void {
	const { camera, now } = state;
	const w2 = camera.width / 2;
	const h2 = camera.height / 2;
	const ppm = view.ppm * FIGURE_SCALE;
	const zoom = view.zoom;
	const gHerd = closeUpAmount(view.detail, ppm, 1.3);

	for (const herd of state.herds) {
		let m = herdMovers.get(herd.id);
		const tx = herd.x + 0.5;
		const ty = herd.y + 0.5;
		if (!m) {
			m = newMover(tx, ty, now, herd.id);
			herdMovers.set(herd.id, m);
		}
		m.seen = frameId;
		if (view.detail <= 0) snapTo(m, tx, ty, now);
		else advance(m, tx, ty, now, HERD_TAU);
		const cx = view.detail <= 0 ? tx : m.x;
		const cy = view.detail <= 0 ? ty : m.y;

		const n = Math.min(herd.count, MAX_ANIMALS);
		const radius = herd.tame ? Math.min(0.9, 0.3 + 0.08 * n) : Math.min(3, 0.8 + 0.28 * n);
		const hx = (cx - camera.x) * zoom + w2;
		const hy = (cy - camera.y) * zoom + h2;
		const margin = radius * zoom + 4 * ppm + 20;
		if (hx < -margin || hy < -margin || hx > camera.width + margin || hy > camera.height + margin)
			continue;

		if (gHerd < 1) {
			const s = takeSlot();
			s.kind = Kind.dots;
			s.st.y = cy;
			s.sx = hx;
			s.sy = hy;
			s.g = gHerd;
			s.zoom = zoom;
			s.akind = herd.kind;
			s.tame = herd.tame;
			s.count = herd.count;
			s.herdId = herd.id;
			out.push(s.st);
		}
		if (gHerd <= 0) continue;

		const spec = ANIMALS[herd.kind] ?? OTHER_ANIMAL;
		const t = now / 1000;
		for (let i = 0; i < n; i++) {
			const a = hash(herd.id, i, 1) * TAU;
			const r = Math.sqrt(hash(herd.id, i, 2)) * radius;
			const ph = hash(herd.id, i, 3) * TAU;
			// a slow idle drift so a standing herd is not frozen
			const ox = Math.cos(a) * r + Math.sin(t * 0.21 + ph) * 0.07;
			const oy = Math.sin(a) * r * 0.85 + Math.cos(t * 0.17 + ph) * 0.06;
			const wx = cx + ox;
			const wy = cy + oy;
			const sx = (wx - camera.x) * zoom + w2;
			const sy = (wy - camera.y) * zoom + h2;
			const reach = spec.len * ppm * 1.6 + 10;
			if (sx < -reach || sy < -reach || sx > camera.width + reach || sy > camera.height + reach)
				continue;
			const s = takeSlot();
			s.kind = Kind.animal;
			s.st.y = wy;
			s.sx = sx;
			s.sy = sy;
			s.g = gHerd;
			s.ppm = ppm;
			s.now = now;
			s.spec = spec;
			s.akind = herd.kind;
			s.tame = herd.tame;
			s.aph = ph;
			s.moving = m.moving;
			s.walkPh = m.phase + ph * 0.3;
			s.heading = m.moving
				? m.ang + (hash(herd.id, i, 4) - 0.5) * 0.7
				: hash(herd.id, i, 4) * TAU + Math.sin(t * 0.13 + ph) * 0.5;
			s.special = hash(herd.id, i, 5) < (herd.kind === 'deer' ? 0.3 : 0.35);
			out.push(s.st);
		}
	}
	if (herdMovers.size > state.herds.length) {
		for (const [id, m] of herdMovers) if (m.seen !== frameId) herdMovers.delete(id);
	}
}

// ------------------------------------------------------------ drawing: dots

function drawHerdDots(ctx: CanvasRenderingContext2D, s: Slot): void {
	const wolf = s.akind === 'wolf';
	const r = clamp(s.zoom * 0.16, 1.4, 4);
	const dots = Math.max(1, Math.min(5, s.count));
	const spread = Math.min(3, 1 + dots * 0.4) * s.zoom * 0.35;
	ctx.globalAlpha = 1 - s.g;
	ctx.fillStyle = wolf ? '#b8433a' : s.tame ? '#c9a46a' : '#8a6a47';
	for (let n = 0; n < dots; n++) {
		const px = s.sx + (hash(s.herdId, n, 6) - 0.5) * spread * 2;
		const py = s.sy + (hash(s.herdId, n, 7) - 0.5) * spread * 2;
		ctx.beginPath();
		if (wolf) {
			ctx.moveTo(px, py - r * 1.2);
			ctx.lineTo(px + r, py + r * 0.9);
			ctx.lineTo(px - r, py + r * 0.9);
			ctx.closePath();
		} else ctx.arc(px, py, r, 0, TAU);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function dotRadius(zoom: number, child: boolean): number {
	const base = clamp(1.6 + zoom * 0.18, 2, 7);
	return child ? base * 0.7 : base;
}

// ------------------------------------------------------------ drawing: people

const LEG_BACK = '#4f4333';
const LEG_FRONT = '#5e4f3d';
const WOOD = '#7a5230';
const STONE = '#8d8d88';

let handX = 0;
let handY = 0;

// An arm from a shoulder at angle `theta` (0 = hanging, + = forward, pi = up),
// tunic sleeve first then bare forearm. Leaves the hand's spot in handX/Y.
function arm(
	ctx: CanvasRenderingContext2D,
	sx: number,
	sy: number,
	theta: number,
	sleeve: string,
	skin: string
): void {
	const dx = Math.sin(theta);
	const dy = Math.cos(theta);
	handX = sx + dx * 0.52;
	handY = sy + dy * 0.52;
	ctx.lineCap = 'round';
	ctx.strokeStyle = skin;
	ctx.lineWidth = 0.095;
	ctx.beginPath();
	ctx.moveTo(sx + dx * 0.15, sy + dy * 0.15);
	ctx.lineTo(handX, handY);
	ctx.stroke();
	ctx.strokeStyle = sleeve;
	ctx.lineWidth = 0.12;
	ctx.beginPath();
	ctx.moveTo(sx, sy);
	ctx.lineTo(sx + dx * 0.17, sy + dy * 0.17);
	ctx.stroke();
}

function line(
	ctx: CanvasRenderingContext2D,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: string,
	w: number
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = w;
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	ctx.lineTo(x1, y1);
	ctx.stroke();
}

// A swing that rises slowly and comes down fast, 0..1..0
function chopAngle(t: number, ph: number, rate: number, lo: number, hi: number): number {
	const s = frac(t * rate + ph / TAU);
	return s < 0.7 ? lo + (hi - lo) * (s / 0.7) : hi + (lo - hi) * ((s - 0.7) / 0.3);
}

function drawPersonSlot(ctx: CanvasRenderingContext2D, s: Slot): void {
	const g = s.g;
	if (g < 1) {
		const r = dotRadius(s.zoom, s.child);
		ctx.globalAlpha = (1 - g) * (s.activity === 'sleep' ? 0.5 : 1);
		ctx.fillStyle = s.tunic;
		ctx.strokeStyle = s.theme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.75)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(s.sx, s.sy, r, 0, TAU);
		ctx.fill();
		ctx.stroke();
	}
	if (g > 0 && s.look) {
		ctx.globalAlpha = g * (s.pose === 'lie' ? 0.82 : 1);
		drawFigure(ctx, s, s.look);
	}
	ctx.globalAlpha = 1;
}

function drawFigure(ctx: CanvasRenderingContext2D, s: Slot, look: Look): void {
	const t = s.now / 1000;
	const ph = s.ph0;
	const pose = s.pose;
	const k = s.ppm * s.scale;
	const headR = s.child ? 0.16 : 0.13;
	const lie = pose === 'lie';

	ctx.save();
	ctx.translate(s.sx, s.sy);
	ctx.scale(k * s.face, k);

	// soft shadow
	ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
	ctx.beginPath();
	if (lie) ctx.ellipse(-0.1, 0.02, 1.0, 0.26, 0, 0, TAU);
	else ctx.ellipse(0, 0.03, 0.36, 0.13, 0, 0, TAU);
	ctx.fill();

	if (lie) {
		drawLying(ctx, s, look, t, headR);
		ctx.restore();
		drawSleepZ(ctx, s, t);
		return;
	}

	const walking = pose === 'walk';
	const cyc = s.walkPh;
	const sw = Math.sin(cyc);
	let hipY = -0.82;
	let lean = 0;
	switch (pose) {
		case 'walk':
			hipY += -Math.abs(Math.cos(cyc)) * 0.035;
			lean = 0.07;
			break;
		case 'kneel':
			hipY = -0.4;
			lean = 0.62;
			break;
		case 'sit':
			hipY = -0.2;
			lean = 0.12;
			break;
		case 'chop':
		case 'hammer':
			lean = 0.18;
			break;
		case 'strike':
			lean = 0.3;
			break;
		case 'pray':
			lean = -0.06;
			break;
		default:
			hipY += Math.sin(t * 1.7 + ph) * 0.006;
	}
	if (s.elder) lean += 0.14;

	// legs
	if (pose === 'kneel') {
		line(ctx, -0.04, hipY, -0.3, -0.05, LEG_BACK, 0.12);
		line(ctx, 0.02, hipY, 0.3, -0.07, LEG_FRONT, 0.12);
	} else if (pose === 'sit') {
		line(ctx, -0.02, hipY, 0.34, -0.08, LEG_BACK, 0.12);
		line(ctx, 0.04, hipY, 0.48, -0.14, LEG_FRONT, 0.12);
	} else {
		const wide = pose === 'stand' || walking || pose === 'talk' ? 0.07 : 0.13;
		const fF = walking ? sw * 0.22 : wide;
		const fB = walking ? -sw * 0.22 : -wide;
		const lF = walking ? Math.max(0, Math.cos(cyc)) * 0.09 : 0;
		const lB = walking ? Math.max(0, -Math.cos(cyc)) * 0.09 : 0;
		line(ctx, -0.06, hipY, fB - 0.04, -lB, LEG_BACK, 0.12);
		line(ctx, 0.06, hipY, fF + 0.04, -lF, LEG_FRONT, 0.12);
	}

	// everything above the hips leans together
	ctx.translate(0, hipY);
	ctx.rotate(lean);
	const shY = -0.52;
	const frontShX = 0.19;
	const backShX = -0.19;

	// back arm, carried bundle
	let thF = 0.1;
	let thB = -0.1;
	let tool = '';
	switch (pose) {
		case 'stand':
			thF = 0.1 + Math.sin(t * 1.3 + ph) * 0.03;
			break;
		case 'walk':
			thF = -sw * 0.6;
			thB = sw * 0.6;
			break;
		case 'chop':
			thF = chopAngle(t, ph, 1.25, 0.6, 2.7);
			thB = thF - 0.3;
			tool = 'axe';
			break;
		case 'strike':
			thF = 1.0 + Math.sin(t * 8 + ph) * 0.6;
			thB = 0.9;
			tool = 'stone';
			break;
		case 'hammer':
			thF = chopAngle(t, ph, 1.5, 0.9, 2.4);
			thB = 0.8;
			tool = 'mallet';
			break;
		case 'spear':
			thF = 0.5;
			tool = 'spear';
			break;
		case 'rod':
			thF = 0.9;
			tool = 'rod';
			break;
		case 'kneel':
			thF = 0.85 + Math.sin(t * 2.6 + ph) * 0.35;
			thB = 0.7 + Math.sin(t * 2.6 + ph + 1.7) * 0.3;
			break;
		case 'sit':
			if (s.activity === 'eat') thF = 1.1 + (0.5 + 0.5 * Math.sin(t * 1.8 + ph)) * 1.2;
			else thF = 0.8 + Math.max(0, Math.sin(t * 1.9 + ph)) * 0.9;
			thB = 0.65;
			break;
		case 'talk':
			thF = 1.3 + Math.sin(t * 3 + ph) * 0.5;
			break;
		case 'pray':
			thF = 2.75 + Math.sin(t * 1.5 + ph) * 0.1;
			thB = -2.75 - Math.sin(t * 1.5 + ph) * 0.1;
			break;
	}
	// carrying a spear or rod while walking
	if (walking && s.activity === 'hunt') tool = 'spear-carry';
	else if (walking && s.activity === 'fish') tool = 'rod-carry';

	arm(ctx, backShX, shY, thB + lean, s.tunic, look.skin);
	if (s.carry) {
		ctx.save();
		ctx.rotate(-0.2);
		ctx.fillStyle = s.carry;
		ctx.beginPath();
		ctx.roundRect(-0.46, -0.44, 0.28, 0.38, 0.05);
		ctx.fill();
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
		ctx.lineWidth = 0.02;
		ctx.stroke();
		ctx.restore();
	}

	// torso: a tunic, flared a little for women
	const hemW = s.female ? 0.27 : 0.22;
	ctx.fillStyle = s.tunic;
	ctx.beginPath();
	ctx.moveTo(-0.16, shY);
	ctx.lineTo(0.16, shY);
	ctx.quadraticCurveTo(0.23, shY + 0.05, 0.21, -0.14);
	ctx.lineTo(hemW, 0.24);
	ctx.lineTo(-hemW, 0.24);
	ctx.lineTo(-0.21, -0.14);
	ctx.quadraticCurveTo(-0.23, shY + 0.05, -0.16, shY);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
	ctx.lineWidth = 0.02;
	ctx.stroke();
	ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
	ctx.fillRect(-hemW, 0.19, hemW * 2, 0.05);
	ctx.fillStyle = '#5b4630';
	ctx.fillRect(-0.21, -0.06, 0.42, 0.05);
	if (s.carry) line(ctx, -0.18, shY + 0.02, 0.14, 0.02, '#4b3a28', 0.035);

	// head: skin, hair cap behind and above, a small eye
	const hx = 0.02 + (s.elder ? 0.07 : 0);
	const hy = pose === 'pray' ? -0.74 : -0.7;
	ctx.fillStyle = look.skin;
	ctx.beginPath();
	ctx.arc(hx, hy, headR, 0, TAU);
	ctx.fill();
	ctx.fillStyle = look.hair;
	if (look.long) {
		ctx.beginPath();
		ctx.ellipse(hx - 0.1, hy + 0.12, 0.09, 0.2, 0.1, 0, TAU);
		ctx.fill();
	}
	if (look.bald) {
		ctx.beginPath();
		ctx.arc(hx - headR * 0.9, hy + 0.01, 0.045, 0, TAU);
		ctx.fill();
	} else {
		ctx.beginPath();
		ctx.arc(hx, hy, headR * 1.06, Math.PI * 0.5, TAU - 0.3);
		ctx.closePath();
		ctx.fill();
		if (look.bun && !s.child) {
			ctx.beginPath();
			ctx.arc(hx - 0.1, hy - 0.11, 0.06, 0, TAU);
			ctx.fill();
		}
	}
	if (k > 6) {
		ctx.fillStyle = 'rgba(30, 20, 15, 0.8)';
		ctx.beginPath();
		ctx.arc(hx + headR * 0.5, hy + 0.01, 0.02, 0, TAU);
		ctx.fill();
	}

	// front arm and what is in it
	arm(ctx, frontShX, shY, thF + lean, s.tunic, look.skin);
	if (tool) drawTool(ctx, tool, thF + lean, s.elder);
	else if (s.elder && walking) drawTool(ctx, 'stick', 0.15 + lean, true);

	ctx.restore();

	// effects that must not be mirrored are drawn in screen space
	if (
		pose === 'talk' ||
		(pose === 'sit' && s.activity === 'socialize' && frac(t * 0.25 + ph) < 0.5)
	)
		drawSpeech(ctx, s, t, ph);
}

// A held tool, from the hand along the arm's direction.
function drawTool(
	ctx: CanvasRenderingContext2D,
	tool: string,
	theta: number,
	_elder: boolean
): void {
	const dx = Math.sin(theta);
	const dy = Math.cos(theta);
	ctx.lineCap = 'round';
	switch (tool) {
		case 'axe': {
			line(
				ctx,
				handX - dx * 0.1,
				handY - dy * 0.1,
				handX + dx * 0.42,
				handY + dy * 0.42,
				WOOD,
				0.05
			);
			const ex = handX + dx * 0.42;
			const ey = handY + dy * 0.42;
			line(ctx, ex - dy * 0.09, ey + dx * 0.09, ex + dy * 0.09, ey - dx * 0.09, '#8d8d88', 0.1);
			break;
		}
		case 'mallet': {
			line(
				ctx,
				handX - dx * 0.08,
				handY - dy * 0.08,
				handX + dx * 0.32,
				handY + dy * 0.32,
				WOOD,
				0.05
			);
			const ex = handX + dx * 0.34;
			const ey = handY + dy * 0.34;
			line(ctx, ex - dy * 0.1, ey + dx * 0.1, ex + dy * 0.1, ey - dx * 0.1, '#5e3f24', 0.12);
			break;
		}
		case 'stone':
			ctx.fillStyle = STONE;
			ctx.beginPath();
			ctx.arc(handX, handY, 0.07, 0, TAU);
			ctx.fill();
			ctx.fillStyle = '#6f6f6b';
			ctx.beginPath();
			ctx.arc(0.5, 0.2, 0.06, 0, TAU);
			ctx.fill();
			break;
		case 'spear':
			line(ctx, handX - 0.2, handY + 0.6, handX + 0.3, handY - 1.35, WOOD, 0.04);
			line(ctx, handX + 0.3, handY - 1.35, handX + 0.34, handY - 1.52, '#8d8d88', 0.06);
			break;
		case 'spear-carry':
			line(ctx, handX - 0.08, handY + 0.2, handX + 0.1, handY - 1.2, WOOD, 0.04);
			line(ctx, handX + 0.1, handY - 1.2, handX + 0.12, handY - 1.36, '#8d8d88', 0.06);
			break;
		case 'rod':
		case 'rod-carry': {
			const tx = handX + 0.85;
			const ty = handY - 0.55;
			line(ctx, handX - 0.1, handY + 0.05, tx, ty, WOOD, 0.03);
			if (tool === 'rod') line(ctx, tx, ty, tx + 0.04, ty + 0.9, 'rgba(230, 230, 230, 0.7)', 0.01);
			break;
		}
		case 'stick':
			line(ctx, handX, handY + 0.55, handX + 0.05, handY - 0.45, WOOD, 0.045);
			break;
	}
}

function drawLying(
	ctx: CanvasRenderingContext2D,
	s: Slot,
	look: Look,
	t: number,
	headR: number
): void {
	const breathe = 1 + Math.sin(t * 1.6 + s.ph0) * 0.05;
	// a bed of grass or fur
	ctx.fillStyle = 'rgba(165, 140, 95, 0.75)';
	ctx.beginPath();
	ctx.ellipse(-0.05, -0.1, 0.95, 0.34, 0, 0, TAU);
	ctx.fill();
	line(ctx, -0.55, -0.14, -0.95, -0.12, LEG_FRONT, 0.13);
	if (s.carry) {
		ctx.fillStyle = s.carry;
		ctx.fillRect(-0.7, -0.08, 0.2, 0.14);
	}
	ctx.fillStyle = s.tunic;
	ctx.beginPath();
	ctx.ellipse(-0.12, -0.18, 0.5, 0.17 * breathe, 0, 0, TAU);
	ctx.fill();
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
	ctx.lineWidth = 0.02;
	ctx.stroke();
	line(ctx, 0.25, -0.22, 0.05, -0.08, look.skin, 0.09);
	ctx.fillStyle = look.skin;
	ctx.beginPath();
	ctx.arc(0.55, -0.2, headR, 0, TAU);
	ctx.fill();
	if (!look.bald) {
		ctx.fillStyle = look.hair;
		ctx.beginPath();
		ctx.arc(0.5, -0.21, headR * 1.05, Math.PI * 0.5, TAU - 0.3);
		ctx.closePath();
		ctx.fill();
		if (look.long) {
			ctx.beginPath();
			ctx.ellipse(0.33, -0.17, 0.13, 0.07, 0, 0, TAU);
			ctx.fill();
		}
	}
}

// A few soft z's rising from a sleeper's head, drawn as little strokes.
function drawSleepZ(ctx: CanvasRenderingContext2D, s: Slot, t: number): void {
	const k = s.ppm * s.scale;
	const bx = s.sx + s.face * 0.55 * k;
	const by = s.sy - 0.45 * k;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	for (let i = 0; i < 3; i++) {
		const u = frac(t * 0.3 + i / 3 + s.ph0);
		const size = (0.08 + 0.12 * u) * s.ppm;
		const x = bx + u * 0.35 * s.ppm;
		const y = by - u * 0.8 * s.ppm;
		const a = Math.sin(u * Math.PI) * 0.85 * s.g;
		if (a <= 0.02) continue;
		for (let pass = 0; pass < 2; pass++) {
			ctx.globalAlpha = pass === 0 ? a * 0.45 : a;
			ctx.strokeStyle = pass === 0 ? '#1b1f23' : '#ffffff';
			ctx.lineWidth = pass === 0 ? Math.max(1.6, size * 0.4) : Math.max(0.9, size * 0.2);
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + size, y);
			ctx.lineTo(x, y + size);
			ctx.lineTo(x + size, y + size);
			ctx.stroke();
		}
	}
	ctx.globalAlpha = 1;
}

function drawSpeech(ctx: CanvasRenderingContext2D, s: Slot, t: number, ph: number): void {
	const k = s.ppm * s.scale;
	const bx = s.sx + s.face * 0.35 * k;
	const by = s.sy - (s.pose === 'sit' ? 1.45 : 2.05) * k;
	ctx.globalAlpha = s.g * 0.95;
	ctx.fillStyle = '#ffffff';
	ctx.strokeStyle = 'rgba(27, 31, 35, 0.55)';
	ctx.lineWidth = Math.max(0.8, k * 0.02);
	ctx.beginPath();
	ctx.ellipse(bx, by, 0.3 * k, 0.19 * k, 0, 0, TAU);
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(bx - 0.12 * k * s.face, by + 0.16 * k);
	ctx.lineTo(bx - 0.22 * k * s.face, by + 0.34 * k);
	ctx.lineTo(bx - 0.02 * k * s.face, by + 0.18 * k);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#3a4046';
	for (let i = 0; i < 3; i++) {
		const pulse = 0.65 + 0.35 * Math.sin(t * 6 + i * 1.3 + ph);
		ctx.beginPath();
		ctx.arc(bx + (i - 1) * 0.14 * k, by, 0.04 * k * pulse, 0, TAU);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

// ------------------------------------------------------------ drawing: animals

function drawAnimal(ctx: CanvasRenderingContext2D, s: Slot): void {
	const { spec, ppm } = s;
	const t = s.now / 1000;
	const grazing = !s.moving && Math.sin(t * 0.9 + s.aph * 2) > 0.3;
	const bob = s.moving ? Math.abs(Math.sin(s.walkPh)) * 0.02 : 0;
	ctx.globalAlpha = s.g;
	ctx.save();
	ctx.translate(s.sx, s.sy);
	ctx.scale(ppm, ppm);

	ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
	ctx.beginPath();
	ctx.ellipse(0, 0.03, spec.len * 0.4, spec.wid * 0.3, 0, 0, TAU);
	ctx.fill();

	// seen from above and a little in front: rotate to the heading
	ctx.translate(0, -spec.wid * 0.45 - bob);
	ctx.rotate(s.heading);
	ctx.lineCap = 'round';
	const L = spec.len;
	const W = spec.wid;
	const head = grazing ? -0.06 : 0;
	ctx.fillStyle = spec.body;
	switch (s.akind) {
		case 'deer': {
			line(ctx, L * 0.36, 0, L * 0.58 + head, 0, spec.body, 0.15);
			ellipse(ctx, 0, 0, L / 2, W / 2, spec.body);
			ellipse(ctx, -0.46, 0, 0.14, 0.15, spec.light);
			ellipse(ctx, 0.66 + head, 0, 0.17, 0.1, spec.dark);
			ellipse(ctx, 0.58 + head, 0.1, 0.05, 0.03, spec.dark);
			ellipse(ctx, 0.58 + head, -0.1, 0.05, 0.03, spec.dark);
			ellipse(ctx, -0.62, 0, 0.06, 0.06, '#f6f1e8');
			if (s.special) {
				for (const side of [1, -1]) {
					line(ctx, 0.6 + head, side * 0.06, 0.5 + head, side * 0.34, '#7a6044', 0.025);
					line(ctx, 0.54 + head, side * 0.22, 0.7 + head, side * 0.32, '#7a6044', 0.02);
				}
			}
			break;
		}
		case 'aurochs': {
			ellipse(ctx, 0, 0, L / 2, W / 2, spec.body);
			ellipse(ctx, 0.3, 0, 0.4, W * 0.45, spec.dark);
			ellipse(ctx, 1.12 + head, 0, 0.28, 0.2, spec.dark);
			ctx.lineWidth = 0.05;
			ctx.strokeStyle = spec.light;
			for (const side of [1, -1]) {
				ctx.beginPath();
				ctx.moveTo(1.08 + head, side * 0.16);
				ctx.quadraticCurveTo(1.2 + head, side * 0.5, 1.5 + head, side * 0.4);
				ctx.stroke();
			}
			line(ctx, -1.0, 0, -1.25, 0.08, spec.dark, 0.04);
			break;
		}
		case 'boar': {
			ellipse(ctx, 0, 0, L / 2, W / 2, spec.body);
			ctx.strokeStyle = spec.dark;
			ctx.lineWidth = 0.03;
			ctx.beginPath();
			for (let i = 0; i < 8; i++) {
				const x = -0.5 + i * 0.13;
				ctx.moveTo(x, -0.05);
				ctx.lineTo(x + 0.04, i % 2 ? -0.18 : 0.18);
			}
			ctx.stroke();
			ellipse(ctx, 0.66 + head, 0, 0.22, 0.17, '#4a3b31');
			ellipse(ctx, 0.88 + head, 0, 0.1, 0.08, '#7d6a5e');
			line(ctx, 0.84 + head, 0.07, 0.92 + head, 0.15, spec.light, 0.025);
			line(ctx, 0.84 + head, -0.07, 0.92 + head, -0.15, spec.light, 0.025);
			ellipse(ctx, -0.62, 0, 0.04, 0.04, spec.dark);
			break;
		}
		case 'goat': {
			ellipse(ctx, 0, 0, L / 2, W / 2, spec.body);
			if (s.special) ellipse(ctx, -0.1, 0.05, 0.2, 0.12, '#a8805a');
			ellipse(ctx, 0.55 + head, 0, 0.14, 0.09, '#d9d0bd');
			line(ctx, 0.58 + head, 0.05, 0.4 + head, 0.22, spec.dark, 0.03);
			line(ctx, 0.58 + head, -0.05, 0.4 + head, -0.22, spec.dark, 0.03);
			ellipse(ctx, -0.5, 0, 0.05, 0.05, spec.light);
			break;
		}
		case 'wolf': {
			ellipse(ctx, -0.74, 0, 0.24, 0.08, spec.dark);
			ellipse(ctx, 0, 0, L / 2, W / 2, spec.body);
			ellipse(ctx, 0, 0, 0.36, 0.14, spec.dark);
			ellipse(ctx, 0.66 + head, 0, 0.18, 0.11, spec.body);
			ellipse(ctx, 0.84 + head, 0, 0.1, 0.06, spec.dark);
			ellipse(ctx, 0.62 + head, 0.1, 0.05, 0.04, spec.dark);
			ellipse(ctx, 0.62 + head, -0.1, 0.05, 0.04, spec.dark);
			break;
		}
		default: {
			ellipse(ctx, 0, 0, L / 2, W / 2, spec.body);
			ellipse(ctx, L / 2 + 0.05, 0, 0.15, 0.1, spec.dark);
		}
	}
	// tame animals wear a plain collar
	if (s.tame) line(ctx, L * 0.34, -W * 0.3, L * 0.34, W * 0.3, '#b04a3a', 0.035);
	ctx.restore();
	ctx.globalAlpha = 1;
}

function ellipse(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	rx: number,
	ry: number,
	color: string
): void {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
	ctx.fill();
}

// ------------------------------------------------------------ overlays

// On-screen box of a figure's body: where its centre is and how big it is.
function bodyBox(
	p: PersonView,
	sx: number,
	sy: number,
	ppm: number,
	zoom: number,
	g: number
): { cx: number; cy: number; hw: number; hh: number } {
	const dot = dotRadius(zoom, p.child);
	const lying = p.activity === 'sleep';
	const h = ADULT_M * scaleOf(p) * ppm;
	const hh = (1 - g) * dot + g * (lying ? h * 0.22 : h * 0.55);
	const hw = (1 - g) * dot + g * (lying ? h * 0.55 : h * 0.3);
	return { cx: sx, cy: sy - g * (lying ? h * 0.12 : h * 0.5), hw, hh };
}

function bracket(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	hw: number,
	hh: number,
	len: number
): void {
	ctx.beginPath();
	for (const sx of [-1, 1]) {
		for (const sy of [-1, 1]) {
			const x = cx + sx * hw;
			const y = cy + sy * hh;
			ctx.moveTo(x - sx * len, y);
			ctx.lineTo(x, y);
			ctx.lineTo(x, y - sy * len);
		}
	}
	ctx.stroke();
}

// Selection marks and names, drawn over everything else.
export function drawActorOverlays(
	ctx: CanvasRenderingContext2D,
	state: DrawState,
	view: View
): void {
	const { camera, followedId, hoveredId, theme, now } = state;
	if (followedId === null && hoveredId === null) return;
	let followed: PersonView | undefined;
	let hovered: PersonView | undefined;
	for (const p of state.people) {
		if (p.id === followedId) followed = p;
		if (p.id === hoveredId && hoveredId !== followedId) hovered = p;
	}
	const ink = theme === 'dark' ? '#ffffff' : '#1b1f23';
	const halo = theme === 'dark' ? 'rgba(10, 12, 14, 0.85)' : 'rgba(255, 255, 255, 0.9)';
	ctx.font = `500 12px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';

	for (const who of [hovered, followed]) {
		if (!who) continue;
		positionInto(who, now, posTmp);
		const sx = (posTmp.x - camera.x) * view.zoom + camera.width / 2;
		const sy = (posTmp.y - camera.y) * view.zoom + camera.height / 2;
		const ppm = view.ppm * FIGURE_SCALE;
		const g = closeUpAmount(view.detail, ppm);
		const b = bodyBox(who, sx, sy, ppm, view.zoom, g);
		const isFollowed = who === followed;
		const pad = 3 + (isFollowed ? 1.5 : 0);
		// a soft halo under the line keeps it readable on any ground
		for (let pass = 0; pass < 2; pass++) {
			ctx.strokeStyle = pass === 0 ? halo : ink;
			ctx.lineWidth = (isFollowed ? 2 : 1.5) + (pass === 0 ? 2.5 : 0);
			if (g < 0.5) {
				ctx.beginPath();
				ctx.arc(b.cx, b.cy, Math.max(b.hw, b.hh) + pad, 0, TAU);
				ctx.stroke();
			} else {
				const len = Math.max(4, Math.min(b.hw, b.hh) * 0.55);
				bracket(ctx, b.cx, b.cy, b.hw + pad, b.hh + pad, len);
			}
		}
		const y = Math.max(b.cy + b.hh, sy) + pad + 5;
		ctx.lineWidth = 3;
		ctx.strokeStyle = halo;
		ctx.strokeText(who.name, b.cx, y);
		ctx.fillStyle = ink;
		ctx.fillText(who.name, b.cx, y);
	}
}

// ------------------------------------------------------------ picking

// The person closest to a screen point, within maxPx or within the figure's
// own size when zoomed in, or null.
export function nearestPerson(
	list: PersonView[],
	camera: Camera,
	now: number,
	sx: number,
	sy: number,
	maxPx = 10
): number | null {
	const ppm = (camera.zoom / 40) * FIGURE_SCALE;
	const g = closeUpAmount(detailOfZoom(camera.zoom), ppm);
	let best: number | null = null;
	let bestDist = Infinity;
	for (const person of list) {
		positionInto(person, now, posTmp);
		const px = (posTmp.x - camera.x) * camera.zoom + camera.width / 2;
		const py = (posTmp.y - camera.y) * camera.zoom + camera.height / 2;
		const box = bodyBox(person, px, py, ppm, camera.zoom, g);
		const reach = Math.max(maxPx, g * Math.max(box.hw, box.hh) * 1.1);
		const d = (px - sx) ** 2 + (box.cy - sy) ** 2;
		if (d <= reach * reach && d < bestDist) {
			bestDist = d;
			best = person.id;
		}
	}
	return best;
}

export type { Look };
