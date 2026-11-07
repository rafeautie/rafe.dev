import type { HerdView, MapLayers, PersonView } from '../types';
import type { Camera } from './camera';
import { waterAt } from './ground';
import { villageColor } from './palette';
import {
	ANIMAL_STATES,
	animalCollar,
	animalKindOf,
	animalSprite,
	bodyOf,
	bubbleSprite,
	clothIndex,
	figureHeight,
	herdIcon,
	itemKindOf,
	itemSprite,
	lieLayout,
	lookOf,
	personIcon,
	personSprite,
	POSE_FPS,
	POSE_FRAMES,
	poseOf,
	sheetFor,
	sleepZ,
	walkBob,
	walkPose,
	type AnimalKind,
	type BodyKind,
	type Look,
	type Pose,
	type Sheet
} from './pixel/actorsprites';
import { PALETTE } from './pixel/palette';
import { drawSprite, type Sprite } from './pixel/sprite';
import { modeOf, pixelScale, type Mode } from './pixel/scale';
import { hash, type DrawState, type Standing, type View } from './scene';

// People and animals. Zoomed out they are coloured dots; on the map they are
// tiny icons; close up they are pixel-art sprites standing on the art grid.
// Everything about how someone looks comes from hash(id), never from chance.

const TAU = Math.PI * 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
// history runs fast, so a drawn person eases toward where they "are" instead
// of sprinting: this is how long (seconds) it takes to cover most of a move
const PERSON_TAU = 0.55;
const HERD_TAU = 1.1;
// a jump bigger than this (tiles) is a teleport, not a walk, so just snap
const SNAP_TILES = 14;
const MAX_ANIMALS = 12;
// walk cycles a second at most, so frames never change faster than ~6 a second
const PERSON_RATE = 1.4;
const HERD_RATE = 2.8;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const frac = (v: number) => v - Math.floor(v);

// ------------------------------------------------------------ water

type WaterLayers = Pick<MapLayers, 'size' | 'water' | 'biome'>;
type Pt = { x: number; y: number };

const RINGS = [0.06, 0.12, 0.2, 0.3, 0.42, 0.58];
const DIR_X = [1, 0.7071, 0, -0.7071, -1, -0.7071, 0, 0.7071];
const DIR_Y = [0, 0.7071, 1, 0.7071, 0, -0.7071, -1, -0.7071];
const EDGE_AT = [0.2, 0.5, 0.8];

// Moves a point (tiles) that is in water to dry ground: the nearest dry point
// in its own tile (a small spiral of rings), and failing that just inside the
// edge of the nearest dry neighbouring tile. Leaves the point alone if it is
// already dry. Returns false only when nothing dry was found. `salt` varies
// which way the search starts so a crowd doesn't all pile on one spot.
export function dryPoint(
	layers: WaterLayers,
	x: number,
	y: number,
	salt: number,
	out: Pt
): boolean {
	out.x = x;
	out.y = y;
	if (!waterAt(layers, x, y)) return true;
	const tx = Math.floor(x);
	const ty = Math.floor(y);
	const start = Math.floor(hash(salt, 61) * 8);
	for (let r = 0; r < RINGS.length; r++) {
		for (let k = 0; k < 8; k++) {
			const d = (start + k) & 7;
			const px = clamp(x + DIR_X[d] * RINGS[r], tx + 0.04, tx + 0.96);
			const py = clamp(y + DIR_Y[d] * RINGS[r], ty + 0.04, ty + 0.96);
			if (!waterAt(layers, px, py)) {
				out.x = px;
				out.y = py;
				return true;
			}
		}
	}
	let best = Infinity;
	let bx = x;
	let by = y;
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			if (dx === 0 && dy === 0) continue;
			const samples = dx !== 0 && dy !== 0 ? 1 : 3;
			for (let s = 0; s < samples; s++) {
				const px = dx > 0 ? tx + 1.08 : dx < 0 ? tx - 0.08 : tx + EDGE_AT[s];
				const py = dy > 0 ? ty + 1.08 : dy < 0 ? ty - 0.08 : ty + EDGE_AT[s];
				if (px < 0 || py < 0 || px >= layers.size || py >= layers.size) continue;
				if (waterAt(layers, px, py)) continue;
				const d2 = (px - x) ** 2 + (py - y) ** 2;
				if (d2 < best) {
					best = d2;
					bx = px;
					by = py;
				}
			}
		}
	}
	if (best === Infinity) return false;
	out.x = bx;
	out.y = by;
	return true;
}

