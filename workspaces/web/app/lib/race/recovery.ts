import { PolygonShape, type Contact, type World } from 'planck';
import { LANE, pitsFor } from './pits';
import {
	KERBSIDE,
	NEARSIDE,
	RING,
	TRUCK,
	TRUCK_HALF,
	WHEELBASE,
	hookOf,
	serviceFor,
	type Pose,
	type Route
} from './service';
import type { Car } from './sim';
import {
	HALF_CORRIDOR,
	HALF_ROAD,
	NOSE,
	WALLS,
	clamp,
	lateral,
	nearest,
	triangle,
	type Track
} from './track';

// The tow trucks and the job they do. Each is a flatbed with room on its bed
// for two cars, one behind the other, and a crane between the cab and the
// bed to lift them on and off. They stand in the yard at the end of the pit
// lane, past the last box (pits.ts), wherever there is room for them, and
// the pit lane is their way onto the track and off it.
//
// The wrecks are shared out between the trucks by one dispatcher, which has
// both of them out at once if that clears the track sooner: it works out,
// for every way of sharing out the wrecks still lying and every order each
// truck could take its share in, how long it would take each truck to get to
// them, lift them, and be back behind the wall with them, and picks the one
// that has the track clear soonest. It works it out again whenever there is
// a new wreck, a truck lifts one, or a truck is free again, so a wreck that
// happens mid-caution is fitted in with the rest: on a bed with room that is
// out already, or on whichever truck can get to it first.
//
// The way to each wreck is the quickest of a few a truck can take, on down
// the track or backwards up it: on round to it and across to pull up beside
// it; on to it along the line it is on, if that passes clear of it; on past
// it and back to it, if it is too near to get across to it first; or back up
// the track to it, or back far enough to get across to it, if it lies just
// behind. Each is timed: backing up is slow, a lap is slower.
//
// Called for a wreck, a truck pulls out to the end of the lane and holds
// there until the cars have gone by. Then it goes out onto the track and to
// the wreck, and pulls up alongside it with its crane level with the middle
// of it. The crane swings out over the wreck, the crew put the slings on, and
// it lifts the wreck, swings it in over the bed and lets it down there. With
// room for another and another to fetch, the truck goes on for that one;
// with a full bed, or nothing more to fetch, it goes on round the lap, in at
// the way into the pits, and down the lane. It stops beside each wreck's own
// box, and the crane lifts the wreck off the bed and into the box. Then it
// goes back to the yard, or straight out for the next.
//
// The truck is not driven like a car. It follows a way worked out for each
// part of the job (service.ts), and it is steered along it as a truck is:
// its front wheels turn, no further than they go and no faster than they
// can be turned, and the truck goes round about its back axles, so it turns
// only as it moves, and those cut a little inside the way its front takes.
// Backing up, it is steered by its back axles, which go first. What is on
// the crane or the bed goes where the truck takes it, off the ground, where
// no car can touch it. The truck itself is solid, and as heavy as a loaded
// flatbed is: a car that runs into it takes the knock, and hardly moves it,
// and the truck is straight back on its way. It drives through the track's
// walls, where the pit lane meets the track, as a car in the pits does. It
// does not drive on over a car it bumps into, going forwards or backing up.

/** Seconds from the call to the truck leaving the yard. */
const SCRAMBLE = 0.6;
/** The truck holds at the end of the lane with its front axle this far short of where the way out begins. */
const HOLD = 2;
/** With its front axle this far past the end of the way in, the truck and all it carries are through the wall. */
const THROUGH = 4;
/** Along the track, the most it takes the truck to get across to the side it pulls up beside a wreck on, and how far it then runs straight there, so that all of it is in line before it stops. */
const DRIFT = 14;
const STRAIGHT_ON = 8;
/** The furthest to one side the truck pulls up beside a wreck, middle to middle, and how near the wall it will go if it has to. */
const PASS = 4;
const EDGE = 5.4;
/** How much room it leaves between its tyres and a wreck it pulls up beside. */
const GAP = 0.5;
/** From the middle of a car to either side of it. */
const FLANK = 0.95;
/** How far forward of the axle it is steered by the crane is: the truck stops with that axle this far past what it is to lift. */
const LEAD = TRUCK.axle - TRUCK.pivot;
/** The furthest the crane reaches. */
const REACH = 8;
/** The crane folded away: across the truck, just behind the cab, with nothing on it. */
export const STOWED: Crane = { swing: Math.PI / 2, reach: 1, raise: 0 };
/** How fast the crane slews round (rad/s), runs its boom out or in (m/s), and lifts or lowers a car (all the way up, a second). */
const SLEW = 1.4;
const EXTEND = 3;
const HOIST = 0.8;
/** And how fast the crew turn a car on the crane to lie the way it is to go down (rad/s). */
const TWIST = 1.2;
/** Seconds the crew take to put the slings on a car, and to take them off one let down in its box. */
const SLING = 0.9;
const UNSLING = 0.6;
/** Coming up to a wreck, the truck has its crane swinging round to it from this far off (m). */
const READY = 12;
/** In the pits, the truck stops for a car this near the road just ahead of it, and for the other truck this near (m). */
const SHY = 2.6;
const SHY_TRUCK = 0.3;
/** How far ahead of the axle it is steered by the truck's front bumper is. */
const BUMPER = TRUCK.long - TRUCK.axle;
/** How hard the truck brakes, and pulls away, light and loaded, m/s². */
const BRAKE = 5;
const PULL = 8;
const HAUL = 6;
/** How fast it squares itself up in the yard, m/s at its ends: the last of a turn of the wheel, at a crawl. */
const SQUARE = 0.4;
/** How far along the lane it takes to turn into the yard off it, no tighter than a truck steers. */
const TURN_IN = 14;
/** From the back axles to the point on the truck that is steered along the way. */
const GUIDE = TRUCK.axle - TRUCK.rear;
/** How hard it is steered back onto the way, for each metre off it; and how far ahead along it it looks for which way the way runs, in seconds at the pace it is going. */
const HOLD_LINE = 1.2;
const LOOK = 0.05;
/** The front of the truck's front tyres, and how near the edge of the tarmac it lets its tyres go. */
const FRONT = TRUCK.wheels[0] + 0.5;
const ROADSIDE = HALF_ROAD - 0.2;
/** How fast it goes down the pit lane, m/s. */
const LANE_PACE = 11;
/** On the track, a truck stops this far short of another that is going for a wreck or at work on one (m). */
const STAND_OFF = 40;
/** On the track, it waits this long behind a car that is all but stopped in its way before it edges on by, at this speed (m/s), pushing it aside if it must. */
const FORBEARANCE = 6;
const NUDGE = 1;
/** Held at the end of the lane, the truck waits for a car this many seconds from where it comes out. */
const CLEAR_FOR = 4;
/** After this long held at the end of the lane, the truck goes whoever is coming. */
const PATIENCE = 8;
/** What the dispatcher counts a wreck left waiting as costing: more than any trip, however late in the race. */
const LEFT = 1e6;
/** A wreck moving no faster than this (m/s) is as good as lying still, to a truck that has waited for it that long. */
const CREEPING = 3;
/** What the truck weighs (kg): nine of the cars. */
const MASS = 9000;
/** A car a truck has lifted, as the physics tells what touches what: the trucks never touch one. */
const TOWED = 0x0004;
/**
 * Backing up: how fast it goes (m/s), how hard it pulls away and stops
 * (m/s²), how far behind its back axles it looks for which way to steer
 * them, and the furthest it backs up the track for a wreck (m).
 */
const BACK_PACE = 3.5;
const BACK_PULL = 1.5;
const BACK_BRAKE = 2.5;
const BACK_LOOK = 4.5;
const MAX_BACK = 60;
/** How long it waits for something behind it to get out of its way before it gives up backing and goes on round instead. */
const BACK_PATIENCE = 6;
/** From the front axle back to the truck's tail, and a little more: how far past a wreck it is before it can get across in front of it backing up. */
const TAIL = TRUCK.axle + TRUCK.long + NOSE + 1;
/**
 * Pulling up behind a wreck rather than beside it, how far behind its middle
 * the truck's front axle stops, and how far to one side of it the crane still
 * reaches it from there (m); and how much that is worse than pulling up
 * beside it, where there is the room, in seconds.
 */
const BEHIND = BUMPER + NOSE + 1.2;
/** The furthest a truck goes on along the line it is on to pull up at a wreck, rather than back onto the tarmac and across again (m). */
const SHORT_HOP = 30;
const BEHIND_SIDE = 4;
const AWKWARD = 2;
/** Coming out of the pits, how far down the track it gets straight before it can back up. */
const STRAIGHTEN = 10;
/**
 * For working out which truck goes for which wreck: how fast a truck gets
 * along the track on average, light and loaded (m/s); seconds to stop and
 * pull away again, or to stop and change direction; how long a lift takes,
 * and putting a car in its box; how long after one truck the next can come
 * out of the pits; and how much sooner a new plan must clear the track to
 * be worth changing the one the trucks are on for each wreck.
 */
const LIGHT = 16;
const LOADED = 12;
const PULL_UP = 2;
const CHANGE = 2;
const LIFT = 7;
const DROP = 6;
const EXIT_GAP = 5;
const KEEP = 3;
/** The plan is worked out again at least this often (s) while there is a wreck to fetch. */
const REPLAN = 0.5;
/**
 * In the yard, the room a truck leaves between itself and another (m): how
 * far apart their middles are at the least, and how far ahead of one standing
 * there the middle of one turning in off the lane in front of it has to be.
 */
const YARD_GAP = 1.2;
const YARD_LONG = 2 * TRUCK.long + YARD_GAP;
const SWEEP = TURN_IN + 2 * TRUCK.axle + 1 + YARD_GAP + TRUCK.long - TRUCK.axle;

/** How many cars a truck's bed holds. */
export const LOAD = TRUCK.bed.length;

/** An angle as the short way round, -π to π. */
const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Of a way round and the way round opposite it, the one an angle is nearer: 0 or π. */
const nearerEnd = (angle: number) => (Math.abs(turn(angle)) < Math.PI / 2 ? 0 : Math.PI);

/** Moves a value towards another, no more than `step`; says whether it got there. */
function toward(value: number, to: number, step: number): [number, boolean] {
	return Math.abs(to - value) <= step ? [to, true] : [value + Math.sign(to - value) * step, false];
}

export type Truck = ReturnType<typeof createTruck>['truck'];

/** Whether a place is on a truck, or within `margin` of it. */
export function onTruck(
	truck: { x: number; y: number; angle: number },
	px: number,
	py: number,
	margin: number
) {
	const [cos, sin] = [Math.cos(truck.angle), Math.sin(truck.angle)];
	const [dx, dy] = [px - truck.x, py - truck.y];
	return (
		Math.abs(dx * cos + dy * sin) < TRUCK.long + margin &&
		Math.abs(dy * cos - dx * sin) < TRUCK.wide + margin
	);
}

/** The crane: which way it points from straight ahead (radians, towards the truck's left positive), how far out its hook is from where it turns, and how high it has lifted what is on it, 0 to 1. */
export type Crane = { swing: number; reach: number; raise: number };

/**
 * Something on the road, as the drivers see the trucks: a truck is one at
 * each end of it, so a car coming up behind one sees the back of it as well
 * as the front.
 */
export type Marker = {
	sample: number;
	across: number;
	speed: number;
	retired: true;
	towed: boolean;
	/** How much further it reaches to either side than a wreck does. */
	wide: number;
};

