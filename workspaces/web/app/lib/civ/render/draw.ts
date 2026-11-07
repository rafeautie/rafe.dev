import { drawActorOverlays, collectActors } from './actors';
import { drawAtmosphere } from './atmosphere';
import { drawGround } from './ground';
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
	const { camera, dpr } = state;
	const { width, height } = camera;
	const view = viewOf(state);

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.fillStyle = state.theme === 'dark' ? '#14171a' : '#e9ecee';
	ctx.fillRect(0, 0, width, height);
	if (view.x1 <= view.x0 || view.y1 <= view.y0) return;

	drawOverview(ctx, state, view);
	drawGround(ctx, state, view);

	standing.length = 0;
	collectObjects(state, view, standing);
	collectActors(state, view, standing);
	standing.sort((a, b) => a.y - b.y);
	for (const thing of standing) thing.draw(ctx);

	drawAtmosphere(ctx, state, view);
	drawActorOverlays(ctx, state, view);
	if (view.zoom >= 3) drawVillageNames(ctx, state);
}

// The map as one pixel per tile, scaled up. Up close the ground layer covers it.
function drawOverview(ctx: CanvasRenderingContext2D, state: DrawState, view: View): void {
	if (view.detail >= 1) return;
	const { camera, terrain } = state;
	ctx.imageSmoothingEnabled = false;
	const origin = camera.toScreen(view.x0, view.y0);
	ctx.drawImage(
		terrain,
		view.x0,
		view.y0,
		view.x1 - view.x0,
		view.y1 - view.y0,
		origin.x,
		origin.y,
		(view.x1 - view.x0) * view.zoom,
		(view.y1 - view.y0) * view.zoom
	);
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
		const p = camera.toScreen(village.x + 0.5, village.y + 0.5);
		if (p.x < -100 || p.y < -30 || p.x > camera.width + 100 || p.y > camera.height + 30) continue;
		const y = p.y - Math.min(camera.zoom * 0.7, 60) - 4;
		ctx.strokeStyle = theme === 'dark' ? 'rgba(10, 12, 14, 0.85)' : 'rgba(255, 255, 255, 0.9)';
		ctx.strokeText(village.name, p.x, y);
		ctx.fillStyle = theme === 'dark' ? '#f2f4f5' : '#1b1f23';
		ctx.fillText(village.name, p.x, y);
	}
}
