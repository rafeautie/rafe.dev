import type { HerdView, PersonView } from '../types';

// If something moved further than this between two frames it was moved, not
// walked (a birth far away, a respawn), so it jumps instead of sliding.
const SNAP_TILES = 30;

function blend<T extends { id: number; x: number; y: number }>(
	prev: T[],
	next: T[],
	t: number
): T[] {
	const k = t < 0 ? 0 : t > 1 ? 1 : t;
	const before = new Map<number, T>();
	for (const item of prev) before.set(item.id, item);
	const out = new Array<T>(next.length);
	for (let n = 0; n < next.length; n++) {
		const to = next[n];
		const from = before.get(to.id);
		if (!from || Math.abs(to.x - from.x) + Math.abs(to.y - from.y) > SNAP_TILES) {
			out[n] = to;
			continue;
		}
		out[n] = { ...to, x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
	}
	return out;
}

// Positions between two frames, t = 0 at `prev` and 1 at `next`. Matched by
// id; anyone new appears where they are, and anyone gone is dropped.
export const interpolatePeople = (prev: PersonView[], next: PersonView[], t: number) =>
	blend(prev, next, t);

export const interpolateHerds = (prev: HerdView[], next: HerdView[], t: number) =>
	blend(prev, next, t);
