import { SCALE } from './render';
import { clamp } from './track';

// Where a viewer's camera looks. Everybody watches the same race; each viewer
// may follow one car instead of the whole track. The camera picks out the
// car being followed, works out where to look and how close, and glides there. The renderer then shows that part of the frame
// magnified over the part of the page the race has (render.ts `setCamera`),
// before the broadcast graphics go on top, so they stay their own size.
//
// Everything here is in the track's metres or the frame's pixels; nothing
// here touches the page, so it can be tested on its own.

export type Box = { x: number; y: number; w: number; h: number };

/** What a viewer is following: the whole track, or one car. */
export type Follow = { mode: 'track' } | { mode: 'car'; id: string };

export const TRACK: Follow = { mode: 'track' };

/** How close the camera goes on a followed car: the race's pixels at two and a half times their size. */
export const ZOOM_MAX = 2.5;
/** Seconds ahead of a followed car the camera looks, so it sees where the car is going. */
const LEAD = 0.25;
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

/** How many times its size the lens shows the frame. */
export const zoomOf = ({ from, to }: Lens) => to.w / from.w;

/** Whether a point is inside a box. */
export const inside = (box: Box, x: number, y: number) =>
	x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;

/** The car a choice picks out of the field, if it is in it. */
export function chosen<T extends Body>(follow: Follow, cars: T[]): T | null {
	if (follow.mode === 'track') return null;
	return cars.find((car) => car.entry.id === follow.id) ?? null;
}

/**
 * Where to look to see `car`: close up, a little ahead of it. Nothing to
 * follow is null: the whole track.
 */
export function aim(car: Body | null): Aim | null {
	if (!car) return null;
	const ahead = car.retired ? 0 : car.speed * LEAD;
	return {
		x: car.x + Math.cos(car.angle) * ahead,
		y: car.y + Math.sin(car.angle) * ahead,
		zoom: ZOOM_MAX
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

/** What a click on a car does to what is followed: follows it, or, if it is the car followed, goes back to the track. */
export function toggle(follow: Follow, id: string): Follow {
	return follow.mode === 'car' && follow.id === id ? TRACK : { mode: 'car', id };
}

/** A choice kept from before, if the field has its car: otherwise the whole track. */
export function keep(follow: Follow, field: string[]): Follow {
	return follow.mode === 'car' && !field.includes(follow.id) ? TRACK : follow;
}

/**
 * A choice as kept in the page's storage, read back. Anything else, including
 * the group views there used to be, is the whole track.
 */
export function parse(stored: string | null): Follow {
	try {
		const value = JSON.parse(stored ?? '') as { mode?: unknown; id?: unknown } | null;
		if (value?.mode === 'car' && typeof value.id === 'string') return { mode: 'car', id: value.id };
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