/** A place on the way, as the track counts its samples (on past the line without starting again), and how far across. */
type Key = [number, number];

/** Part of the way to a wreck: driven forwards, or backed up, through its keys in turn. */
type Segment = { back: boolean; keys: Key[] };

/** A way to a wreck: how long it takes, its parts, and where the truck's front axle ends up beside it. */
type Leg = { time: number; segments: Segment[]; end: { s: number; a: number } };

/** Where a way to a wreck starts from: on the track, or with the way out of the pits that leads there first. */
type Start = { s: number; a: number; prefix?: Key[] };

/** How far a wreck reaches across the track to either side of its middle, the way it is lying. */
function spread(track: Track, car: Car) {
	const skew = car.body.getAngle() - Math.atan2(track.ty[car.sample], track.tx[car.sample]);
	return Math.abs(Math.sin(skew)) * NOSE + Math.abs(Math.cos(skew)) * FLANK;
}

/** How far across from a wreck's middle a truck's middle must be to go by it clear. */
const clearance = (track: Track, car: Car) => spread(track, car) + TRUCK_HALF + GAP;

/**
 * Where across the track the truck pulls up beside a wreck: far enough to
 * one side of it to clear it, the way it is lying, and on the tarmac if
 * there is room for that either side of it. If there is not, it goes the
 * side that takes it least far onto the verge, and as far as it has to.
 */
function beside(track: Track, car: Car) {
	const clear = Math.min(PASS, clearance(track, car));
	const sides = [car.across - clear, car.across + clear].sort((a, b) => Math.abs(a) - Math.abs(b));
	return clamp(sides[0], -EDGE, EDGE);
}

/**
 * The ways a truck can take to a wreck, and how long each takes it: as the
 * dispatcher reckons them up, and as the truck that goes picks one.
 */
function createRoads(track: Track) {
	const { n, step } = track;
	const { ahead, place } = serviceFor(track);
	const lane = pitsFor(track);
	const forward = (far: number, loaded: boolean) =>
		(far * step) / (loaded ? LOADED : LIGHT) + PULL_UP;
	const backward = (far: number) => (far * step) / BACK_PACE + CHANGE;

	/** Whether a line across the track passes clear of every wreck lying between two places on it, but one. */
	function clearLine(a: number, lo: number, hi: number, lying: Car[], except: Car) {
		for (const car of lying) {
			if (car === except || car.towed) continue;
			if (ahead(lo - NOSE, car.sample) > hi - lo + 2 * NOSE) continue;
			if (Math.abs(a - car.across) < clearance(track, car) - 0.2) return false;
		}
		return true;
	}

	/**
	 * Whether backing up through these keys keeps the truck's tyres on the
	 * tarmac, where its way is on it. Backing round a bend its back axles
	 * keep to the way, and its front, going last, swings out wide of it, by
	 * more the tighter the bend: the way must leave room for that.
	 */
	/** Which way across is the outside of the bend the track is in at each sample: 1 or -1. */
	const outside = Float32Array.from({ length: n }, (_, i) => {
		const [a, b] = [(i + n - 1) % n, (i + 1) % n];
		const towards =
			(track.tx[b] - track.tx[a]) * track.nx[i] + (track.ty[b] - track.ty[a]) * track.ny[i];
		return towards > 0 ? -1 : 1;
	});

	function backable(keys: Key[]) {
		const swing = (FRONT - TRUCK.rear) ** 2 / 2;
		for (let k = 0; k + 1 < keys.length; k++) {
			const [[s0, a0], [s1, a1]] = [keys[k], keys[k + 1]];
			const span = Math.abs(s1 - s0);
			for (let t = 0; t <= span; t++) {
				const s = s0 + Math.sign(s1 - s0) * t;
				const a = a0 + ((a1 - a0) * t) / Math.max(1, span);
				if (Math.abs(a) > HALF_ROAD) continue;
				const i = ((Math.round(s) % n) + n) % n;
				const front = a + outside[i] * swing * track.bend[i];
				if (Math.abs(front) > Math.abs(a) && Math.abs(front) + TRUCK_HALF > ROADSIDE) return false;
			}
		}
		return true;
	}

	/** The ways that start by going on down the track, from `s` across at `a`; `join` puts what leads there in front of the first part. */
	function onward(s: number, a: number, car: Car, lying: Car[], loaded: boolean, backing: boolean) {
		const out: Leg[] = [];
		const side = beside(track, car);
		const off = Math.abs(a - car.across);
		const fwd = ahead(s, car.sample);
		const ws = s + fwd;
		const over = Math.abs(side - a);
		const gentle = clamp(over * 4, 2, DRIFT);
		const sharp = clamp(over * 3, 3, DRIFT);
		// On round to it and across to pull up beside it, gently if there is
		// room, and if not as sharply as a truck can; one nearer than that is
		// gone round the lap for.
		{
			const least = s + sharp + STRAIGHT_ON;
			const at = least + ahead(least, car.sample);
			const drift = Math.min(gentle, at - s - STRAIGHT_ON);
			const stop = at + LEAD;
			// one that set out from beside a wreck at the edge of the road is
			// back on the tarmac for the run there, if it is a run
			const travel = clamp(a, -KERBSIDE, KERBSIDE);
			const run = stop - STRAIGHT_ON - drift - (s + gentle);
			const keys: Key[] =
				travel !== a && run > 4
					? [
							[s, a],
							[s + gentle, travel],
							[stop - STRAIGHT_ON - drift, travel],
							[stop - STRAIGHT_ON, side],
							[stop, side]
						]
					: [
							[s, a],
							[Math.max(s, stop - STRAIGHT_ON - drift), a],
							[Math.max(s, stop - STRAIGHT_ON), side],
							[stop, side]
						];
			out.push({
				time: forward(stop - s, loaded),
				end: { s: stop, a: side },
				segments: [{ back: false, keys }]
			});
		}
		// On up to it on the line it is on, if that goes by it clear and the crane reaches it from there.
		// (a short way: on the line it is on, which may be at the edge of the road)
		const lined = off >= clearance(track, car) - 0.2 && off <= REACH - 1.5;
		if (lined && fwd >= 2 && fwd <= SHORT_HOP && clearLine(a, s, ws, lying, car)) {
			out.push({
				time: forward(fwd + LEAD, loaded),
				end: { s: ws + LEAD, a },
				segments: [
					{
						back: false,
						keys: [
							[s, a],
							[ws + LEAD, a]
						]
					}
				]
			});
		}
		// Or on up to just behind it, near enough in line with it for the crane to reach out ahead to it.
		const short = ws - BEHIND;
		if (
			fwd <= SHORT_HOP &&
			short - s >= 1 &&
			off <= BEHIND_SIDE &&
			clearLine(a, s, short, lying, car)
		) {
			out.push({
				time: forward(short - s, loaded) + AWKWARD,
				end: { s: short, a },
				segments: [
					{
						back: false,
						keys: [
							[s, a],
							[short, a]
						]
					}
				]
			});
		}
		if (!backing || fwd <= 0 || fwd >= n / 2) return out;
		const stop = ws + LEAD;
		// Too near to get across to it and straighten up: across before it
		// gets there, on past it, and straight back to it.
		if (s + sharp + BUMPER + NOSE + 1 <= ws) {
			const past = Math.max(stop + 3, s + sharp + STRAIGHT_ON);
			if (past - stop <= MAX_BACK && clearLine(side, ws, past, lying, car)) {
				out.push({
					time: forward(past - s, loaded) + backward(past - stop),
					end: { s: stop, a: side },
					segments: [
						{
							back: false,
							keys: [
								[s, a],
								[s + sharp, side],
								[past, side]
							]
						},
						{
							back: true,
							keys: [
								[past, side],
								[stop, side]
							]
						}
					]
				});
			}
		}
		// Or on past it on the line it is on, if that goes by it clear, and
		// back to it, across as it backs up once all of it is past it.
		if (off >= clearance(track, car) - 0.2) {
			const tail = ws + TAIL;
			const past = tail + sharp + 2;
			if (
				past - stop <= MAX_BACK &&
				clearLine(a, s, past, lying, car) &&
				clearLine(side, ws, tail, lying, car)
			) {
				out.push({
					time: forward(past - s, loaded) + backward(past - stop),
					end: { s: stop, a: side },
					segments: [
						{
							back: false,
							keys: [
								[s, a],
								[past, a]
							]
						},
						{
							back: true,
							keys: [
								[past, a],
								[tail, side],
								[stop, side]
							]
						}
					]
				});
			}
		}
		return out;
	}

	/** The ways that start by backing up the track, from `s` across at `a`. */
	function backwards(s: number, a: number, car: Car, lying: Car[], loaded: boolean) {
		// Backing round a bend, its front swings out: pulling up on the other
		// side of the wreck may keep it on the tarmac where the usual side
		// would not.
		const usual = beside(track, car);
		const other = clamp(2 * car.across - usual, -EDGE, EDGE);
		const sides = [usual];
		if (Math.abs(other - car.across) >= clearance(track, car) - 0.2) sides.push(other);
		return sides.flatMap((side) => backTo(s, a, car, lying, loaded, side));
	}

	/** The ways that start by backing up the track, to pull up beside the wreck across at `side`. */
	function backTo(s: number, a: number, car: Car, lying: Car[], loaded: boolean, side: number) {
		const out: Leg[] = [];
		const off = Math.abs(a - car.across);
		const clear = off >= clearance(track, car) - 0.2;
		const over = Math.abs(side - a);
		const gentle = clamp(over * 4, 2, DRIFT);
		const sharp = clamp(over * 3, 3, DRIFT);
		const fwd = ahead(s, car.sample);
		const behind = n - fwd;
		if (behind < n / 2) {
			const wb = s - behind;
			const stop = wb + LEAD;
			// straight back to it on the line it is on, if that goes by it clear and the crane reaches it from there
			if (
				clear &&
				off <= REACH - 1.5 &&
				s - stop >= 2 &&
				s - stop <= MAX_BACK &&
				clearLine(a, wb - TAIL, s, lying, car)
			) {
				out.push({
					time: backward(s - stop),
					end: { s: stop, a },
					segments: [
						{
							back: true,
							keys: [
								[s, a],
								[stop, a]
							]
						}
					]
				});
			}
			// back to it, getting across to the side it pulls up on before its tail is there
			const tail = wb + TAIL;
			if (
				s - tail >= sharp &&
				s - stop <= MAX_BACK &&
				clearLine(side, wb - TAIL, tail, lying, car)
			) {
				const keys: Key[] = [[s, a]];
				if (s - tail > sharp + 0.5) keys.push([tail + sharp, a]);
				keys.push([tail, side], [stop, side]);
				out.push({
					time: backward(s - stop),
					end: { s: stop, a: side },
					segments: [{ back: true, keys }]
				});
			} else if (s - tail < sharp) {
				// too near to get across before its tail is there: on a little first, then back and across
				const on = tail + sharp + 1;
				if (
					on - s <= 20 &&
					on - stop <= MAX_BACK &&
					clearLine(a, s, on + BUMPER, lying, car) &&
					clearLine(side, wb - TAIL, tail, lying, car)
				) {
					out.push({
						time: forward(on - s, loaded) + backward(on - stop),
						end: { s: stop, a: side },
						segments: [
							{
								back: false,
								keys: [
									[s, a],
									[on, a]
								]
							},
							{
								back: true,
								keys: [
									[on, a],
									[tail, side],
									[stop, side]
								]
							}
						]
					});
				}
			}
		}
		// Back far enough to get across to it the usual way, and on to it: one
		// lying just behind, or just ahead and too near to get across to.
		const target = fwd < sharp + STRAIGHT_ON ? s + fwd : behind < n / 2 ? s - behind : null;
		if (target !== null) {
			const back = target - sharp - STRAIGHT_ON - 1;
			// (its body goes back past it, or the wreck is beside it already)
			const passes = target < s + BUMPER + NOSE + 0.5;
			if (
				s - back >= 2 &&
				s - back <= MAX_BACK &&
				(!passes || clear) &&
				clearLine(a, back - TAIL, Math.min(s, target - NOSE - BUMPER), lying, car)
			) {
				const stop = target + LEAD;
				const drift = Math.min(gentle, stop - back - STRAIGHT_ON);
				out.push({
					time: backward(s - back) + forward(stop - back, loaded),
					end: { s: stop, a: side },
					segments: [
						{
							back: true,
							keys: [
								[s, a],
								[back, a]
							]
						},
						{
							back: false,
							keys: [
								[back, a],
								[Math.max(back, stop - STRAIGHT_ON - drift), a],
								[stop - STRAIGHT_ON, side],
								[stop, side]
							]
						}
					]
				});
			}
		}
		return out;
	}

	return {
		/**
		 * The quickest way from a start to a wreck, past the others `lying`,
		 * light or `loaded`, and whether it may back up at all.
		 */
		leg(start: Start, car: Car, lying: Car[], loaded: boolean, backing: boolean): Leg {
			const { s, a, prefix } = start;
			const options = onward(s, a, car, lying, loaded, backing);
			if (prefix) {
				// One lying right where the way out comes onto the track is
				// lifted from the way out, the truck pulling up short of it.
				const fwd = ahead(s, car.sample);
				const short = s + fwd - BEHIND;
				const leaves = prefix.length >= 2 ? prefix[prefix.length - 2][0] : s - lane.ramp;
				if (fwd < n / 2 && short < s + 1 && short > leaves + 4) {
					const t = (short - leaves) / (s - leaves);
					const across = -RING + (a + RING) * t * t * (3 - 2 * t);
					const [px, py] = place(short, across);
					const far = Math.hypot(px - car.x, py - car.y);
					if (far < REACH - 1.7 && far > BUMPER + NOSE) {
						options.push({
							time: PULL_UP + AWKWARD,
							end: { s: short, a: across },
							segments: [{ back: false, keys: [...prefix.slice(0, -1), [short, across]] }]
						});
					}
				}
				// out of the pits, the first part leads on from the way out
				for (const option of options) {
					const [first] = option.segments;
					option.segments[0] = { back: false, keys: [...prefix, ...first.keys.slice(1)] };
				}
				// and it straightens up on the track before it can back up
				if (backing) {
					const on = s + STRAIGHTEN;
					for (const option of backwards(on, a, car, lying, loaded)) {
						option.time += forward(STRAIGHTEN, false);
						option.segments.unshift({ back: false, keys: [...prefix, [on, a]] });
						options.push(option);
					}
				}
			} else if (backing) options.push(...backwards(s, a, car, lying, loaded));
			return options
				.filter((option) => option.segments.every((part) => !part.back || backable(part.keys)))
				.reduce((best, option) => (option.time < best.time ? option : best));
		},
		/** How long a truck loaded and at `s`, across at `a`, takes to be behind the wall in the pits. */
		haul(s: number, a: number) {
			const run = Math.ceil(Math.max(16, Math.sqrt(100 * Math.abs(a - NEARSIDE))));
			const into = s + run + ahead(s + run, lane.entry);
			return forward(into + lane.in1 - lane.in0 + THROUGH - s, true);
		},
		/** Where a truck comes onto the track out of the pits, at the infield side of it. */
		gate: { s: lane.merge, a: NEARSIDE, prefix: [] as Key[] } satisfies Start
	};
}

