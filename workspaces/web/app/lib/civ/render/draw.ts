import { Built, Deposit, type HerdView, type PersonView, type Village } from '../types';
import type { Camera } from './camera';
import { villageColor } from './palette';

// Positions are tile coordinates; a person "at" (10, 4) stands in the middle
// of that tile, so everything is drawn half a tile in.
export const TILE_CENTER = 0.5;

export type DrawState = {
	camera: Camera;
	terrain: CanvasImageSource & { width: number; height: number };
	dpr: number;
	mapSize: number;
	people: PersonView[];
	herds: HerdView[];
	villages: Pick<Village, 'id' | 'name' | 'x' | 'y'>[];
	built: Uint8Array;
	deposit: Uint8Array;
	followedId: number | null;
	hoveredId: number | null;
	theme: 'light' | 'dark';
};

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const BUILT_COLOR: Record<number, string> = {
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

export function drawFrame(ctx: CanvasRenderingContext2D, state: DrawState): void {
	const { camera, dpr } = state;
	const { zoom, width, height } = camera;

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.fillStyle = state.theme === 'dark' ? '#14171a' : '#e9ecee';
	ctx.fillRect(0, 0, width, height);

	// the tiles on screen (a little extra so shapes at the edge aren't cut)
	const topLeft = camera.toWorld(0, 0);
	const bottomRight = camera.toWorld(width, height);
	const x0 = Math.max(0, Math.floor(topLeft.x));
	const y0 = Math.max(0, Math.floor(topLeft.y));
	const x1 = Math.min(state.mapSize, Math.ceil(bottomRight.x));
	const y1 = Math.min(state.mapSize, Math.ceil(bottomRight.y));
	if (x1 <= x0 || y1 <= y0) return;

	ctx.imageSmoothingEnabled = false;
	const origin = camera.toScreen(x0, y0);
	ctx.drawImage(
		state.terrain,
		x0,
		y0,
		x1 - x0,
		y1 - y0,
		origin.x,
		origin.y,
		(x1 - x0) * zoom,
		(y1 - y0) * zoom
	);

	if (zoom >= 8) drawDeposits(ctx, state, x0, y0, x1, y1);
	drawBuilt(ctx, state, x0, y0, x1, y1);
	drawHerds(ctx, state);
	drawPeople(ctx, state);
	if (zoom >= 3) drawVillageNames(ctx, state);
}

function drawDeposits(
	ctx: CanvasRenderingContext2D,
	state: DrawState,
	x0: number,
	y0: number,
	x1: number,
	y1: number
): void {
	const { camera, deposit, mapSize } = state;
	const r = camera.zoom * 0.17;
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
	for (let ty = y0; ty < y1; ty++) {
		for (let tx = x0; tx < x1; tx++) {
			const kind = deposit[ty * mapSize + tx];
			if (kind === Deposit.none) continue;
			const p = camera.toScreen(tx + TILE_CENTER, ty + TILE_CENTER);
			ctx.fillStyle = DEPOSIT_COLOR[kind] ?? '#999';
			ctx.beginPath();
			ctx.moveTo(p.x, p.y - r);
			ctx.lineTo(p.x + r, p.y);
			ctx.lineTo(p.x, p.y + r);
			ctx.lineTo(p.x - r, p.y);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		}
	}
}

function drawBuilt(
	ctx: CanvasRenderingContext2D,
	state: DrawState,
	x0: number,
	y0: number,
	x1: number,
	y1: number
): void {
	const { camera, built, mapSize } = state;
	const s = camera.zoom;
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
	for (let ty = y0; ty < y1; ty++) {
		for (let tx = x0; tx < x1; tx++) {
			const kind = built[ty * mapSize + tx];
			if (kind === Built.none) continue;
			const p = camera.toScreen(tx + TILE_CENTER, ty + TILE_CENTER);
			ctx.fillStyle = BUILT_COLOR[kind] ?? '#888';
			// zoomed out, a speck of color is all there is room for
			if (s < 4) {
				const half = Math.max(1, s * 0.35);
				ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
				continue;
			}
			drawBuiltShape(ctx, kind, p.x, p.y, s);
		}
	}
}

function drawBuiltShape(
	ctx: CanvasRenderingContext2D,
	kind: number,
	cx: number,
	cy: number,
	s: number
): void {
	const h = s * 0.38;
	switch (kind) {
		case Built.camp: // a tent
			ctx.beginPath();
			ctx.moveTo(cx, cy - h);
			ctx.lineTo(cx + h, cy + h * 0.8);
			ctx.lineTo(cx - h, cy + h * 0.8);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			break;
		case Built.hut: // walls and a darker roof
			ctx.fillRect(cx - h, cy - h * 0.2, h * 2, h * 1.2);
			ctx.strokeRect(cx - h, cy - h * 0.2, h * 2, h * 1.2);
			ctx.fillStyle = '#8c4f35';
			ctx.beginPath();
			ctx.moveTo(cx - h * 1.2, cy - h * 0.2);
			ctx.lineTo(cx, cy - h * 1.1);
			ctx.lineTo(cx + h * 1.2, cy - h * 0.2);
			ctx.closePath();
			ctx.fill();
			break;
		case Built.field: // a patch with furrows
			ctx.fillRect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
			ctx.strokeStyle = 'rgba(120, 90, 30, 0.55)';
			for (let k = -1; k <= 1; k++) {
				ctx.beginPath();
				ctx.moveTo(cx - s * 0.45, cy + k * s * 0.28);
				ctx.lineTo(cx + s * 0.45, cy + k * s * 0.28);
				ctx.stroke();
			}
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
			break;
		case Built.kiln:
			ctx.beginPath();
			ctx.arc(cx, cy, h, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = '#f2994a';
			ctx.beginPath();
			ctx.arc(cx, cy, h * 0.4, 0, Math.PI * 2);
			ctx.fill();
			break;
		case Built.pen: // a fence
			ctx.strokeStyle = '#6f4e2e';
			ctx.lineWidth = Math.max(1, s * 0.1);
			ctx.strokeRect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84);
			ctx.lineWidth = 1;
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
			break;
		case Built.shrine: // a standing stone
			ctx.beginPath();
			ctx.moveTo(cx, cy - h * 1.2);
			ctx.lineTo(cx + h * 0.8, cy);
			ctx.lineTo(cx, cy + h * 1.2);
			ctx.lineTo(cx - h * 0.8, cy);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			break;
		case Built.furnace:
			ctx.fillRect(cx - h, cy - h, h * 2, h * 2);
			ctx.strokeRect(cx - h, cy - h, h * 2, h * 2);
			ctx.fillStyle = '#f2994a';
			ctx.fillRect(cx - h * 0.4, cy - h * 0.4, h * 0.8, h * 0.8);
			break;
		default: // store
			ctx.fillRect(cx - h, cy - h * 0.7, h * 2, h * 1.4);
			ctx.strokeRect(cx - h, cy - h * 0.7, h * 2, h * 1.4);
			break;
	}
}

// A tiny stable scatter so a herd's dots don't jump around between frames.
function scatter(id: number, n: number): [number, number] {
	let h = (id * 374761393 + n * 668265263) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	const a = ((h >>> 0) % 1000) / 1000;
	const b = (((h >>> 10) ^ (h << 7)) >>> 0) % 1000;
	return [a - 0.5, b / 1000 - 0.5];
}

function drawHerds(ctx: CanvasRenderingContext2D, state: DrawState): void {
	const { camera, herds } = state;
	const s = camera.zoom;
	const margin = 40;
	const r = Math.max(1.4, Math.min(4, s * 0.16));
	for (const herd of herds) {
		const c = camera.toScreen(herd.x + TILE_CENTER, herd.y + TILE_CENTER);
		if (
			c.x < -margin ||
			c.y < -margin ||
			c.x > camera.width + margin ||
			c.y > camera.height + margin
		)
			continue;
		const wolf = herd.kind === 'wolf';
		ctx.fillStyle = wolf ? '#b8433a' : herd.tame ? '#c9a46a' : '#8a6a47';
		const dots = Math.max(1, Math.min(5, herd.count));
		const spread = Math.min(3, 1 + dots * 0.4) * s * 0.35;
		for (let n = 0; n < dots; n++) {
			const [ox, oy] = scatter(herd.id, n);
			const px = c.x + ox * spread * 2;
			const py = c.y + oy * spread * 2;
			ctx.beginPath();
			if (wolf) {
				ctx.moveTo(px, py - r * 1.2);
				ctx.lineTo(px + r, py + r * 0.9);
				ctx.lineTo(px - r, py + r * 0.9);
				ctx.closePath();
			} else {
				ctx.arc(px, py, r, 0, Math.PI * 2);
			}
			ctx.fill();
		}
	}
}

function drawPeople(ctx: CanvasRenderingContext2D, state: DrawState): void {
	const { camera, people, followedId, hoveredId, theme } = state;
	const base = Math.max(2, Math.min(7, 1.6 + camera.zoom * 0.18));
	const margin = 20;
	const outline = theme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.75)';
	let followed: { x: number; y: number; r: number; name: string } | undefined;
	let hovered: { x: number; y: number; r: number; name: string } | undefined;

	ctx.lineWidth = 1;
	ctx.strokeStyle = outline;
	for (const person of people) {
		const p = camera.toScreen(person.x + TILE_CENTER, person.y + TILE_CENTER);
		if (
			p.x < -margin ||
			p.y < -margin ||
			p.x > camera.width + margin ||
			p.y > camera.height + margin
		)
			continue;
		const r = person.child ? base * 0.7 : base;
		ctx.globalAlpha = person.activity === 'sleep' ? 0.5 : 1;
		ctx.fillStyle = villageColor(person.village);
		ctx.beginPath();
		ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		if (person.id === followedId) followed = { x: p.x, y: p.y, r, name: person.name };
		if (person.id === hoveredId) hovered = { x: p.x, y: p.y, r, name: person.name };
	}
	ctx.globalAlpha = 1;

	const ring = theme === 'dark' ? '#ffffff' : '#1b1f23';
	if (hovered && hovered !== followed) {
		ctx.strokeStyle = ring;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(hovered.x, hovered.y, hovered.r + 3, 0, Math.PI * 2);
		ctx.stroke();
	}
	if (followed) {
		ctx.strokeStyle = ring;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(followed.x, followed.y, followed.r + 4, 0, Math.PI * 2);
		ctx.stroke();
	}
	// names only for the two people the viewer is looking at
	ctx.font = `500 12px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.lineJoin = 'round';
	ctx.lineWidth = 3;
	for (const who of [hovered, followed]) {
		if (!who) continue;
		const y = who.y + who.r + 6;
		ctx.strokeStyle = theme === 'dark' ? 'rgba(10, 12, 14, 0.85)' : 'rgba(255, 255, 255, 0.9)';
		ctx.strokeText(who.name, who.x, y);
		ctx.fillStyle = theme === 'dark' ? '#f2f4f5' : '#1b1f23';
		ctx.fillText(who.name, who.x, y);
	}
}

function drawVillageNames(ctx: CanvasRenderingContext2D, state: DrawState): void {
	const { camera, villages, theme } = state;
	const size = Math.max(11, Math.min(16, 9 + camera.zoom * 0.35));
	ctx.font = `600 ${size}px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.lineJoin = 'round';
	ctx.lineWidth = 3.5;
	for (const village of villages) {
		const p = camera.toScreen(village.x + TILE_CENTER, village.y + TILE_CENTER);
		if (p.x < -100 || p.y < -30 || p.x > camera.width + 100 || p.y > camera.height + 30) continue;
		const y = p.y - camera.zoom * 0.7 - 4;
		ctx.strokeStyle = theme === 'dark' ? 'rgba(10, 12, 14, 0.85)' : 'rgba(255, 255, 255, 0.9)';
		ctx.strokeText(village.name, p.x, y);
		ctx.fillStyle = theme === 'dark' ? '#f2f4f5' : '#1b1f23';
		ctx.fillText(village.name, p.x, y);
	}
}

// The person closest to a screen point, within maxPx, or null.
export function nearestPerson(
	people: PersonView[],
	camera: Camera,
	sx: number,
	sy: number,
	maxPx = 10
): number | null {
	let best: number | null = null;
	let bestDist = maxPx * maxPx;
	for (const person of people) {
		const p = camera.toScreen(person.x + TILE_CENTER, person.y + TILE_CENTER);
		const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
		if (d <= bestDist) {
			bestDist = d;
			best = person.id;
		}
	}
	return best;
}
