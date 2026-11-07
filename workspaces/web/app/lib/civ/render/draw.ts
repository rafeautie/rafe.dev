import { drawActorOverlays, collectActors } from './actors';
import { drawAtmosphere } from './atmosphere';
import { collectGround } from './ground';
import { drawMap } from './mapview';
import { collectObjects } from './objects';
import { viewOf, type DrawState, type Standing, type View } from './scene';

export type { DrawState } from './scene';
export { nearestPerson } from './actors';

// Puts a frame together, back to front: the overview map, the close-up
// ground, everything that stands up (trees, buildings, people, animals) in
// order of where its foot is, then light and weather, then labels.

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// reused between frames so a busy scene doesn't make garbage every frame
const standing: Standing[] = [];

export function drawFrame(ctx: CanvasRenderingContext2D, state: DrawState): void {
	const { camera } = state;
	const { width, height } = camera;
	const view = viewOf(state);

	// the camera is in device pixels, so no scaling here; `dpr` is only for
	// sizing text and lines that should look the same at any display scaling
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.fillStyle = state.theme === 'dark' ? '#14171a' : '#e9ecee';
	ctx.fillRect(0, 0, width, height);
	if (view.x1 <= view.x0 || view.y1 <= view.y0) return;

	ctx.imageSmoothingEnabled = false;
	// the top-down overview image only lines up in the overview itself
	if (!view.iso) drawOverview(ctx, state, view);
	// map mode: the iso map is pre-rendered in chunks (terrain covering
	// terrain is baked in), and the tiny icons of people go on top
	if (view.mode === 'map') drawMap(ctx, state, view);

	// local mode: ground tiles, objects, people and animals all go through
	// one depth sort, so a raised hill in front covers what's behind it
	standing.length = 0;
	if (view.mode === 'local') {
		collectGround(state, view, standing);
		collectObjects(state, view, standing);
	}
	collectActors(state, view, standing);
	standing.sort((a, b) => a.y - b.y);
	for (const thing of standing) thing.draw(ctx);

	drawAtmosphere(ctx, state, view);
	drawActorOverlays(ctx, state, view);
	if (view.zoom >= 3) drawVillageNames(ctx, state);
}

// The map as one pixel per tile, scaled up. Up close the ground layer covers it.
function drawOverview(ctx: CanvasRenderingContext2D, state: DrawState, view: View): void {
	const { terrain } = state;
	ctx.drawImage(
		terrain,
		view.x0,
		view.y0,
		view.x1 - view.x0,
		view.y1 - view.y0,
		view.originX + view.x0 * view.zoom,
		view.originY + view.y0 * view.zoom,
		(view.x1 - view.x0) * view.zoom,
		(view.y1 - view.y0) * view.zoom
	);
}

function drawVillageNames(ctx: CanvasRenderingContext2D, state: DrawState): void {
	const { camera, villages, theme, dpr } = state;
	// sizes in CSS pixels, scaled to the device pixels the camera works in
	const css = camera.zoom / dpr;
	const size = Math.max(11, Math.min(16, 9 + css * 0.35)) * dpr;
	ctx.font = `600 ${size}px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.lineJoin = 'round';
	ctx.lineWidth = 3.5 * dpr;
	for (const village of villages) {
		const p = camera.toScreen(village.x + 0.5, village.y + 0.5);
		if (p.x < -100 * dpr || p.y < -30 * dpr || p.x > camera.width + 100 * dpr) continue;
		if (p.y > camera.height + 30 * dpr) continue;
		const y = p.y - Math.min(camera.zoom * 0.7, 60 * dpr) - 4 * dpr;
		ctx.strokeStyle = theme === 'dark' ? 'rgba(10, 12, 14, 0.85)' : 'rgba(255, 255, 255, 0.9)';
		ctx.strokeText(village.name, p.x, y);
		ctx.fillStyle = theme === 'dark' ? '#f2f4f5' : '#1b1f23';
		ctx.fillText(village.name, p.x, y);
	}
}