type Roads = ReturnType<typeof createRoads>;

/**
 * What a truck has to offer the dispatcher: from when, and from where, it
 * could set out for more wrecks, and how many more it has room for; whether
 * it would have its load on and be on the track by then; and when it would
 * have what it has on behind the wall if it were given nothing more. One that
 * sets out from the pits comes out after any other that does; one standing
 * in the yard behind another only after that one (`after`, or -1).
 */
type Offer = {
	t: number;
	start: Start;
	room: number;
	loaded: boolean;
	backing: boolean;
	/** Whether a trip from here goes on from what it is doing, rather than starting again from the pits. */
	onTrack: boolean;
	/** When what it has on now is off the track, if it is given nothing more; 0 for nothing. */
	alone: number;
	after: number;
};

/**
 * What the trucks share: the wrecks waiting for a truck to set out for
 * them, which spot in the yard each truck has (as the sample its front axle
 * is level with there, or null), and where they all are, so they keep out of
 * each other's way.
 */
type Yard = {
	claims: (number | null)[];
	/** Each truck whose spot another has taken on its way home, which is to go for the one it was left. */
	respot: boolean[];
	trucks: Truck[];
	pending: Car[];
	/** The wrecks lying where they stopped: waiting, or set out for. */
	lying(): Car[];
	/** Takes a wreck off the waiting list for a truck that is setting out for it. */
	commit(car: Car): void;
	/** Shares the wrecks waiting out between the trucks afresh. */
	replan(): void;
};

/** The crews: share the wrecks out between the trucks, and step them all. */
export function createRecovery(world: World, cars: Car[], track: Track) {
	const lane = pitsFor(track);
	const roads = createRoads(track);
	const { ahead } = serviceFor(track);
	const pending: Car[] = [];
	let now = 0;
	let planned = -Infinity;
	let dirty = false;
	const yard: Yard = {
		claims: lane.stands.map((stand) => stand.front),
		respot: lane.stands.map(() => false),
		trucks: [],
		pending,
		lying: () => [...pending, ...crews.flatMap((crew) => (crew.target ? [crew.target] : []))],
		commit(car) {
			const at = pending.indexOf(car);
			if (at >= 0) pending.splice(at, 1);
			for (const crew of crews) crew.drop(car);
			dirty = true;
		},
		replan: () => replan()
	};
	const crews = lane.stands.map((_, index) => createTruck(world, cars, track, index, yard, roads));
	yard.trucks = crews.map((crew) => crew.truck);
	/** To a driver each truck out on the track is one more wreck to go round, at either end of it. */
	const onTrack: Marker[] = [];

	/**
	 * Shares the waiting wrecks out between the trucks: of every way of doing
	 * it, each truck taking no more than it has room for and in the best order
	 * for it, the one that has the track clear soonest, and the trucks done
	 * soonest besides. A truck that would come by another at work on the
	 * track waits for it. Each wreck taken off the truck that had it costs a
	 * little, so the plan does not change for nothing.
	 */
	function replan() {
		planned = now;
		dirty = false;
		const wrecks = pending.slice();
		if (!wrecks.length) {
			for (const crew of crews) crew.assign([], now);
			return;
		}
		const lying = yard.lying();
		const offers = crews.map((crew) => crew.offer(now));
		const firsts = offers.map((offer) =>
			wrecks.map((car) => roads.leg(offer.start, car, lying, offer.loaded, offer.backing))
		);
		const ends = wrecks.map((car) => ({ s: car.sample + LEAD, a: beside(track, car) }));
		const pairs = ends.map((end, j) =>
			wrecks.map((car, k) => (j === k ? null : roads.leg(end, car, lying, true, true)))
		);
		const finish = ends.map((end) => roads.haul(end.s, end.a));
		const had = wrecks.map((car) => crews.findIndex((crew) => crew.plan.includes(car)));

		/** Each truck's possible trips: the wrecks it takes, in order. */
		const trips = offers.map((offer) => {
			const out: number[][] = [[]];
			const grow = (trip: number[]) => {
				if (trip.length >= offer.room) return;
				for (let k = 0; k < wrecks.length; k++) {
					if (trip.includes(k)) continue;
					out.push([...trip, k]);
					grow([...trip, k]);
				}
			};
			grow([]);
			return out;
		});

		type Work = { p: number; t0: number; t1: number };
		type Run = { s0: number; s1: number; t0: number; t1: number };
		/** When a truck setting out at `t0` on a trip has it done, and where and when it is at work and on the move. */
		function timeline(i: number, trip: number[], t0: number) {
			const offer = offers[i];
			const works: Work[] = [];
			const runs: Run[] = [];
			let t = t0;
			let from = offer.start.s;
			trip.forEach((k, place) => {
				const leg = place === 0 ? firsts[i][k] : pairs[trip[place - 1]][k]!;
				runs.push({ s0: from, s1: leg.end.s, t0: t, t1: t + leg.time });
				t += leg.time;
				works.push({ p: leg.end.s, t0: t, t1: t + LIFT });
				t += LIFT;
				from = leg.end.s;
			});
			const done = t + finish[trip[trip.length - 1]];
			return { done: offer.onTrack ? done : Math.max(done, offer.alone), works, runs };
		}

		let best = Infinity;
		let chosen: number[][] = crews.map(() => []);
		const pick: number[][] = [];
		const search = (i: number, used: Set<number>) => {
			if (i === crews.length) {
				const cost = evaluate(pick, used.size);
				if (cost < best) [best, chosen] = [cost, pick.map((trip) => trip.slice())];
				return;
			}
			for (const trip of trips[i]) {
				if (trip.some((k) => used.has(k))) continue;
				pick[i] = trip;
				for (const k of trip) used.add(k);
				search(i + 1, used);
				for (const k of trip) used.delete(k);
			}
		};
		function evaluate(pick: number[][], taken: number) {
			// out of the pits one at a time, the soonest first, and one standing behind another after it
			const set = offers.map((offer) => offer.t);
			for (let i = 0; i < crews.length; i++) {
				const { after } = offers[i];
				if (pick[i].length && after >= 0 && !pick[after].length) return Infinity;
			}
			const out = crews
				.map((_, i) => i)
				.filter((i) => pick[i].length && !offers[i].onTrack)
				.sort((a, b) => offers[a].t - offers[b].t || offers[a].after - offers[b].after);
			for (let k = 1; k < out.length; k++) {
				set[out[k]] = Math.max(set[out[k]], set[out[k - 1]] + EXIT_GAP);
			}
			const lines = pick.map((trip, i) => (trip.length ? timeline(i, trip, set[i]) : null));
			const done = lines.map((line, i) => line?.done ?? offers[i].alone);
			// one that comes up behind another at work on the track waits for it
			lines.forEach((line, j) => {
				if (!line) return;
				let wait = 0;
				lines.forEach((other, i) => {
					if (i === j || !other) return;
					for (const run of line.runs) {
						const far = run.s1 - run.s0;
						if (far <= 0) continue;
						for (const work of other.works) {
							const to = ahead(run.s0, work.p - STAND_OFF / track.step);
							if (to >= far) continue;
							const there = run.t0 + ((run.t1 - run.t0) * to) / far;
							if (there < work.t1 && there > work.t0 - 2) wait = Math.max(wait, work.t1 - there);
						}
					}
				});
				done[j] += wait;
			});
			let moved = 0;
			pick.forEach((trip, i) => {
				for (const k of trip) if (had[k] >= 0 && had[k] !== i) moved++;
			});
			for (let k = 0; k < wrecks.length; k++) {
				if (had[k] >= 0 && !pick.some((trip) => trip.includes(k))) moved++;
			}
			const total = done.reduce((a, b) => a + b, 0);
			// (a wreck left waiting costs more than any way of fetching it: the
			// times here are race times, which late in a long race are large)
			return Math.max(...done) + total / 4 + LEFT * (wrecks.length - taken) + KEEP * moved;
		}
		search(0, new Set());
		crews.forEach((crew, i) =>
			crew.assign(
				chosen[i].map((k) => wrecks[k]),
				now
			)
		);
	}

	return {
		trucks: crews.map((crew) => crew.truck),
		/** Whether the track is clear: no wreck waiting, and none on a truck still on it. */
		get clear() {
			return pending.length === 0 && crews.every((crew) => crew.clear);
		},
		/** Whether every wreck is on its way off: none waiting, and none still lying where it stopped. The last may be on a truck still on the track. */
		get away() {
			return pending.length === 0 && crews.every((crew) => !crew.target);
		},
		/** The trucks out on the track, each as a marker at either end of it, for the cars to go round: as of the last `sync`. */
		onTrack,
		/** Whether a wreck has a truck stopped beside it to lift it: the drivers go round the two of them as one, by the truck's markers. */
		covers: (car: Car) => crews.some((crew) => crew.lifting === car),
		/** Sends for a wreck: it is fitted in with the rest, on whichever truck gets it off the track soonest. */
		call(car: Car, time: number) {
			now = time;
			if (!pending.includes(car)) pending.push(car);
			dirty = true;
		},
		/** One step of every job. Call before the world is stepped. */
		step(time: number, dt: number) {
			now = time;
			if (dirty || (pending.length && time - planned >= REPLAN)) replan();
			for (const crew of crews) crew.step(time, dt);
		},
		/** Reads where the trucks have got to. Call after the world is stepped. */
		sync() {
			onTrack.length = 0;
			for (const crew of crews) {
				crew.sync();
				crew.mark(onTrack);
			}
		},
		/** Where a truck coming back to the yard now would stand: for tests. */
		spotFor: (index: number) => crews[index].spotFor(true)
	};
}

