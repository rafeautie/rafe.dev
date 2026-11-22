import { SCALE } from './render';
import { rank } from './sim';
import { clamp } from './track';

// Where a viewer's camera looks. Everybody watches the same race; each viewer
// may follow one car, or a group of them, instead of the whole track. The
// camera picks out the cars being followed, works out where to look and how
// close, and glides there. The renderer then shows that part of the frame
// magnified over the part of the page the race has (render.ts `setCamera`),
// before the broadcast graphics go on top, so they stay their own size.
//
// Everything here is in the track's metres or the frame's pixels; nothing
// here touches the page, so it can be tested on its own.

export type Box = { x: number; y: number; w: number; h: number };

/**
 * What a viewer is following: the whole track; one car; a car and whoever is
 * racing it for position (the leader's battle when no car is named); the cars
 * they have bet on; or a group they picked.
 */
export type Follow =
	| { mode: 'track' }
	| { mode: 'car'; id: string }
	| { mode: 'battle'; id: string | null }
	| { mode: 'mine' }
	| { mode: 'group'; ids: string[] };

export const TRACK: Follow = { mode: 'track' };

/** The closest the camera goes, which is where one car is followed: the race's pixels at three times their size. */
export const ZOOM_MAX = 3;
/** A group is followed no further out than the whole track. */
export const ZOOM_MIN = 1;
/** Room kept round a group, in metres. */
export const MARGIN = 12;
/** Seconds ahead of a followed car the camera looks, so it sees where the car is going. */
const LEAD = 0.25;
/** A car is in a battle with another this many seconds up or down the road from it, or this many metres when slow. */
const BATTLE_S = 1;
const BATTLE_M = 12;
/** How quickly the camera catches up: about this many seconds to close two thirds of the way. */
const GLIDE = 0.15;

/** Enough of a car to follow it. */
export type Body = {
	entry: { id: string };
	x: number;
	y: number;
	angle: number;
	speed: number;
	retired: boolean;
	progress: number;
	finishTime: number;
};

/** Where the camera looks, in the track's metres, and how close. */
export type Aim = { x: number; y: number; zoom: number };

/**
 * Which part of the frame is shown (`from`, in the frame's pixels) and where
 * it is shown magnified (`to`, the part of the frame the race has).
 */
export type Lens = { from: Box; to: Box };

/** Where the track is in the frame and how big the frame is, in its pixels. */
export type Frame = { width: number; height: number; ox: number; oy: number };

/** The car at the head of the race, as the running order has it. */
const leader = <T extends Body>(cars: T[]): T | null => rank(cars)[0] ?? null;

/** How many times its size the lens shows the frame. */
export const zoomOf = ({ from, to }: Lens) => to.w / from.w;

/** Whether a point is inside a box. */
export const inside = (box: Box, x: number, y: number) =>
	x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;

/** Following a number of cars: none is the whole track, one is that car, more a group. */
const following = (ids: string[]): Follow =>
	ids.length > 1 ? { mode: 'group', ids } : ids.length ? { mode: 'car', id: ids[0] } : TRACK;

/**
 * A car and those racing it: every car still running within a second of it
 * up or down the road, by race distance, so lapped cars it passes are not in
 * it. With nobody that close, the nearest car either way.
 */
export function battle<T extends Body>(anchor: T, cars: T[]): T[] {
	const running = cars.filter((car) => car !== anchor && !car.retired);
	const reach = Math.max(BATTLE_M, Math.abs(anchor.speed) * BATTLE_S);
	const near = running.filter((car) => Math.abs(car.progress - anchor.progress) <= reach);
	if (near.length || !running.length) return [anchor, ...near];
	const nearest = running.reduce((a, b) =>
		Math.abs(a.progress - anchor.progress) <= Math.abs(b.progress - anchor.progress) ? a : b
	);
	return [anchor, nearest];
}

/** The cars a choice picks out of the field, `backed` being the ids of the cars bet on. */
export function chosen<T extends Body>(follow: Follow, cars: T[], backed: Set<string>): T[] {
	const byId = (id: string) => cars.find((car) => car.entry.id === id);
	switch (follow.mode) {
		case 'track':
			return [];
		case 'car': {
			const car = byId(follow.id);
			return car ? [car] : [];
		}
		case 'group':
			return follow.ids.map(byId).filter((car): car is T => car !== undefined);
		case 'mine':
			return cars.filter((car) => backed.has(car.entry.id));
		case 'battle': {
			const anchor = (follow.id && byId(follow.id)) || leader(cars);
			return anchor ? battle(anchor, cars) : [];
		}
	}
}

/**
 * The one car whose numbers are shown, of those a choice picked: the car, the
 * one a battle is about, the first of a group, or of the cars bet on the one
 * furthest up the race.
 */
export function focus<T extends Body>(follow: Follow, picked: T[]): T | null {
	return follow.mode === 'mine' ? leader(picked) : (picked[0] ?? null);
}

/**
 * Where to look to see `bodies` in `to` (the frame's pixels the race has): a
 * car close up, a little ahead of it, or a group all in view with room round
 * it. Nothing to follow is null: the whole track.
 */
