import type { PersonView } from '../types';
import type { Camera } from './camera';
import type { DrawState, Standing, View } from './scene';

// People and animals. Placeholder until the close-up figures are built: for
// now a person stands in the middle of their tile.

export function personPosition(person: PersonView, _now: number): { x: number; y: number } {
	return { x: person.x + 0.5, y: person.y + 0.5 };
}

export function collectActors(_state: DrawState, _view: View, _out: Standing[]): void {}

// Selection rings and names, drawn over everything else.
export function drawActorOverlays(
	_ctx: CanvasRenderingContext2D,
	_state: DrawState,
	_view: View
): void {}

// The person closest to a screen point, within maxPx, or null.
export function nearestPerson(
	people: PersonView[],
	camera: Camera,
	now: number,
	sx: number,
	sy: number,
	maxPx = 10
): number | null {
	let best: number | null = null;
	let bestDist = maxPx * maxPx;
	for (const person of people) {
		const at = personPosition(person, now);
		const p = camera.toScreen(at.x, at.y);
		const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
		if (d <= bestDist) {
			bestDist = d;
			best = person.id;
		}
	}
	return best;
}