function createTruck(
	world: World,
	cars: Car[],
	track: Track,
	index: number,
	yard: Yard,
	roads: Roads
) {
	const { n, step: spacing } = track;
	const { ahead, drive, route } = serviceFor(track);
	const lane = pitsFor(track);
	/** A sample as the lane counts them, on from where the way in starts. */
	const inLane = (sample: number) => lane.in0 + ahead(lane.in0, sample);
	const mod = (sample: number) => ((Math.round(sample) % n) + n) % n;
	/** Where in the yard the truck stands, or is on its way to stand. */
	let home = lane.stands[index];
	const spots = new Map<number, typeof home>();
	/** Whether it is pulling out of its spot in the yard, which is kept for it until it is clear. */
	let vacating = false;
	/** Whether it is only moving up the yard. */
	let shuffling = false;
	const exit = (((lane.leave - HOLD) % n) + n) % n;
	const body = world.createBody({
		type: 'dynamic',
		position: { x: home.x, y: home.y },
		angle: home.angle,
		allowSleep: false,
		userData: 'truck'
	});
	body.createFixture({
		shape: new PolygonShape(
			[
				[1, 1],
				[-1, 1],
				[-1, -1],
				[1, -1]
			].map(([fore, side]) => ({ x: fore * TRUCK.long, y: side * TRUCK.wide }))
		),
		friction: 0.3,
		restitution: 0.1,
		filterMaskBits: 0xffff & ~WALLS & ~TOWED
	});
	// a box, as heavy as the truck and its load, all of it about its middle
	body.setMassData({
		mass: MASS,
		center: { x: 0, y: 0 },
		I: (MASS * ((2 * TRUCK.long) ** 2 + (2 * TRUCK.wide) ** 2)) / 12
	});

	const truck = {
		x: home.x,
		y: home.y,
		angle: home.angle,
		/** Forward speed, m/s: less than nothing backing up. */
		speed: 0,
		/** How far its front wheels are turned, towards its left positive. */
		steer: 0,
		/** Out on a job, lights going, rather than standing in the yard. */
		busy: false,
		/** The car on the crane, as an index into the race's cars, or -1. */
		towing: -1,
		/** The cars on the bed, by their places on it (TRUCK.bed), as indices into the race's cars: -1 where there is room. */
		load: TRUCK.bed.map(() => -1),
		crane: { ...STOWED },
		/** Backing up, how much further it has to go (m); 0 otherwise. */
		backLeft: 0,
		/** Where on the lap the axle it is steered by is, as a car's place is kept. */
		sample: mod(home.front),
		across: home.across,
		/** Whether it has a car on board, on the bed or on the crane. */
		get towed(): boolean {
			return this.towing >= 0 || this.load.some((car) => car >= 0);
		},
		/** What it is doing: standing, going out, held at the end of the lane, on its way to a wreck or backing up to one, lifting one, taking them in, putting one in its box, or going back. */
		get doing() {
			return stage === 'approach' && backing ? 'reverse' : stage;
		},
		/** On its way to a wreck or at work on one. */
		get fetching(): boolean {
			return stage === 'out' || stage === 'held' || stage === 'approach' || stage === 'lift';
		},
		/** Whether a car on its wheels, wrecked or not, is up against it, which may have nudged it. */
		get touched(): boolean {
			return against(() => true);
		}
	};
	/**
	 * The front of the truck, as the drivers see it: where the truck is, but
	 * for one stopped beside a wreck to lift it, which is the two of them
	 * together, to be gone round as one, the same side all the way by.
	 */
	const nose: Marker = {
		sample: truck.sample,
		across: home.across,
		speed: 0,
		retired: true,
		towed: false,
		wide: 0
	};
	/** The back of the truck, as the drivers see it. */
	const tail: Marker = {
		sample: (truck.sample - Math.round(TRUCK.axle + TRUCK.long) + n) % n,
		across: home.across,
		speed: 0,
		retired: true,
		towed: false,
		wide: 0
	};

	/** The wrecks the dispatcher has given it to fetch, in the order it is to, not yet set out for. */
	let plan: Car[] = [];
	let stage: 'parked' | 'out' | 'held' | 'approach' | 'lift' | 'haul' | 'drop' | 'home' | 'park' =
		'parked';
	/** The wreck being gone for, until it is off the ground. */
	let wreck: Car | null = null;
	/** Where the truck comes out onto the track, which is where it looks for a gap. */
	const gate = (((lane.leave + lane.ramp / 2) % n) + n) % n;
	/** When the truck may leave the yard. */
	let ready = 0;
	/** The time, as of this step. */
	let now = 0;
	/**
	 * The way being driven, how fast each point of it may be passed, how far
	 * along it the axle it is steered by is and how fast it is going. The back
	 * axle is on the way too, behind it; backing up, it is the back axle that
	 * is on the way, and ahead.
	 */
	let way: Route | null = null;
	let caps = new Float64Array(0);
	let gone = 0;
	let at = 0;
	let pace = 0;
	/** The rest of the way to the wreck, after this part of it; whether this part is backed up; and when it should be there, and where. */
	let segments: Segment[] = [];
	let backing = false;
	let due = 0;
	/** Until when it goes for wrecks without backing up, having given up on doing so. */
	let noBackUntil = 0;
	/** Seconds in the crane's step, for the ones that are waits. */
	let timer = 0;
	/** Seconds it has been waiting behind a car on the track, or for something behind it to get out of the way; and with a car up against its front. */
	let waited = 0;
	let pinned = 0;
	/** Hauling: how far along the way the truck and all it carries are through the wall, and the last of it it could still turn off for another wreck. */
	let door = 0;
	let turnOff = 0;
	/**
	 * What the crane is doing, lifting or dropping a car: reaching out to
	 * it, putting the slings on, lifting it, swinging it across, letting it
	 * down, and taking the slings off. With it, the car, the place on the bed
	 * it is going to or coming from, and which way it lies on the crane, as
	 * against the way the truck faces.
	 */
	let job: 'reach' | 'sling' | 'lift' | 'swing' | 'lower' | 'unsling' = 'reach';
	let carried: { car: Car; place: number; lie: number } | null = null;
	/** Which way each car on the bed lies, as against the way the truck faces: 0 or π. */
	const lies = TRUCK.bed.map(() => 0);

	/** Sets a body moving so that the next step leaves it here. */
	function move(body: Car['body'], x: number, y: number, angle: number, dt: number) {
		const from = body.getPosition();
		body.setLinearVelocity({ x: (x - from.x) / dt, y: (y - from.y) / dt });
		body.setAngularVelocity(turn(angle - body.getAngle()) / dt);
	}

	function rest(body: Car['body']) {
		body.setLinearVelocity({ x: 0, y: 0 });
		body.setAngularVelocity(0);
	}

	/** Where the truck is standing, while it stands: a car that knocks it, it is back there the next step. */
	let standing: Pose | null = null;

	/** Whether any car on its wheels, wrecked or not, up against the truck is `one`, by where it touches it. */
	function against(one: (contact: Contact, car: Car) => boolean) {
		for (let edge = body.getContactList(); edge; edge = edge.next) {
			const index = edge.other?.getUserData();
			if (typeof index !== 'number' || !edge.contact.isTouching()) continue;
			if (one(edge.contact, cars[index])) return true;
		}
		return false;
	}

	/**
	 * Whether the truck has bumped into a car still on its wheels, in front of
	 * it, or behind it backing up: it stops at once, rather than drive on over
	 * it or shove it along the road.
	 */
	const bumped = (behind = false) =>
		against((contact, car) => {
			const manifold = contact.getWorldManifold(null);
			if (car.retired || !manifold?.pointCount) return false;
			const fore = body.getLocalPoint(manifold.points[0]).x;
			return behind ? fore < -(TRUCK.long - 2.5) : fore > TRUCK.long - 2.5;
		});

	/** Whether a car can be touched by anything: not while it is up on the crane or the bed. */
	function solid(car: Car, is: boolean) {
		for (let fixture = car.body.getFixtureList(); fixture; fixture = fixture.getNext()) {
			fixture.setSensor(!is);
		}
	}

	/** A point `fore` of the truck's middle and `side` to its left, and the way the truck faces. */
	function on(fore: number, side = 0): Pose {
		const { x, y } = body.getPosition();
		const angle = body.getAngle();
		const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
		return { x: x + cos * fore - sin * side, y: y + sin * fore + cos * side, angle };
	}

	/** Which way the crane points to get its hook over a place, and how far out. */
	function aim(x: number, y: number) {
		const pivot = on(TRUCK.pivot);
		return {
			swing: turn(Math.atan2(y - pivot.y, x - pivot.x) - pivot.angle),
			reach: Math.hypot(x - pivot.x, y - pivot.y)
		};
	}

	/** Where the crane has a place on the bed. */
	const overBed = (place: number) => ({ swing: Math.PI, reach: TRUCK.pivot - TRUCK.bed[place] });

	/** Swings the crane round, and its boom out or in, towards somewhere. Says whether it is there. */
	function slew(to: { swing: number; reach: number }, dt: number) {
		const { crane } = truck;
		const [off, round] = toward(0, turn(to.swing - crane.swing), SLEW * dt);
		crane.swing = turn(crane.swing + off);
		const [reach, out] = toward(crane.reach, Math.min(REACH, to.reach), EXTEND * dt);
		crane.reach = reach;
		return round && out;
	}

	/** Lifts what is on the crane, or lets it down. Says whether it is all the way. */
	function hoist(to: number, dt: number) {
		const [raise, there] = toward(truck.crane.raise, to, HOIST * dt);
		truck.crane.raise = raise;
		return there;
	}

	/** Takes a way to drive, light or loaded. */
	function take(next: Route, loaded: boolean) {
		way = next;
		gone = at = 0;
		door = 0;
		const { count, x, y, along } = next;
		caps = new Float64Array(count);
		for (let k = 0; k + 1 < count; k++) {
			// in the pits no faster than the cars go there; on the track, as fast as it can with what it has on
			const pits = next.across[k] <= -RING + 0.5;
			caps[k] = pits ? LANE_PACE : loaded ? 18 : 28;
			// No faster round a bend than the truck can hold, less with cars
			// on. It is taken gently where it is tight and the truck has to
			// swing right round, and more briskly where it is only a curve.
			const [a, b] = [Math.max(0, k - 3), Math.min(count - 1, k + 3)];
			const [cross, sides] = triangle(x[a], y[a], x[k], y[k], x[b], y[b]);
			const bend = sides ? Math.abs(2 * cross) / sides : 0;
			const hold = clamp(7 + (1 / Math.max(bend, 1e-3) - 10) * 0.4, 7, 14) * (loaded ? 0.8 : 1);
			if (bend > 1e-3) caps[k] = Math.min(caps[k], Math.sqrt(hold / bend));
			// Nor faster into a bend, or out of one, than the wheel can be
			// turned to take it: the more it has to be turned for each metre,
			// the slower.
			const wheel = (at: number) => Math.atan(WHEELBASE * bendAt(at));
			const [c, d] = [Math.max(0, k - 2), Math.min(count - 1, k + 2)];
			const turning = Math.abs(wheel(d) - wheel(c)) / Math.max(along[d] - along[c], 1e-3);
			if (turning > 1e-3) caps[k] = Math.min(caps[k], TRUCK.steering / turning);
		}
		// slowing in time for each bend, and for the stop at the end
		for (let k = count - 2; k >= 0; k--) {
			caps[k] = Math.min(
				caps[k],
				Math.sqrt(caps[k + 1] ** 2 + 2 * BRAKE * (along[k + 1] - along[k]))
			);
		}
	}

	/**
	 * Takes a way to back up along: through `keys` as the front axle goes,
	 * which the back axles, going first, follow that far behind.
	 */
	function takeBack(keys: Key[]) {
		const behind = (TRUCK.axle - TRUCK.rear) / spacing;
		const forwards = route(keys.map(([s, a]) => [s - behind, a] as Key).reverse());
		const { count } = forwards;
		const back: Route = {
			count,
			x: forwards.x.slice().reverse(),
			y: forwards.y.slice().reverse(),
			sample: forwards.sample.slice().reverse(),
			across: forwards.across.slice().reverse(),
			along: new Float64Array(count),
			length: 0
		};
		for (let k = 1; k < count; k++) {
			back.along[k] =
				back.along[k - 1] + Math.hypot(back.x[k] - back.x[k - 1], back.y[k] - back.y[k - 1]);
		}
		back.length = back.along[count - 1];
		way = back;
		caps = new Float64Array(count).fill(BACK_PACE);
		gone = at = 0;
		pace = 0;
	}

	/**
	 * Where on the way, as far along it as the truck has got or a little on,
	 * a place is nearest: how far along, and how far to the left of it.
	 */
	function onWay(px: number, py: number): [number, number] {
		const { count, x, y, along } = way!;
		let best = Infinity;
		let found: [number, number] = [gone, 0];
		for (let k = Math.max(0, at - 2); k < Math.min(count - 1, at + 40); k++) {
			const [dx, dy] = [x[k + 1] - x[k], y[k + 1] - y[k]];
			const span = Math.hypot(dx, dy) || 1;
			const t = clamp(((px - x[k]) * dx + (py - y[k]) * dy) / span ** 2, 0, 1);
			const [ex, ey] = [px - x[k] - dx * t, py - y[k] - dy * t];
			const off = Math.hypot(ex, ey);
			if (off < best) {
				best = off;
				found = [along[k] + span * t, (dx * ey - dy * ex) / span];
			}
		}
		return found;
	}

	/** How sharply the way bends at a point of it, towards the left positive, as one over the radius. */
	function bendAt(k: number) {
		const { count, x, y } = way!;
		const [a, b] = [Math.max(0, k - 3), Math.min(count - 1, k + 3)];
		const [cross, sides] = triangle(x[a], y[a], x[k], y[k], x[b], y[b]);
		return sides ? (2 * cross) / sides : 0;
	}

	/**
	 * How far to the left of the way the point the truck is steered by is
	 * steered. Round a bend the back axles cut inside the way that point
	 * takes, and the front of the truck swings outside it: it is steered a
	 * little outside it, so that the one is as far inside as the other is
	 * outside. Out on the track, on a way that keeps to the tarmac, it is
	 * steered further over if it must be to keep all its tyres on it too.
	 */
	function wide(k: number) {
		const { count, across } = way!;
		// the bend the whole of the truck is in, its back as well as its front
		let bend = 0;
		for (let j = Math.max(0, k - 8); j <= Math.min(count - 1, k + 2); j++) {
			const here = bendAt(j);
			if (Math.abs(here) > Math.abs(bend)) bend = here;
		}
		const inside = (GUIDE ** 2 * Math.abs(bend)) / 2;
		const outside = (((FRONT - TRUCK.rear) ** 2 - GUIDE ** 2) * Math.abs(bend)) / 2;
		const even = ((outside - inside) / 2) * Math.sign(bend);
		if (Math.abs(across[k]) > KERBSIDE + 0.1) return even;
		// as across the track counts, which may be the other way from the way's left
		const sample = way!.sample[k];
		const ahead = heading(way!.along[k]);
		const flip =
			Math.sign(track.nx[sample] * -Math.sin(ahead) + track.ny[sample] * Math.cos(ahead)) || 1;
		const towards = Math.sign(bend) * flip;
		const inner = across[k] + towards * (inside + TRUCK_HALF);
		const outer = across[k] - towards * (outside + TRUCK_HALF);
		const [low, high] = [-ROADSIDE - Math.min(inner, outer), ROADSIDE - Math.max(inner, outer)];
		const shift = low <= high ? clamp(even * flip, low, high) : (low + high) / 2;
		return shift * flip;
	}

	/** Where the way is, `far` metres along it, or on past its end the way it runs there. */
	function wayAt(far: number): [number, number] {
		const { count, x, y, along, length } = way!;
		if (far > length) {
			const [dx, dy] = [x[count - 1] - x[count - 2], y[count - 1] - y[count - 2]];
			const span = Math.hypot(dx, dy) || 1;
			const over = far - length;
			return [x[count - 1] + (dx / span) * over, y[count - 1] + (dy / span) * over];
		}
		let k = Math.min(at, count - 2);
		while (k + 2 < count && along[k + 1] <= far) k++;
		const t = clamp((far - along[k]) / (along[k + 1] - along[k] || 1), 0, 1);
		return [x[k] + (x[k + 1] - x[k]) * t, y[k] + (y[k + 1] - y[k]) * t];
	}

	/** Which way the way runs, `far` metres along it. */
	function heading(far: number) {
		const { count, x, y, along } = way!;
		let k = Math.min(at, count - 2);
		while (k + 2 < count && along[k + 1] <= far) k++;
		return Math.atan2(y[k + 1] - y[k], x[k + 1] - x[k]);
	}

	/**
	 * Steers the truck `travel` metres on, as a truck goes: its front wheels
	 * turned towards `wheel`, as far as they go and as fast as they turn, and
	 * the truck going round about the middle of its back axles, the tighter
	 * the further they are turned. Backwards, for less than nothing.
	 */
	function roll(travel: number, wheel: number, dt: number) {
		const [steer] = toward(truck.steer, clamp(wheel, -TRUCK.lock, TRUCK.lock), TRUCK.steering * dt);
		truck.steer = steer;
		const { x, y } = body.getPosition();
		const angle = body.getAngle();
		const [rx, ry] = [x + Math.cos(angle) * TRUCK.rear, y + Math.sin(angle) * TRUCK.rear];
		const turned = (travel * Math.tan(steer)) / WHEELBASE;
		const [mid, next] = [angle + turned / 2, angle + turned];
		const [bx, by] = [rx + Math.cos(mid) * travel, ry + Math.sin(mid) * travel];
		const [cx, cy] = [bx - Math.cos(next) * TRUCK.rear, by - Math.sin(next) * TRUCK.rear];
		move(body, cx, cy, next, dt);
		return { x: cx, y: cy, angle: next };
	}

	/**
	 * How far along the way its front axle first comes to a sample, counted on
	 * from `from`, where the way starts, past the line without starting again:
	 * on a way that goes most of a lap, or more, a sample just past where it
	 * starts may be a lap on.
	 */
	function reach(sample: number, from: number) {
		const { count, along } = way!;
		let far = 0;
		for (let k = 1; k < count; k++) {
			const step = ahead(way!.sample[k - 1], way!.sample[k]);
			if (step < n / 2) far += step;
			if (far >= sample - from) return along[k];
		}
		return way!.length;
	}

	/** Drives on along the way, no faster than `limit`. Says whether that was the end of it. */
	function advance(dt: number, limit = Infinity, pull = PULL) {
		const { count, along, length } = way!;
		while (at + 2 < count && along[at + 1] <= gone) at++;
		const t = clamp((gone - along[at]) / (along[at + 1] - along[at] || 1), 0, 1);
		// never so slow that the last of the way is not covered
		const cap = Math.min(limit, Math.max(0.6, caps[at] + (caps[at + 1] - caps[at]) * t));
		pace += clamp(cap - pace, -1.5 * BRAKE * dt, pull * dt);
		// (edging past a car that will not move, it may push it; and one up
		// against its front that has not moved for as long as it would wait
		// for one, it edges on past too, or the two of them would wait for
		// each other for good)
		if (pace > 0 && bumped()) {
			pinned += dt;
			pace = limit > NUDGE && pinned < FORBEARANCE ? 0 : Math.min(pace, NUDGE);
		} else pinned = 0;
		// The point it is steered by is taken along the way, and back onto it
		// if it is off it: the wheel is turned for whichever way that is to go,
		// a little way on, and the truck goes round to it as fast as it does.
		const angle = body.getAngle();
		const guide = on(TRUCK.axle);
		const [, off] = onWay(guide.x, guide.y);
		const lookTo = Math.min(length, gone + clamp(pace * LOOK, 0.2, 1.5));
		const wanted = heading(lookTo) - Math.atan2(HOLD_LINE * (off - wide(at)), Math.max(pace, 2));
		const swing = clamp(turn(wanted - angle), -1.2, 1.2);
		const wheel = Math.atan((WHEELBASE * Math.tan(swing)) / GUIDE);
		// (the point steered by goes faster than the back axles, the more so the tighter it turns)
		const slip = Math.atan((GUIDE * Math.tan(truck.steer)) / WHEELBASE);
		const pose = roll(pace * Math.cos(slip) * dt, wheel, dt);
		const [cos, sin] = [Math.cos(pose.angle), Math.sin(pose.angle)];
		const [far] = onWay(pose.x + cos * TRUCK.axle, pose.y + sin * TRUCK.axle);
		gone = Math.max(gone, Math.min(length, far));
		const arrived = length - gone < 0.05;
		if (arrived) {
			gone = length;
			pace = 0;
		}
		truck.speed = pace;
		while (at + 2 < count && along[at + 1] <= gone) at++;
		const reached = arrived ? count - 1 : at;
		truck.sample = way!.sample[reached];
		truck.across = way!.across[reached];
		return arrived;
	}

	/**
	 * Backs up along the way, no faster than `limit`: the back axles, which
	 * go first, are steered for a point a little way on along it behind
	 * them. Says whether that was the end of it.
	 */
	function backUp(dt: number, limit: number) {
		const { count, along, length } = way!;
		while (at + 2 < count && along[at + 1] <= gone) at++;
		const left = length - gone;
		const cap = Math.min(limit, BACK_PACE, Math.sqrt(2 * BACK_BRAKE * left) + 0.3);
		pace += clamp(cap - pace, -1.5 * BACK_BRAKE * dt, BACK_PULL * dt);
		if (pace > 0 && bumped(true)) pace = 0;
		const rear = on(TRUCK.rear);
		const [tx, ty] = wayAt(gone + BACK_LOOK);
		const going = rear.angle + Math.PI;
		const off = turn(Math.atan2(ty - rear.y, tx - rear.x) - going);
		const look = Math.max(BACK_LOOK * 0.6, Math.hypot(tx - rear.x, ty - rear.y));
		const wheel = Math.atan((-2 * Math.sin(off) * WHEELBASE) / look);
		const pose = roll(-pace * dt, wheel, dt);
		const [cos, sin] = [Math.cos(pose.angle), Math.sin(pose.angle)];
		const [far] = onWay(pose.x + cos * TRUCK.rear, pose.y + sin * TRUCK.rear);
		gone = Math.max(gone, Math.min(length, far));
		const arrived = length - gone < 0.05;
		if (arrived) {
			gone = length;
			pace = 0;
		}
		truck.speed = -pace;
		truck.backLeft = length - gone;
		const [fx, fy] = [pose.x + cos * TRUCK.axle, pose.y + sin * TRUCK.axle];
		truck.sample = nearest(track, fx, fy, truck.sample);
		truck.across = lateral(track, fx, fy, truck.sample);
		return arrived;
	}

	/** How many cars the truck has on, or is set to lift. */
	const aboard = () =>
		truck.load.filter((car) => car >= 0).length +
		(wreck ? 1 : 0) +
		(stage === 'lift' && carried ? 1 : 0);

	/** Takes the next wreck of its plan as the one it sets out for, unless it has one. */
	function takeNext() {
		if (wreck || !plan.length) return;
		wreck = plan.shift()!;
		yard.commit(wreck);
	}

	/** Sets off for the next wreck, from wherever the truck is: to the end of the lane, to hold there. */
	function fetch() {
		takeNext();
		// The spot in the yard it is leaving is kept until it is out of the
		// way; one it was only on its way to is given up at once.
		if (stage === 'parked') vacating = true;
		else yard.claims[index] = null;
		const from = truck.sample;
		const hold = from + ahead(from, exit);
		const keys: Key[] = [[from, truck.across]];
		if (hold - from > 20) keys.push([from + 10, -RING]);
		keys.push([hold, -RING]);
		take(drive(on(TRUCK.axle), keys), false);
		backing = false;
		stage = 'out';
	}

	/** Whether the truck, held at the end of the lane, may come out: nobody about to arrive, nobody just gone by. */
	function open() {
		return cars.every(
			(car) =>
				car.retired ||
				// a car in the pits is not coming
				car.lane >= LANE.in ||
				(ahead(car.sample, gate) >= Math.max(20, car.speed * CLEAR_FOR) &&
					ahead(gate, car.sample) >= 12)
		);
	}

	/** Whether the other truck is coming by on the track, or has just gone by, where this one comes out: with wrecks on, as like as not. */
	function passing() {
		return yard.trucks.some(
			(other) =>
				other !== truck &&
				other.across > -HALF_CORRIDOR &&
				(ahead(other.sample, gate) < 60 || ahead(gate, other.sample) < 25)
		);
	}

	/**
	 * Where the truck can start for a wreck from: held at the end of the lane,
	 * where it comes onto the track, at the infield side of it, with the way
	 * out to there; out on the track, where it is.
	 */
	function start(): Start {
		if (stage === 'held') {
			const from = truck.sample;
			const onto = from + HOLD + lane.ramp;
			return {
				s: onto,
				a: NEARSIDE,
				prefix: [
					[from, -RING],
					[from + HOLD, -RING],
					[onto, NEARSIDE]
				]
			};
		}
		const { from, across } = whereOnTrack();
		return { s: from, a: across };
	}

	/** Where on the track the truck's front axle is, as the track counts its samples, and how far across. */
	function whereOnTrack() {
		const front = on(TRUCK.axle);
		const from = nearest(track, front.x, front.y, truck.sample);
		return { front, from, across: lateral(track, front.x, front.y, from) };
	}

	/** Where the wreck the truck is on its way to was when it set out for it. */
	let sighted = { x: 0, y: 0 };

	/** Off to the wreck: the quickest way there from where the truck is, on or back. */
	function approach() {
		takeNext();
		const from = start();
		let leg = roads.leg(from, wreck!, yard.lying(), truck.towed, now >= noBackUntil);
		if (leg.segments.some((part) => part.back && intoAnother(part.keys))) {
			leg = roads.leg(from, wreck!, yard.lying(), truck.towed, false);
		}
		segments = leg.segments.slice();
		due = now + leg.time;
		sighted = wreck!.body.getPosition().clone();
		begin();
	}

	/**
	 * Whether backing up through these keys would take the truck into another
	 * truck on the track behind it. (One further back that comes on up the
	 * track waits for it, further off for each metre it has to back up.)
	 */
	function intoAnother(keys: Key[]) {
		const samples = keys.map(([s]) => s);
		const [lo, hi] = [Math.min(...samples), Math.max(...samples)];
		return yard.trucks.some(
			(other) =>
				other !== truck &&
				other.across > -HALF_CORRIDOR - 1 &&
				ahead(other.sample, hi) < hi - lo + TAIL + 15
		);
	}

	/** On to the next part of the way to the wreck. */
	function begin() {
		const next = segments.shift()!;
		backing = next.back;
		truck.backLeft = 0;
		waited = 0;
		if (backing) takeBack(next.keys);
		else take(drive(on(TRUCK.axle), next.keys), truck.towed);
		stage = 'approach';
	}

	/**
	 * Whether the wreck the truck is on its way to has been knocked well away
	 * from where it was when it set out for it, so that it is worth working
	 * out the way to it again from here.
	 */
	function moved() {
		const { x, y } = wreck!.body.getPosition();
		const room = DRIFT + STRAIGHT_ON + 4 + pace ** 2 / (2 * BRAKE);
		return (
			!backing &&
			!segments.length &&
			truck.across > -HALF_CORRIDOR + 1 &&
			Math.hypot(x - sighted.x, y - sighted.y) > 1.5 &&
			way!.length - gone > room &&
			ahead(truck.sample, wreck!.sample) > room &&
			ahead(truck.sample, wreck!.sample) < n / 2
		);
	}

	/** Whether the crane can reach a wreck from where the truck is. */
	const reachable = (car: Car) => {
		const { x, y } = car.body.getPosition();
		return aim(x, y).reach < REACH - 0.5;
	};

	/** The crane at work where the truck has stopped: lifting a wreck onto the bed, or a car off it into its box. */
	function craneAt(at: 'lift' | 'drop') {
		stage = at;
		truck.backLeft = 0;
		job = 'reach';
		timer = 0;
		backing = false;
		truck.speed = pace = 0;
	}

	/** With a wreck on the bed: on for the next, if there is room for it, and if not, off with them. */
	function onward() {
		if (truck.load.includes(-1)) {
			// one the crane reaches from here is lifted from here, whoever it was for
			const near = yard.pending.find(reachable);
			if (near) {
				wreck = near;
				yard.commit(near);
				return craneAt('lift');
			}
			yard.replan();
			if (plan.length) return approach();
		}
		haul();
	}

	/** The places on the bed with a car on them, in the order the boxes they go to come down the lane. */
	const drops = () =>
		TRUCK.bed
			.map((_, place) => place)
			.filter((place) => truck.load[place] >= 0)
			.sort((a, b) => truck.load[a] - truck.load[b]);

	/** Where in the lane the truck stops to put a car in its box, counted as a way that starts at `into` counts its samples. */
	const besideBox = (car: number, into: number) =>
		Math.round(lane.boxes[car].sample - lane.in0 + into + LEAD);

	/**
	 * Off with the wrecks: on round the lap to the way into the pits, down the
	 * lane, and alongside the first of their boxes.
	 */
	function haul() {
		const { front, from, across } = whereOnTrack();
		// far enough to be back at the kerb without throwing what is on about
		const run = Math.ceil(Math.max(16, Math.sqrt(100 * Math.abs(across - NEARSIDE))));
		const into = from + run + ahead(from + run, lane.entry);
		// how long the way in is, from the track to the lane
		const slip = lane.in1 - lane.in0;
		const box = besideBox(truck.load[drops()[0]], into);
		const keys: Key[] = [
			[from, across],
			[from + run, NEARSIDE],
			[into, NEARSIDE]
		];
		if (box > into + slip + 1) keys.push([into + slip, -RING]);
		keys.push([box, -RING]);
		// it may be standing well askew, having pulled up beside a wreck lying across the road
		take(drive(front, keys, 14), true);
		// the track is clear once the truck is behind the wall
		door = reach(into + slip + THROUGH, from);
		// and it can turn off for another wreck until it is nearly at the way in
		turnOff = reach(into, from) - 20;
		backing = false;
		stage = 'haul';
	}

	/** Hauling, whether it is still out on the track with room for another wreck, and far enough short of the way in to go for it. */
	const diverts = () =>
		stage === 'haul' &&
		truck.load.includes(-1) &&
		truck.across > -HALF_CORRIDOR + 1 &&
		gone < turnOff;

	/** Down the lane, from one box to the next. */
	function onDown() {
		const from = truck.sample;
		const box = besideBox(truck.load[drops()[0]], lane.in0) % n;
		const to = from + ahead(from, box);
		// (one it is already level with, or a whisker past, it puts in from here)
		if (to - from < 1 || to - from > n / 2) return craneAt('drop');
		take(
			drive(on(TRUCK.axle), [
				[from, truck.across],
				[to, -RING]
			]),
			true
		);
		stage = 'haul';
	}

	/**
	 * Where in the yard the truck would stand: as far forward as there is
	 * room for it, clear of the other trucks standing there or on their way
	 * to, and of their spots; and turning in to it off the lane, with room
	 * behind it to do so. If there is nowhere it can turn in to, it goes as
	 * far forward as it fits.
	 */
	function spotFor(turning: boolean) {
		/** The other trucks' middles and how far up the yard they are: where they stand or are going to, and where they are if that is in the yard. */
		const taken: { x: number; y: number; front: number }[] = [];
		yard.trucks.forEach((other, i) => {
			if (i === index) return;
			const claim = yard.claims[i];
			if (claim !== null) taken.push({ ...spotAt(claim), front: claim });
			// standing in the yard or turning into it or out of it
			if (other.across < -RING - 1)
				taken.push({ x: other.x, y: other.y, front: inLane(other.sample) });
		});
		const fits = (front: number, sweeping: boolean) => {
			const here = spotAt(front);
			return taken.every((other) => {
				const apart = Math.hypot(here.x - other.x, here.y - other.y);
				return apart >= YARD_LONG && !(sweeping && other.front < front && apart < SWEEP);
			});
		};
		for (const sweeping of turning ? [true, false] : [false]) {
			for (let front = lane.yard.front; front >= lane.yard.back; front--) {
				if (fits(front, sweeping)) return front;
			}
		}
		return lane.yard.back;
	}

	/** Whether the truck can pull out of its spot in the yard: nothing standing just ahead of it there. */
	function canLeave() {
		return blocker() < 0;
	}

	/** The truck standing in the yard just ahead of this one, in the way of its pulling out, or -1. */
	function blocker() {
		const mine = inLane(truck.sample);
		return yard.trucks.findIndex((other, i) => {
			if (i === index || other.across > -RING - 1 || inLane(other.sample) <= mine) return false;
			return Math.hypot(other.x - truck.x, other.y - truck.y) < YARD_LONG + TURN_IN;
		});
	}

	/** Where a truck stands in the yard with its front axle level with a sample, worked out once for each. */
	function spotAt(front: number) {
		let spot = spots.get(front);
		if (!spot) {
			spot = lane.yard.spot(front);
			spots.set(front, spot);
		}
		return spot;
	}

	/**
	 * Back to the yard: to the spot in it with room for it, out into the lane
	 * and along it, or straight on if the spot is just ahead.
	 */
	function goHome(front = spotFor(true)) {
		// Another truck coming to a spot further up the yard than this one's,
		// that is behind this one in the lane or not yet in it, would have to
		// get by this one standing in its spot: so this one takes that spot,
		// and the other the one this one would have had.
		const here = inLane(truck.sample);
		yard.trucks.forEach((other, i) => {
			const claim = yard.claims[i];
			if (i === index || claim === null || claim <= front || other.doing === 'parked') return;
			if (other.across < -HALF_CORRIDOR && inLane(other.sample) >= here) return;
			yard.claims[i] = front;
			yard.respot[i] = true;
			front = claim;
		});
		yard.claims[index] = front;
		home = lane.yard.spot(front);
		const { sample, across } = truck;
		const to = sample + ahead(sample, mod(front));
		if (to - sample < 1) {
			stage = 'parked';
			return;
		}
		// In line with the spot by the time its back axle is on it. With too
		// little of the lane left for that, it turns in as tightly as it must,
		// and straightens up on the spot as far as there is room left to.
		const straight = Math.ceil(home.front - home.back) + 1;
		const keys: Key[] = [[sample, across]];
		// (moving up the yard, it is on the line already)
		if (Math.abs(across - home.across) > 0.5) {
			const turnIn = clamp(to - sample - straight, 6, TURN_IN);
			const onLine = Math.min(straight, to - sample - turnIn);
			if (to - sample > straight + TURN_IN + 12) keys.push([sample + 9, -RING]);
			if (onLine >= 2) keys.push([to - onLine - turnIn, -RING], [to - onLine, home.across]);
		}
		keys.push([to, home.across]);
		take(drive(on(TRUCK.axle), keys), false);
		backing = false;
		stage = 'home';
	}

	/**
	 * On the track, the truck does not drive into the back of a car that is in
	 * its way: it keeps far enough back from one that is moving to stop if it
	 * has to, and waits for one that is all but stopped, though not for ever,
	 * or one that is stuck there would hold it up for good: then it edges by
	 * at walking pace.
	 */
	function traffic(dt: number) {
		if (truck.across < -HALF_CORRIDOR) return Infinity;
		let limit = Infinity;
		let stopped = false;
		const stopping = pace ** 2 / (2 * BRAKE);
		const look = BUMPER + NOSE + 8 + stopping;
		for (const car of cars) {
			const before = ahead(truck.sample, car.sample);
			// (a car coming out of the pits is in its way as soon as it is on the track)
			const off = car.lane >= LANE.in && !(car.lane === LANE.out && car.across > -HALF_CORRIDOR);
			if (car.retired || off || before === 0 || before > look) continue;
			if (Math.abs(car.across - truck.across) >= TRUCK_HALF + FLANK + 1) continue;
			if (car.speed < 2) {
				// all but stopped: waited for, until it has been waited for long
				// enough, and then edged past, pushing it aside if it has to
				stopped = true;
				if (waited > FORBEARANCE) {
					limit = Math.min(limit, NUDGE);
					continue;
				}
			}
			// (from its front bumper to the back of the car, less a little to spare)
			const room = Math.max(0, before - BUMPER - NOSE - 2);
			const slower = Math.max(0, car.speed - 1);
			limit = Math.min(limit, Math.sqrt(slower ** 2 + 2 * BRAKE * room));
		}
		waited = stopped ? waited + dt : 0;
		// Nor into the other truck, if it comes up behind it: no faster than
		// it is going, from as far back as it takes to slow to that.
		const { x, y, angle } = on(TRUCK.axle);
		for (const other of yard.trucks) {
			if (other === truck) continue;
			const fore = (other.x - x) * Math.cos(angle) + (other.y - y) * Math.sin(angle);
			const side = (other.y - y) * Math.cos(angle) - (other.x - x) * Math.sin(angle);
			if (other.fetching && other.across > -HALF_CORRIDOR) {
				// One that is at a wreck, or about to be, is not gone by at all,
				// wherever across the road it is: it will be swinging its crane
				// across it. This one stands well off until it is done, as far
				// as that is down the track, round a bend or not; and further
				// off one backing up towards it, by as far as it has to go.
				const off = STAND_OFF + stopping + other.backLeft;
				if (ahead(truck.sample, other.sample) * spacing < off) limit = 0;
			} else if (fore > 0 && fore < 18 + stopping && Math.abs(side) < 3.4) {
				limit = Math.min(limit, Math.max(0, other.speed - 1));
			}
		}
		return limit;
	}

	/**
	 * Backing up, the truck waits for a car or the other truck that is just
	 * behind it, rather than back into it: the cars go round a truck backing
	 * up, as they do one that is stopped.
	 */
	function rearTraffic(dt: number) {
		const back = on(-TRUCK.long);
		const [cos, sin] = [Math.cos(back.angle), Math.sin(back.angle)];
		const room = 2.5 + pace ** 2 / (2 * BACK_BRAKE);
		const blocked = (px: number, py: number, wide: number) => {
			const behind = -((px - back.x) * cos + (py - back.y) * sin);
			const side = (py - back.y) * cos - (px - back.x) * sin;
			return behind > -1 && behind < room + NOSE && Math.abs(side) < TRUCK.wide + wide;
		};
		const stuck =
			cars.some(
				(car) => !car.retired && car.lane < LANE.in && blocked(car.x, car.y, FLANK + 0.6)
			) ||
			yard.trucks.some(
				(other) =>
					other !== truck &&
					[0, 0.5, 1].some((t) => {
						const far = 0.5 + t * room;
						return onTruck(other, back.x - cos * far, back.y - sin * far, SHY_TRUCK + 0.5);
					})
			);
		waited = stuck ? waited + dt : 0;
		return stuck ? 0 : Infinity;
	}

	/**
	 * Off the track, the truck does not drive into a car that is in the pits:
	 * one stopped in the lane ahead of it, or standing in a box it has to go
	 * through. It waits for it.
	 */
	function pitTraffic() {
		const { x, y, angle } = on(TRUCK.axle);
		// as far ahead as it would take to stop, and a little more
		const stopping = pace ** 2 / (3 * BRAKE);
		const probe = (far: number) => [x + Math.cos(angle) * far, y + Math.sin(angle) * far];
		// straight ahead, and where the way takes it, but no further than it goes
		const looks = (far: number) =>
			gone + far <= way!.length ? [probe(far), wayAt(gone + far)] : [probe(far)];
		const off = truck.across < -HALF_CORRIDOR;
		for (let far = BUMPER + 0.5; off && far <= BUMPER + 3 + stopping; far += 2.5) {
			// straight ahead, and where the way it is steering along takes it
			for (const [px, py] of looks(far)) {
				for (const car of cars) {
					if (car.lane < LANE.in) continue;
					const at = car.body.getPosition();
					if (Math.hypot(at.x - px, at.y - py) < SHY) return 0;
				}
			}
		}
		// Nor into the other truck, which may be held at the end of the lane
		// ahead of it, putting a car in its box, or standing in the yard ahead
		// of the spot it is pulling up in; nor, on its way in or out, round the
		// bend of the way through the wall. (No further ahead than it must
		// look for this.)
		for (let far = BUMPER + 0.6; far <= BUMPER + 2.6 + stopping; far += 1) {
			// (one standing in the yard just ahead of where it stops is no matter)
			const past = far - BUMPER > way!.length - gone + 0.3;
			// straight ahead, and round the bend the way takes it
			for (const [px, py] of looks(far)) {
				for (const other of yard.trucks) {
					if (other === truck || (past && other.doing === 'parked')) continue;
					if (onTruck(other, px, py, SHY_TRUCK)) return 0;
				}
			}
		}
		return Infinity;
	}

	/** The crane at work: one step of lifting a wreck onto the bed, or a car off it into its box. */
	function work(dt: number) {
		const loading = stage === 'lift';
		if (job === 'reach') {
			if (loading) {
				const { x, y } = wreck!.body.getPosition();
				// a wreck knocked out of reach since the truck pulled up is gone after again
				if (!reachable(wreck!)) return approach();
				if (slew(aim(x, y), dt)) [job, timer] = ['sling', 0];
			} else if (slew(overBed(drops()[0]), dt)) [job, timer] = ['sling', 0];
		} else if (job === 'sling') {
			// (over a wreck that is nudged as the slings go on, the hook follows it)
			if (loading) slew(aim(wreck!.body.getPosition().x, wreck!.body.getPosition().y), dt);
			timer += dt;
			if (timer < SLING) return;
			// The slings are on: from here the car goes where the crane takes it.
			if (loading) {
				const car = wreck!;
				wreck = null;
				car.towed = true;
				car.body.setKinematic();
				solid(car, false);
				for (let fixture = car.body.getFixtureList(); fixture; fixture = fixture.getNext()) {
					fixture.setFilterData({ groupIndex: 0, categoryBits: TOWED, maskBits: 0xffff });
				}
				// it goes on the bed lying whichever way round is the nearer
				const lie = turn(car.body.getAngle() - body.getAngle() - truck.crane.swing);
				carried = { car, place: truck.load.indexOf(-1), lie };
				truck.towing = cars.indexOf(car);
			} else {
				const place = drops()[0];
				const car = cars[truck.load[place]];
				carried = { car, place, lie: turn(lies[place] - truck.crane.swing) };
				truck.towing = truck.load[place];
				truck.load[place] = -1;
			}
			job = 'lift';
		} else if (job === 'lift') {
			if (hoist(1, dt)) job = 'swing';
		} else if (job === 'swing') {
			// Onto the bed, lying along it, or into the box, lying along that:
			// whichever way round is the nearer.
			const { car, place } = carried!;
			const box = loading ? null : lane.boxes[cars.indexOf(car)];
			const to = box ? aim(box.x, box.y) : overBed(place);
			const along = box ? box.angle - body.getAngle() : 0;
			const lie = along + nearerEnd(carried!.lie + truck.crane.swing - along);
			const swung = truck.crane.swing;
			const there = slew(to, dt);
			// The crew turn it as it goes, to lie the way it is to go down, and
			// hold it from turning any faster than that as the crane swings it.
			const swing = turn(truck.crane.swing - swung);
			const wanted = turn(lie - truck.crane.swing - carried!.lie);
			const turned = clamp(wanted, -TWIST * dt - swing, TWIST * dt - swing);
			const straight = Math.abs(wanted - turned) < 1e-9;
			carried!.lie = turn(carried!.lie + turned);
			if (there && straight) job = 'lower';
		} else if (job === 'lower') {
			if (!hoist(0, dt)) return;
			const { car, place, lie } = carried!;
			truck.towing = -1;
			carried = null;
			if (loading) {
				truck.load[place] = cars.indexOf(car);
				lies[place] = nearerEnd(lie + truck.crane.swing);
				return onward();
			}
			// down in its box, where it stays
			const box = lane.boxes[cars.indexOf(car)];
			car.body.setTransform({ x: box.x, y: box.y }, car.body.getAngle());
			rest(car.body);
			solid(car, true);
			[job, timer] = ['unsling', 0];
		} else if (job === 'unsling') {
			timer += dt;
			if (timer < UNSLING) return;
			if (drops().length) return onDown();
			yard.replan();
			if (plan.length) fetch();
			else goHome();
		}
	}

	/**
	 * Takes everything on board along with the truck: each car on the bed
	 * where it lies on it, and the one on the crane under its hook. The
	 * truck's body is not where it is going yet, so this works from where it
	 * is about to be.
	 */
	function carry(dt: number) {
		const speed = body.getLinearVelocity();
		const facing = body.getAngle() + body.getAngularVelocity() * dt;
		const centre = body.getPosition();
		const [cx, cy] = [centre.x + speed.x * dt, centre.y + speed.y * dt];
		const [cos, sin] = [Math.cos(facing), Math.sin(facing)];
		truck.load.forEach((index, place) => {
			if (index < 0) return;
			const fore = TRUCK.bed[place];
			move(cars[index].body, cx + cos * fore, cy + sin * fore, facing + lies[place], dt);
		});
		if (carried) {
			const [hx, hy] = hookOf(cx, cy, facing, truck.crane);
			move(carried.car.body, hx, hy, facing + truck.crane.swing + carried.lie, dt);
		}
	}

	/** How long from `time` it takes to get from a sample in the lane to the end of it and out onto the track. */
	const outFrom = (sample: number, time: number) =>
		time + (ahead(sample, exit) * spacing * 1.2) / LANE_PACE + 2 + 3;

	return {
		truck,

		/** The wreck the truck has stopped beside to lift, still on the ground, or null. */
		get lifting() {
			return stage === 'lift' ? wreck : null;
		},

		/** The wreck the truck has set out for and not yet lifted off the ground, or null. */
		get target() {
			return wreck;
		},

		/** The wrecks the dispatcher has given it to fetch, after the one it has set out for. */
		get plan() {
			return plan;
		},

		/** Gives the truck the wrecks it is to fetch, in order. One standing in the yard leaves a moment later. */
		assign(next: Car[], time: number) {
			if (stage === 'parked' && !plan.length && next.length) ready = time + SCRAMBLE;
			plan = next;
		},

		/** Takes a wreck off its plan: another truck has set out for it. */
		drop(car: Car) {
			plan = plan.filter((other) => other !== car);
		},

		spotFor,

		/** What the truck can offer the dispatcher, as of `time`. */
		offer(time: number): Offer {
			const room = LOAD - aboard();
			const backs = time >= noBackUntil;
			const fromPits = (t: number, alone = 0): Offer => ({
				t,
				start: roads.gate,
				room: LOAD,
				loaded: false,
				backing: backs,
				onTrack: false,
				alone,
				after: -1
			});
			const goingOn = (t: number, s: number, a: number): Offer => ({
				t,
				start: { s, a },
				room,
				loaded: true,
				backing: backs,
				onTrack: true,
				alone: t + roads.haul(s, a),
				after: -1
			});
			if (stage === 'parked') {
				const offer = fromPits(outFrom(truck.sample, Math.max(time + SCRAMBLE, ready)));
				const front = blocker();
				if (front >= 0) {
					if (yard.trucks[front].doing === 'parked') offer.after = front;
					else offer.t += 4;
				}
				return offer;
			}
			if (stage === 'home' || stage === 'park') return fromPits(outFrom(truck.sample, time));
			if (stage === 'out' || stage === 'held') {
				// on its way out for a wreck already: on from that one
				const t = stage === 'out' ? outFrom(truck.sample, time) : time + 2;
				const leg = roads.leg(roads.gate, wreck!, yard.lying(), false, backs);
				return goingOn(t + leg.time + LIFT, leg.end.s, leg.end.a);
			}
			if (stage === 'approach') {
				const end = wreck!.sample + LEAD;
				return goingOn(Math.max(time + 1, due) + LIFT, end, beside(track, wreck!));
			}
			if (stage === 'lift') return goingOn(time + LIFT / 2, truck.sample, truck.across);
			if (diverts()) return goingOn(time + 1, truck.sample + 4, truck.across);
			// on its way in with what it has on, or putting it in the boxes: out again once that is done
			const left = way ? way.length - gone : 0;
			const onTheTrack = stage === 'haul' && gone < door;
			const behindWall = onTheTrack ? time + (door - gone) / LOADED : 0;
			const inLaneAt = time + (onTheTrack ? left / LOADED : left / LANE_PACE);
			const last = drops().length ? lane.boxes[truck.load[drops()[drops().length - 1]]].sample : 0;
			return fromPits(outFrom(last, inLaneAt + drops().length * DROP), behindWall);
		},

		/** Adds where the drivers see the truck, while it is out on the track: one marker at the front of it, and one at the back. */
		mark(into: Marker[]) {
			if (!truck.busy) return;
			if (nose.across > -HALF_CORRIDOR - 1) into.push(nose);
			if (tail.across > -HALF_CORRIDOR - 1) into.push(tail);
		},

		/** Whether this truck leaves the track clear: no wreck it has set out for, and none on board still on it. */
		get clear() {
			return (
				!wreck &&
				!truck.fetching &&
				// on its way in, once it is behind the wall
				!(stage === 'haul' && gone < door)
			);
		},

		/** One step of the job. Call before the world is stepped. */
		step(time: number, dt: number) {
			now = time;
			// its spot taken by the other truck on its way home: on to the one it was left
			if (yard.respot[index]) {
				yard.respot[index] = false;
				if (stage === 'home' || stage === 'park') goHome(yard.claims[index] ?? spotFor(true));
			}
			if (stage === 'parked') {
				if (plan.length && time >= ready && canLeave()) fetch();
				else if (!plan.length) {
					// with room for it further up the yard, it moves up
					const mine = yard.claims[index] ?? inLane(truck.sample);
					const up = spotFor(false);
					if (up > mine + 1.5) {
						goHome(up);
						shuffling = true;
					}
				}
			}
			// a call on the way home is answered from where the truck is
			if ((stage === 'home' || stage === 'park') && plan.length) fetch();
			// and one on the way in, with room for it, from out on the track
			if (diverts() && plan.length) approach();

			// Standing, it is kept where it stopped, however a car knocks it.
			if (stage === 'parked' || stage === 'held' || stage === 'lift' || stage === 'drop') {
				standing ??= on(0);
				move(body, standing.x, standing.y, standing.angle, dt);
			} else standing = null;
			if (stage === 'out') {
				if (advance(dt, pitTraffic())) {
					stage = 'held';
					timer = 0;
					// out of the way of its spot, which is anybody's now
					if (vacating) yard.claims[index] = null;
					vacating = false;
				}
			} else if (stage === 'held') {
				timer += dt;
				const rolling = wreck!.body.getLinearVelocity();
				const speed = Math.hypot(rolling.x, rolling.y);
				// (one still creeping along once it has waited, as a wreck tangled
				// with a car that is dragging it does for as long as it is left,
				// is gone after all the same: lifted, it lets the car go)
				const still = speed < 0.5 || (timer > PATIENCE && speed < CREEPING);
				if (still && timer > 0.3 && !passing() && (open() || timer > PATIENCE)) approach();
			} else if (stage === 'approach') {
				// one knocked on since the truck set out for it is set out for again
				if (moved()) approach();
				const done = backing
					? backUp(dt, rearTraffic(dt))
					: advance(dt, Math.min(traffic(dt), pitTraffic()), truck.towed ? HAUL : PULL);
				if (backing && waited > BACK_PATIENCE) {
					// something behind it that will not shift: on round instead
					noBackUntil = time + 20;
					approach();
				} else if (done) {
					if (segments.length) begin();
					else craneAt('lift');
				} else if (!segments.length && way!.length - gone < READY) {
					// the crane swung round to the wreck as the truck comes up to it
					const { x, y } = wreck!.body.getPosition();
					const { swing } = aim(x, y);
					slew({ swing, reach: STOWED.reach + 1 }, dt);
				} else slew(STOWED, dt);
			} else if (stage === 'lift' || stage === 'drop') {
				work(dt);
			} else if (stage === 'haul') {
				if (advance(dt, Math.min(traffic(dt), pitTraffic()), HAUL)) craneAt('drop');
			} else if (stage === 'home') {
				if (advance(dt, pitTraffic())) stage = 'park';
			} else if (stage === 'park') {
				// The way home ends with its front axle where it should be, but
				// one that turned in off the lane short of its spot has its back
				// still out towards the lane: it is brought round square.
				const { x, y, angle } = home;
				const at = body.getPosition();
				const [dx, dy] = [x - at.x, y - at.y];
				const off = turn(angle - body.getAngle());
				const far = Math.hypot(dx, dy);
				const step = Math.min(1, (SQUARE * dt) / Math.max(far, Math.abs(off) * TRUCK.axle, 1e-9));
				move(body, at.x + dx * step, at.y + dy * step, body.getAngle() + off * step, dt);
				if (step === 1) stage = 'parked';
				[truck.steer] = toward(truck.steer, 0, TRUCK.steering * dt);
			}
			// with nothing to do, the crane is folded away
			if (stage !== 'lift' && stage !== 'drop' && stage !== 'approach') slew(STOWED, dt);

			// moving up the yard is not being out on a job
			if (stage !== 'home' && stage !== 'park') shuffling = false;
			truck.busy = stage !== 'parked' && !shuffling;
			carry(dt);
		},

		/** Reads where the truck has got to. Call after the world is stepped. */
		sync() {
			const { x, y } = body.getPosition();
			truck.x = x;
			truck.y = y;
			truck.angle = body.getAngle();
			// (a truck standing in the yard is nothing to the drivers)
			if (stage === 'parked') return;
			const lifting = stage === 'lift' ? (wreck ?? carried?.car) : null;
			nose.sample = truck.sample;
			nose.across = lifting ? (truck.across + lifting.across) / 2 : truck.across;
			// as wide as the two of them, from the one's middle to the other's, and out to either side
			nose.wide = tail.wide = lifting ? Math.abs(truck.across - lifting.across) / 2 : 0;
			// backing up, it is gone round as one that is stopped is, not waited behind
			const reversing = stage === 'approach' && backing;
			nose.speed = reversing ? 0 : truck.speed;
			nose.towed = !reversing && truck.towed;
			const back = on(-TRUCK.long);
			tail.sample = nearest(track, back.x, back.y, tail.sample);
			// (and the back of it too: the way by is the way by the two of them)
			tail.across = lifting ? nose.across : lateral(track, back.x, back.y, tail.sample);
			tail.speed = nose.speed;
			tail.towed = nose.towed;
		}
	};
}