export function aim(bodies: Body[], to: Box): Aim | null {
	if (!bodies.length) return null;
	if (bodies.length === 1) {
		const [car] = bodies;
		const ahead = car.retired ? 0 : car.speed * LEAD;
		return {
			x: car.x + Math.cos(car.angle) * ahead,
			y: car.y + Math.sin(car.angle) * ahead,
			zoom: ZOOM_MAX
		};
	}
	const xs = bodies.map((car) => car.x);
	const ys = bodies.map((car) => car.y);
	const [left, right] = [Math.min(...xs) - MARGIN, Math.max(...xs) + MARGIN];
	const [top, bottom] = [Math.min(...ys) - MARGIN, Math.max(...ys) + MARGIN];
	const fits = Math.min(to.w / ((right - left) * SCALE), to.h / ((bottom - top) * SCALE));
	// in quarter steps, so a group spreading a little does not keep the camera breathing
	return {
		x: (left + right) / 2,
		y: (top + bottom) / 2,
		zoom: clamp(Math.floor(fits * 4) / 4, ZOOM_MIN, ZOOM_MAX)
	};
}

/** The camera's rest: the part of the frame the race has, as it is, unmagnified. */
export function home(to: Box, { ox, oy }: Frame): Aim {
	return {
		x: (to.x + to.w / 2 - ox) / SCALE,
		y: (to.y + to.h / 2 - oy) / SCALE,
		zoom: 1
	};
}

/**
 * The part of the frame shown, for an aim: `to` shrunk by the zoom, round
 * where the camera looks, and slid back inside the frame where it would run
 * off it, so there is never nothing to show.
 */
export function framing(aim: Aim, to: Box, frame: Frame): Box {
	const w = Math.min(frame.width, to.w / aim.zoom);
	const h = Math.min(frame.height, to.h / aim.zoom);
	const cx = frame.ox + aim.x * SCALE;
	const cy = frame.oy + aim.y * SCALE;
	return {
		x: clamp(cx - w / 2, 0, frame.width - w),
		y: clamp(cy - h / 2, 0, frame.height - h),
		w,
		h
	};
}

/** Where a point of the track (metres) is on the frame once it is magnified, in the frame's pixels. */
export function toFrame({ from, to }: Lens, frame: Frame, x: number, y: number) {
	return {
		x: to.x + ((frame.ox + x * SCALE - from.x) * to.w) / from.w,
		y: to.y + ((frame.oy + y * SCALE - from.y) * to.h) / from.h
	};
}

/** Where a pixel of the magnified frame is on the track, in metres. */
export function toWorld({ from, to }: Lens, frame: Frame, px: number, py: number) {
	return {
		x: (from.x + ((px - to.x) * from.w) / to.w - frame.ox) / SCALE,
		y: (from.y + ((py - to.y) * from.h) / to.h - frame.oy) / SCALE
	};
}

/** The car nearest a point of the track, if one is within `reach` metres of it. */
export function pick<T extends Body>(cars: T[], x: number, y: number, reach = 4): T | null {
	let best: T | null = null;
	let least = reach;
	for (const car of cars) {
		const d = Math.hypot(car.x - x, car.y - y);
		if (d <= least) [best, least] = [car, d];
	}
	return best;
}

/**
 * What a click does to what is followed: a car on its own, or with `add`
 * (shift or ctrl held) the car into or out of the group.
 */
export function toggle(follow: Follow, id: string, add: boolean): Follow {
	if (!add) return follow.mode === 'car' && follow.id === id ? TRACK : { mode: 'car', id };
	const ids = follow.mode === 'car' ? [follow.id] : follow.mode === 'group' ? [...follow.ids] : [];
	return following(ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]);
}

/** A choice kept from before, if the field has its cars: otherwise the whole track. */
export function keep(follow: Follow, field: string[]): Follow {
	const has = (id: string) => field.includes(id);
	switch (follow.mode) {
		case 'car':
			return has(follow.id) ? follow : TRACK;
		case 'battle':
			return follow.id && !has(follow.id) ? { mode: 'battle', id: null } : follow;
		case 'group': {
			// the same choice when every car is still there, so nothing changes
			const ids = follow.ids.filter(has);
			return ids.length === follow.ids.length ? follow : following(ids);
		}
		default:
			return follow;
	}
}

/** A choice as kept in the page's storage, read back; anything unreadable is the whole track. */
export function parse(stored: string | null): Follow {
	try {
		const value = JSON.parse(stored ?? '') as Follow;
		if (value.mode === 'car' && typeof value.id === 'string') return value;
		if (value.mode === 'battle' && (value.id === null || typeof value.id === 'string')) {
			return value;
		}
		if (value.mode === 'mine') return value;
		if (
			value.mode === 'group' &&
			Array.isArray(value.ids) &&
			value.ids.every((id) => typeof id === 'string')
		) {
			return value;
		}
	} catch {
		// not a choice
	}
	return TRACK;
}

/**
 * The camera: where it is looking, gliding towards where it is told to look
 * each frame, closer and further in proportion (so zooming feels even), and
 * coming to rest exactly there. With `still` (prefers-reduced-motion) it cuts.
 */
export function createCamera() {
	let at: Aim | null = null;
	return {
		/** Moves `dt` seconds towards `target`, or towards `rest` with nothing to follow, and says where it now is. */
		update(target: Aim | null, rest: Aim, dt: number, still = false): Aim {
			const goal = target ?? rest;
			if (!at || still) {
				at = { ...goal };
				return at;
			}
			const t = 1 - Math.exp(-dt / GLIDE);
			const zoom = Math.exp(Math.log(at.zoom) + (Math.log(goal.zoom) - Math.log(at.zoom)) * t);
			at = {
				x: at.x + (goal.x - at.x) * t,
				y: at.y + (goal.y - at.y) * t,
				zoom
			};
			const near =
				Math.abs(goal.zoom - at.zoom) < 0.01 &&
				Math.hypot(goal.x - at.x, goal.y - at.y) * SCALE < 1;
			if (near) at = { ...goal };
			return at;
		}
	};
}