// ------------------------------------------------------------ easing state

type Mover = {
	x: number;
	y: number;
	t: number;
	seen: number;
	moving: boolean;
	// which way a figure faces (1 = right)
	face: 1 | -1;
	// walk cycle in radians, advanced by how fast they actually move
	phase: number;
	// the dry spot they head for, and what it was worked out from
	tx: number;
	ty: number;
	spotKey: number;
	spotLayers: object | null;
	// people: look and sprite sheet
	look: Look | null;
	lookKey: number;
	sheet: Sheet | null;
	cloth: number;
	// herds: each animal's dry offset from the herd's tile centre
	offs: Float64Array | null;
	offKey: number;
	offLayers: object | null;
};

const people = new Map<number, Mover>();
const herdMovers = new Map<number, Mover>();
let frameId = 0;
// the last frame's view, so personPosition (called from the camera and from
// clicking) agrees with what was drawn
let lastDetail = 0;
let lastMode: Mode = 'overview';
let layersRef: WaterLayers | null = null;

function newMover(x: number, y: number, now: number, seed: number): Mover {
	return {
		x,
		y,
		t: now,
		seen: frameId,
		moving: false,
		face: hash(seed, 22) < 0.5 ? 1 : -1,
		phase: hash(seed, 23) * TAU,
		tx: x,
		ty: y,
		spotKey: -1,
		spotLayers: null,
		look: null,
		lookKey: -1,
		sheet: null,
		cloth: -1,
		offs: null,
		offKey: -1,
		offLayers: null
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
function advance(
	m: Mover,
	tx: number,
	ty: number,
	now: number,
	tau: number,
	maxRate: number
): void {
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
		if (Math.abs(sx) > 1e-5) m.face = sx > 0 ? 1 : -1;
		m.phase += clamp(speed * 28.6, 0.6, maxRate) * TAU * dt;
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
const dryTmp: Pt = { x: 0, y: 0 };

function activityClass(a: string): number {
	return a === 'sleep' ? 1 : GATHERED.has(a) ? 2 : WORKING.has(a) ? 3 : 0;
}

// The spot a person heads for, kept dry. Worked out again only when they
// change tile or kind of activity, so water tests don't run every frame.
function resolveSpot(m: Mover, person: PersonView): void {
	const key = (person.y * 8192 + person.x) * 4 + activityClass(person.activity);
	if (m.spotKey === key && m.spotLayers === layersRef) return;
	spotInto(spot, person.id, person.activity);
	let tx = person.x + 0.5 + spot.dx;
	let ty = person.y + 0.5 + spot.dy;
	if (layersRef && dryPoint(layersRef, tx, ty, person.id, dryTmp)) {
		tx = dryTmp.x;
		ty = dryTmp.y;
	}
	m.tx = tx;
	m.ty = ty;
	m.spotKey = key;
	m.spotLayers = layersRef;
}

// On the map a tile is only 16 art pixels, so people in it sit in a small
// cluster around the middle instead of all on one pixel.
function clusterX(id: number): number {
	return (hash(id, 51) - 0.5) * 0.5;
}
function clusterY(id: number): number {
	return (hash(id, 52) - 0.5) * 0.4;
}

function positionInto(person: PersonView, now: number, out: Pt): void {
	let m = people.get(person.id);
	if (!m) {
		m = newMover(person.x + 0.5, person.y + 0.5, now, person.id);
		people.set(person.id, m);
		resolveSpot(m, person);
		snapTo(m, m.tx, m.ty, now);
	} else resolveSpot(m, person);
	m.seen = frameId;
	if (lastDetail <= 0) {
		// zoomed out: the tile centre, but keep the state in step so zooming in
		// doesn't slide everyone in from the wrong place
		snapTo(m, m.tx, m.ty, now);
		out.x = person.x + 0.5;
		out.y = person.y + 0.5;
		if (lastMode === 'map') {
			out.x += clusterX(person.id);
			out.y += clusterY(person.id);
		}
		return;
	}
	advance(m, m.tx, m.ty, now, PERSON_TAU, PERSON_RATE);
	out.x = person.x + 0.5 + (m.x - person.x - 0.5) * lastDetail;
	out.y = person.y + 0.5 + (m.y - person.y - 0.5) * lastDetail;
}

// The eased on-screen position (tiles) used for drawing, following and clicking.
export function personPosition(person: PersonView, now: number): { x: number; y: number } {
	const out = { x: 0, y: 0 };
	positionInto(person, now, out);
	return out;
}

// ------------------------------------------------------------ snapping

// Same as snapToArt in scene.ts, without making an object for every figure.
const snapX = (view: View, wx: number) =>
	view.originX + Math.round(wx * view.artPerTile) * view.scale;
const snapY = (view: View, wy: number) =>
	view.originY + Math.round(wy * view.artPerTile) * view.scale;

// ------------------------------------------------------------ slots

const Kind = { person: 0, personIcon: 1, animal: 2, herdIcon: 3, dots: 4 } as const;

// One reusable record per thing drawn, with its draw function made once, so a
// busy frame makes no garbage.
class Slot {
	st: Standing;
	kind: number = Kind.person;
	sx = 0;
	sy = 0;
	scale = 1;
	flip = false;
	dir = 1;
	spr: Sprite | null = null;
	shadow = 0;
	now = 0;
	ph = 0;
	// a carried item: art pixels from the foot (as if facing right)
	item: Sprite | null = null;
	itemX = 0;
	itemY = 0;
	itemBehind = false;
	// speech bubble frame (-1 for none) and where
	bubble = -1;
	bubbleX = 0;
	bubbleY = 0;
	sleeping = false;
	zX = 0;
	// animals
	tame = false;
	collarX = 0;
	collarY = 0;
	// dots
	color = '';
	radius = 2;
	alpha = 1;
	wolf = false;
	count = 1;
	herdId = 0;
	zoom = 1;
	dpr = 1;
	constructor() {
		this.st = { y: 0, draw: (ctx) => this.render(ctx) };
	}
	render(ctx: CanvasRenderingContext2D): void {
		switch (this.kind) {
			case Kind.person:
				drawPerson(ctx, this);
				break;
			case Kind.animal:
				drawAnimal(ctx, this);
				break;
			case Kind.personIcon:
			case Kind.herdIcon:
				drawIcon(ctx, this);
				break;
			default:
				if (this.herdId >= 0) drawHerdDots(ctx, this);
				else drawPersonDot(ctx, this);
		}
	}
}

const slots: Slot[] = [];
let used = 0;
function takeSlot(): Slot {
	if (used === slots.length) slots.push(new Slot());
	return slots[used++];
}

const posTmp: Pt = { x: 0, y: 0 };

// the head-top of a figure in a given pose, art pixels above the foot
function topOf(body: BodyKind, pose: Pose): number {
	if (pose === 'lie') return 7;
	if (pose === 'sit' || pose === 'eat') return figureHeight(body) - (body === 'child' ? 1 : 3);
	if (pose === 'kneel') return figureHeight(body) - (body === 'child' ? 1 : 4);
	return figureHeight(body);
}

export function collectActors(state: DrawState, view: View, out: Standing[]): void {
	frameId++;
	used = 0;
	lastDetail = view.detail;
	lastMode = view.mode ?? 'overview';
	layersRef = (state.layers as WaterLayers | undefined) ?? null;
	const { camera, now } = state;
	const dpr = state.dpr || 1;
	const w2 = camera.width / 2;
	const h2 = camera.height / 2;
	const zoom = view.zoom;
	const mode = lastMode;
	const sc = view.scale;
	const t = now / 1000;

	for (const p of state.people) {
		positionInto(p, now, posTmp);
		const m = people.get(p.id);
		if (!m) continue;
		if (mode === 'overview') {
			const sx = (posTmp.x - camera.x) * zoom + w2;
			const sy = (posTmp.y - camera.y) * zoom + h2;
			const reach = 12 * dpr;
			if (sx < -reach || sy < -reach || sx > camera.width + reach || sy > camera.height + reach)
				continue;
			const s = takeSlot();
			s.kind = Kind.dots;
			s.herdId = -1;
			s.st.y = posTmp.y;
			s.sx = sx;
			s.sy = sy;
			s.color = villageColor(p.village);
			s.radius = dotRadius(zoom, p.child, dpr);
			s.alpha = p.activity === 'sleep' ? 0.5 : 1;
			s.dpr = dpr;
			s.zoom = zoom;
			out.push(s.st);
			continue;
		}
		const sx = snapX(view, posTmp.x);
		const sy = snapY(view, posTmp.y);
		const reach = 30 * sc;
		if (sx < -reach || sy < -reach || sx > camera.width + reach || sy > camera.height + reach / 3)
			continue;
		const cloth = clothIndex(p.village);
		if (mode === 'map') {
			const s = takeSlot();
			s.kind = Kind.personIcon;
			s.st.y = posTmp.y;
			s.sx = sx;
			s.sy = sy;
			s.scale = sc;
			s.flip = false;
			s.spr = personIcon(cloth, p.child);
			s.tame = false;
			s.alpha = p.activity === 'sleep' ? 0.6 : 1;
			out.push(s.st);
			continue;
		}

		// local: a sprite on the art grid
		const key = (p.elder ? 1 : 0) | (p.child ? 2 : 0) | (p.sex === 'f' ? 4 : 0);
		if (!m.look || m.lookKey !== key) {
			m.look = lookOf(p.id, p.sex, p.child, p.elder);
			m.lookKey = key;
			m.sheet = null;
		}
		if (!m.sheet || m.cloth !== cloth) {
			m.sheet = sheetFor(cloth, m.look);
			m.cloth = cloth;
		}
		const body = bodyOf(p.sex, p.child, p.elder);
		const carrying = !!p.carrying;
		const pose = m.moving ? walkPose(p.activity, carrying) : poseOf(p.activity, false);
		const frames = POSE_FRAMES[pose];
		const ph0 = hash(p.id, 41) * 4;
		let frame: number;
		if (m.moving) frame = Math.floor((m.phase / TAU) * frames) % frames;
		else frame = Math.floor(t * POSE_FPS[pose] + ph0) % frames;
		const s = takeSlot();
		s.kind = Kind.person;
		s.st.y = posTmp.y;
		s.sx = sx;
		s.sy = sy;
		s.scale = sc;
		s.flip = m.face < 0;
		s.dir = s.flip ? -1 : 1;
		s.spr = personSprite(m.sheet, body, m.look.style, pose, frame);
		s.now = now;
		s.ph = hash(p.id, 42);
		s.sleeping = pose === 'lie';
		const lie = lieLayout(body);
		s.shadow = pose === 'lie' ? Math.ceil((lie.end - lie.start) / 2) + 1 : body === 'child' ? 3 : 4;
		const top = topOf(body, pose);
		s.item = null;
		if (carrying) {
			s.item = itemSprite(itemKindOf(p.carrying as string));
			if (pose === 'carry') {
				s.itemX = 0;
				s.itemY = figureHeight(body) - 1 + walkBob(frame);
				s.itemBehind = false;
			} else if (pose === 'lie') {
				s.itemX = lie.start - 3;
				s.itemY = 0;
				s.itemBehind = false;
			} else {
				s.itemX = -4;
				s.itemY = Math.round(top * 0.35);
				s.itemBehind = true;
			}
		}
		s.bubble = -1;
		if (
			pose === 'talk' ||
			(pose === 'sit' && p.activity === 'socialize' && frac(t * 0.25 + s.ph) < 0.5)
		) {
			s.bubble = Math.floor(now / 300) & 1;
			s.bubbleX = 3;
			s.bubbleY = top + 1;
		}
		s.zX = lie.headX + 2;
		out.push(s.st);
	}
	if (people.size > state.people.length) {
		for (const [id, m] of people) if (m.seen !== frameId) people.delete(id);
	}

	collectHerds(state, view, out);
}

// ------------------------------------------------------------ herds

const SHADOW_HALF: Record<AnimalKind, number> = { deer: 6, aurochs: 9, boar: 5, goat: 5, wolf: 6 };

function resolveHerd(m: Mover, herd: HerdView, n: number, radius: number): Float64Array {
	const offs = (m.offs ??= new Float64Array(MAX_ANIMALS * 2));
	const key = ((herd.y * 8192 + herd.x) * 32 + n) * 2 + (herd.tame ? 1 : 0);
	if (m.offKey === key && m.offLayers === layersRef) return offs;
	const cx = herd.x + 0.5;
	const cy = herd.y + 0.5;
	for (let i = 0; i < n; i++) {
		const a = hash(herd.id, i, 1) * TAU;
		const r = Math.sqrt(hash(herd.id, i, 2)) * radius;
		let px = cx + Math.cos(a) * r;
		let py = cy + Math.sin(a) * r * 0.85;
		if (layersRef && dryPoint(layersRef, px, py, herd.id * 16 + i, dryTmp)) {
			px = dryTmp.x;
			py = dryTmp.y;
		}
		offs[i * 2] = px - cx;
		offs[i * 2 + 1] = py - cy;
	}
	m.offKey = key;
	m.offLayers = layersRef;
	return offs;
}

function collectHerds(state: DrawState, view: View, out: Standing[]): void {
	const { camera, now } = state;
	const dpr = state.dpr || 1;
	const w2 = camera.width / 2;
	const h2 = camera.height / 2;
	const zoom = view.zoom;
	const mode = view.mode ?? 'overview';
	const sc = view.scale;
	const t = now / 1000;

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
		else advance(m, tx, ty, now, HERD_TAU, HERD_RATE);
		const cx = view.detail <= 0 ? tx : m.x;
		const cy = view.detail <= 0 ? ty : m.y;
		const kind = animalKindOf(herd.kind);

		const n = Math.min(herd.count, MAX_ANIMALS);
		const radius = herd.tame ? Math.min(0.9, 0.3 + 0.08 * n) : Math.min(3, 0.8 + 0.28 * n);
		const hx = (cx - camera.x) * zoom + w2;
		const hy = (cy - camera.y) * zoom + h2;
		const margin = radius * zoom + 30 * sc + 20 * dpr;
		if (hx < -margin || hy < -margin || hx > camera.width + margin || hy > camera.height + margin)
			continue;

		if (mode === 'overview') {
			const s = takeSlot();
			s.kind = Kind.dots;
			s.herdId = herd.id;
			s.st.y = cy;
			s.sx = hx;
			s.sy = hy;
			s.zoom = zoom;
			s.dpr = dpr;
			s.wolf = kind === 'wolf';
			s.tame = herd.tame;
			s.count = herd.count;
			s.radius = clamp(zoom * 0.16, 1.4, 4) * dpr;
			out.push(s.st);
			continue;
		}

		if (mode === 'map') {
			const icons = Math.min(3, 1 + (herd.count > 5 ? 1 : 0) + (herd.count > 12 ? 1 : 0));
			for (let i = 0; i < icons; i++) {
				const wx = cx + (hash(herd.id, i, 8) - 0.5) * 0.55;
				const wy = cy + (hash(herd.id, i, 9) - 0.5) * 0.45;
				const s = takeSlot();
				s.kind = Kind.herdIcon;
				s.st.y = wy;
				s.sx = snapX(view, wx);
				s.sy = snapY(view, wy);
				s.scale = sc;
				s.flip = hash(herd.id, i, 4) < 0.5;
				s.spr = herdIcon(kind);
				s.tame = herd.tame;
				s.alpha = 1;
				out.push(s.st);
			}
			continue;
		}

		const offs = resolveHerd(m, herd, n, radius);
		const collar = animalCollar(kind);
		for (let i = 0; i < n; i++) {
			const ph = hash(herd.id, i, 3) * TAU;
			// a slow idle drift, a few art pixels, so a standing herd is not frozen
			const wx = cx + offs[i * 2] + Math.sin(t * 0.21 + ph) * 0.016;
			const wy = cy + offs[i * 2 + 1] + Math.cos(t * 0.17 + ph) * 0.012;
			const sx = snapX(view, wx);
			const sy = snapY(view, wy);
			const reach = 24 * sc;
			if (sx < -reach || sy < -reach || sx > camera.width + reach || sy > camera.height + reach)
				continue;
			const special = hash(herd.id, i, 5) < (kind === 'deer' ? 0.3 : 0.35);
			let state2: number;
			if (m.moving) state2 = 1 + (Math.floor(((m.phase + ph * 0.3) / TAU) * 2) & 1);
			else state2 = Math.sin(t * 0.9 + ph * 2) > 0.3 ? 3 : 0;
			const face = m.moving ? m.face : hash(herd.id, i, 4) < 0.5 ? 1 : -1;
			const s = takeSlot();
			s.kind = Kind.animal;
			s.st.y = wy;
			s.sx = sx;
			s.sy = sy;
			s.scale = sc;
			s.flip = face < 0;
			s.dir = face;
			s.spr = animalSprite(kind, state2 % ANIMAL_STATES, special ? 1 : 0);
			s.shadow = SHADOW_HALF[kind];
			s.tame = herd.tame;
			s.collarX = collar[0];
			s.collarY = collar[1];
			out.push(s.st);
		}
	}
	if (herdMovers.size > state.herds.length) {
		for (const [id, m] of herdMovers) if (m.seen !== frameId) herdMovers.delete(id);
	}
}

// ------------------------------------------------------------ drawing: dots

function dotRadius(zoom: number, child: boolean, dpr: number): number {
	const base = clamp(1.6 + (zoom / dpr) * 0.18, 2, 7) * dpr;
	return child ? base * 0.7 : base;
}

function drawPersonDot(ctx: CanvasRenderingContext2D, s: Slot): void {
	ctx.globalAlpha = s.alpha;
	ctx.fillStyle = s.color;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
	ctx.lineWidth = s.dpr;
	ctx.beginPath();
	ctx.arc(s.sx, s.sy, s.radius, 0, TAU);
	ctx.fill();
	ctx.stroke();
	ctx.globalAlpha = 1;
}

function drawHerdDots(ctx: CanvasRenderingContext2D, s: Slot): void {
	const r = s.radius;
	const dots = Math.max(1, Math.min(5, s.count));
	const spread = Math.min(3, 1 + dots * 0.4) * (s.zoom / s.dpr) * 0.35 * s.dpr;
	ctx.fillStyle = s.wolf ? '#b8433a' : s.tame ? '#c9a46a' : '#8a6a47';
	for (let n = 0; n < dots; n++) {
		const px = s.sx + (hash(s.herdId, n, 6) - 0.5) * spread * 2;
		const py = s.sy + (hash(s.herdId, n, 7) - 0.5) * spread * 2;
		ctx.beginPath();
		if (s.wolf) {
			ctx.moveTo(px, py - r * 1.2);
			ctx.lineTo(px + r, py + r * 0.9);
			ctx.lineTo(px - r, py + r * 0.9);
			ctx.closePath();
		} else ctx.arc(px, py, r, 0, TAU);
		ctx.fill();
	}
}

// ------------------------------------------------------------ drawing: sprites

// A flat oval of shadow under the feet, on the pixel grid, a pixel to the right.
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number, half: number) {
	ctx.globalAlpha = 0.35;
	ctx.fillStyle = PALETTE.shadow;
	ctx.fillRect(x + (3 - half) * sc, y, (2 * half - 2) * sc, sc);
	ctx.fillRect(x + (2 - half) * sc, y + sc, 2 * half * sc, sc);
	ctx.globalAlpha = 1;
}

function drawItem(ctx: CanvasRenderingContext2D, s: Slot): void {
	if (!s.item) return;
	drawSprite(
		ctx,
		s.item,
		s.sx + s.dir * s.itemX * s.scale,
		s.sy - s.itemY * s.scale,
		s.scale,
		s.flip
	);
}

function drawPerson(ctx: CanvasRenderingContext2D, s: Slot): void {
	const sc = s.scale;
	if (!s.spr) return;
	drawShadow(ctx, s.sx, s.sy, sc, s.shadow);
	if (s.itemBehind) drawItem(ctx, s);
	drawSprite(ctx, s.spr, s.sx, s.sy, sc, s.flip);
	if (!s.itemBehind) drawItem(ctx, s);
	if (s.bubble >= 0)
		drawSprite(
			ctx,
			bubbleSprite(s.bubble),
			s.sx + s.dir * s.bubbleX * sc,
			s.sy - s.bubbleY * sc,
			sc,
			false
		);
	if (s.sleeping) drawZs(ctx, s);
}

// Little z's that float up from a sleeper's head, a step at a time.
function drawZs(ctx: CanvasRenderingContext2D, s: Slot): void {
	const t = s.now / 1000;
	const z = sleepZ();
	for (let i = 0; i < 2; i++) {
		const u = frac(t * 0.3 + i * 0.5 + s.ph);
		if (u > 0.92) continue;
		const step = Math.floor(u * 8) / 8;
		const x = s.zX + Math.floor(step * 5);
		const y = 6 + Math.floor(step * 10);
		drawSprite(ctx, z, s.sx + s.dir * x * s.scale, s.sy - y * s.scale, s.scale, false);
	}
}

function drawAnimal(ctx: CanvasRenderingContext2D, s: Slot): void {
	if (!s.spr) return;
	drawShadow(ctx, s.sx, s.sy, s.scale, s.shadow);
	drawSprite(ctx, s.spr, s.sx, s.sy, s.scale, s.flip);
	// tame animals wear a plain collar: one red pixel at the neck
	if (s.tame) {
		ctx.fillStyle = PALETTE.ember;
		ctx.fillRect(
			s.sx + (s.dir * s.collarX - (s.flip ? 1 : 0)) * s.scale,
			s.sy - s.collarY * s.scale,
			s.scale,
			s.scale
		);
	}
}

// Map-view icons: a person or a herd as a few pixels.
function drawIcon(ctx: CanvasRenderingContext2D, s: Slot): void {
	if (!s.spr) return;
	const sleepy = s.kind === Kind.personIcon && s.alpha < 1;
	if (sleepy) ctx.globalAlpha = s.alpha;
	drawSprite(ctx, s.spr, s.sx, s.sy, s.scale, s.flip);
	if (sleepy) ctx.globalAlpha = 1;
	if (s.kind === Kind.herdIcon && s.tame) {
		ctx.fillStyle = PALETTE.ember;
		ctx.fillRect(
			s.sx - s.spr.footX * s.scale,
			s.sy - (s.spr.footY + 1) * s.scale,
			s.scale,
			s.scale
		);
	}
}

// ------------------------------------------------------------ overlays

type Box = { x0: number; y0: number; x1: number; y1: number };
const boxTmp: Box = { x0: 0, y0: 0, x1: 0, y1: 0 };

// The on-screen box around a person (device pixels): the sprite's bounds in
// the pixel modes, a little square round the dot in the overview.
function boxInto(
	out: Box,
	p: PersonView,
	moving: boolean,
	mode: Mode,
	sc: number,
	sx: number,
	sy: number,
	zoom: number,
	dpr: number
): void {
	if (mode === 'overview') {
		const r = dotRadius(zoom, p.child, dpr);
		out.x0 = sx - r;
		out.x1 = sx + r;
		out.y0 = sy - r;
		out.y1 = sy + r;
		return;
	}
	if (mode === 'map') {
		out.x0 = sx - 2 * sc;
		out.x1 = sx + 2 * sc;
		out.y0 = sy - (p.child ? 3 : 4) * sc;
		out.y1 = sy + sc;
		return;
	}
	const body = bodyOf(p.sex, p.child, p.elder);
	if (p.activity === 'sleep' && !moving) {
		const l = lieLayout(body);
		out.x0 = sx + (l.start - 1) * sc;
		out.x1 = sx + (l.end + 2) * sc;
		out.y0 = sy - 6 * sc;
		out.y1 = sy + sc;
		return;
	}
	const half = body === 'child' ? 3 : 4;
	out.x0 = sx - half * sc;
	out.x1 = sx + (half + 1) * sc;
	out.y0 = sy - (figureHeight(body) - 1) * sc;
	out.y1 = sy + sc;
}

// Four corner L's, one unit thick, with an ink halo so they read on any ground.
function bracket(
	ctx: CanvasRenderingContext2D,
	b: Box,
	len: number,
	th: number,
	color: string
): void {
	for (let pass = 0; pass < 2; pass++) {
		ctx.fillStyle = pass === 0 ? PALETTE.ink : color;
		const grow = pass === 0 ? th : 0;
		for (let c = 0; c < 4; c++) {
			const dx = c & 1 ? -1 : 1;
			const dy = c & 2 ? -1 : 1;
			const cx = c & 1 ? b.x1 : b.x0;
			const cy = c & 2 ? b.y1 : b.y0;
			ctx.fillRect(cx - dx * grow, cy - dy * grow, dx * (len + 2 * grow), dy * (th + 2 * grow));
			ctx.fillRect(cx - dx * grow, cy - dy * grow, dx * (th + 2 * grow), dy * (len + 2 * grow));
		}
	}
}

// Selection marks and names, drawn over everything else.
export function drawActorOverlays(
	ctx: CanvasRenderingContext2D,
	state: DrawState,
	view: View
): void {
	const { camera, followedId, hoveredId, theme, now } = state;
	if (followedId === null && hoveredId === null) return;
	const dpr = state.dpr || 1;
	let followed: PersonView | undefined;
	let hovered: PersonView | undefined;
	for (const p of state.people) {
		if (p.id === followedId) followed = p;
		if (p.id === hoveredId && hoveredId !== followedId) hovered = p;
	}
	const ink = theme === 'dark' ? '#ffffff' : '#1b1f23';
	const halo = theme === 'dark' ? 'rgba(10, 12, 14, 0.85)' : 'rgba(255, 255, 255, 0.9)';
	const mode = view.mode ?? 'overview';
	// one "pixel" of the selection mark: an art pixel, or a device pixel zoomed out
	const unit = mode === 'overview' ? Math.max(1, Math.round(dpr)) : view.scale;
	ctx.font = `500 ${12 * dpr}px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.lineJoin = 'round';

	for (const who of [hovered, followed]) {
		if (!who) continue;
		positionInto(who, now, posTmp);
		let sx = (posTmp.x - camera.x) * view.zoom + camera.width / 2;
		let sy = (posTmp.y - camera.y) * view.zoom + camera.height / 2;
		if (mode !== 'overview') {
			sx = snapX(view, posTmp.x);
			sy = snapY(view, posTmp.y);
		} else {
			sx = Math.round(sx);
			sy = Math.round(sy);
		}
		const moving = people.get(who.id)?.moving ?? false;
		boxInto(boxTmp, who, moving, mode, view.scale, sx, sy, view.zoom, dpr);
		const pad = 2 * unit;
		boxTmp.x0 -= pad;
		boxTmp.y0 -= pad;
		boxTmp.x1 += pad;
		boxTmp.y1 += pad;
		boxTmp.x0 = Math.round(boxTmp.x0);
		boxTmp.y0 = Math.round(boxTmp.y0);
		boxTmp.x1 = Math.round(boxTmp.x1);
		boxTmp.y1 = Math.round(boxTmp.y1);
		const isFollowed = who === followed;
		bracket(ctx, boxTmp, 3 * unit, unit, isFollowed ? PALETTE.flame : PALETTE.white);

		const x = Math.round((boxTmp.x0 + boxTmp.x1) / 2);
		const y = Math.round(boxTmp.y1 + 3 * dpr);
		ctx.lineWidth = 3 * dpr;
		ctx.strokeStyle = halo;
		ctx.strokeText(who.name, x, y);
		ctx.fillStyle = ink;
		ctx.fillText(who.name, x, y);
	}
}

// ------------------------------------------------------------ picking

// The person closest to a screen point (device pixels), within maxPx or within
// the figure's own size when zoomed in, or null.
export function nearestPerson(
	list: PersonView[],
	camera: Camera,
	now: number,
	sx: number,
	sy: number,
	maxPx = 10
): number | null {
	const mode = modeOf(camera.zoom);
	const sc = pixelScale(camera.zoom);
	let best: number | null = null;
	let bestDist = Infinity;
	for (const person of list) {
		positionInto(person, now, posTmp);
		const px = (posTmp.x - camera.x) * camera.zoom + camera.width / 2;
		const py = (posTmp.y - camera.y) * camera.zoom + camera.height / 2;
		let cy = py;
		let reach = maxPx;
		if (mode !== 'overview') {
			// the sprite's own size: its centre is half a body above the foot
			const moving = people.get(person.id)?.moving ?? false;
			boxInto(boxTmp, person, moving, mode, sc, px, py, camera.zoom, 1);
			cy = (boxTmp.y0 + boxTmp.y1) / 2;
			reach = Math.max(maxPx, (Math.max(boxTmp.x1 - boxTmp.x0, boxTmp.y1 - boxTmp.y0) / 2) * 1.1);
		}
		const d = (px - sx) ** 2 + (cy - sy) ** 2;
		if (d <= reach * reach && d < bestDist) {
			bestDist = d;
			best = person.id;
		}
	}
	return best;
}

export { bodyOf, lookOf, poseOf, type Look };
