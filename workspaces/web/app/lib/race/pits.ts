import { fuelled, planStop, type Plan } from './crew';
import { ROSTER } from './roster';
import { HALF_LANE, RING, TRUCK, curve, serviceFor, type Route } from './service';
import type { Car, Flag, Rules } from './sim';
import { HALF_CORRIDOR, MAX_OFFSET, clamp, type Track, type TrackId } from './track';

// The pits. Beside the start line a lane runs along the infield side of the
// wall, with a way in from the track at one end and a way out at the other.
// On the infield side of it every car has a box with its crew, and past the
// last box, at the end of the lane, the tow trucks stand (recovery.ts): the
// lane is their way onto the track and off it as well. A car burns fuel and
// wears its tyres as it races; its crew decides when it comes in, and what
// for: fuel, tyres or both.
//
// A car called in keeps to the inside and slows for the way in. From there it
// is off the track and no longer driven like a car: it follows a way through
// the wall, down the lane to its box and out again, no faster than the lane's
// speed limit, queueing behind whatever is ahead of it, and nothing can run
// into it. It is let back onto the track when there is a gap to join in.
//
// All of it is placed by track sample, like the rest of the infield
// (service.ts).

/**
 * A box, which is a good deal bigger than a car, with room for its crew to
 * work all round one and for their kit (crew.ts): how far it is from one to
 * the next along the lane, how long and wide one is painted, and how far
 * from its edge on the lane's side the middle of a car standing in it is.
 * The boxes are painted on the same paving as the lane, beside it.
 */
export const BOX = { pitch: 8, long: 7.6, wide: 6.4, front: 2 };
/** There is a box for every car there is, whether it is racing or not. */
const BOXES = ROSTER.length;
/** Where the lane's paving ends and the boxes' begins, across from the centre line. */
export const BOX_EDGE = RING + HALF_LANE + 0.05;
/** Centre line to the middle of a car standing in its box, and to the tow trucks' stands. */
export const BOX_ACROSS = BOX_EDGE + BOX.front;
/** Centre line to the back of the boxes, where the paving ends. */
export const APRON = BOX_EDGE + BOX.wide;
/** Where across the track a car leaves it for the pits, and comes back on. */
const INSIDE = -MAX_OFFSET;
/** How far along the lane it takes a car to turn into its box, and out of it. */
const PULL = 10;
/** How far short of the way in a car may be taken off the track for it (see `far` in createPits). */
const TAKEN = 3;
/** The ways through the pits are worked out at points this far apart, in samples. */
const STEP = 0.5;
/**
 * How long the way out is, from the lane to the track, unless a track's
 * layout takes it further; the way in is as long as each track's layout
 * says. They are slip roads: a car leaves the track at racing speed and does
 * its braking on the way in, and is back up to speed on the way out before
 * it joins.
 */
const RAMP = 24;
/** How hard (m/s², sideways) a car takes a bend on the way out, a good deal short of racing. */
const ROAD_GRIP = 11;
/**
 * The tow trucks' stands, in line with the boxes, one behind the other, and
 * like the boxes a good deal bigger than what stands on them: how far past
 * the middle of the last box the middle of the first is, how far it is from
 * one to the next, how long and wide each is painted, and how far past the
 * last of them the lane ends, which is what a truck needs to steer out into
 * it.
 */
export const STAND = {
	// as close behind the last box as the boxes are to one another, and a little more
	after: BOX.long / 2 + 12.4 / 2 + (BOX.pitch - BOX.long) + 0.4,
	pitch: 12.8,
	long: 12.4,
	wide: 4,
	run: 15
};
/** How many tow trucks there are. */
const TRUCKS = 2;

/** What is done at a stop. */
export type Stop = 'fuel' | 'tyres' | 'both';

/**
 * Where a car is with the pits: racing; called in, and making for the way
 * in; off the track on its way to its box; standing in it; on its way out.
 */
export const LANE = { racing: 0, called: 1, in: 2, box: 3, out: 4 } as const;

export type PitLane = ReturnType<typeof build>;

const built = new Map<TrackId, PitLane>();

/** The pit lane of a track, worked out the first time it is asked for. */
export function pitsFor(track: Track): PitLane {
	let lane = built.get(track.id);
	if (!lane) {
		lane = build(track);
		built.set(track.id, lane);
	}
	return lane;
}

function build(track: Track) {
	const { n } = track;
	const { place } = serviceFor(track);
	const { from, slip, thirst, away, boxes: firstBox, yard: yardAt } = track.pits;
	// Samples here count on past the line without starting again, so the way
	// through is always forwards: in from the track between in0 and in1, past
	// the boxes and the trucks' stand to the end of the lane at out0, on in
	// line with it to leave, and out to the track between there and out1.
	const in0 = from;
	const in1 = in0 + slip;
	// the first box, a car's length and more down the lane, or as far on as the
	// track's layout puts it, where the lane runs round a bend before the boxes
	/** The first sample at or after `after` that is `sample` as the track counts them. */
	const past = (after: number, sample: number) => after + ((((sample - after) % n) + n) % n);
	// the boxes in rows, each from the sample of its first box, one after another
	const rows: [number, number][] = Array.isArray(firstBox)
		? firstBox
		: [[firstBox === undefined ? in1 + PULL : firstBox, BOXES]];
	const first = past(in1, rows[0][0]);
	/** Where in the world a sample, which need not be a whole one, is `across` from the centre line. */
	const at = (sample: number, across: number): [number, number] => {
		const whole = Math.floor(sample);
		const t = sample - whole;
		const [ax, ay] = place(whole, across);
		const [bx, by] = place(whole + 1, across);
		return [ax + (bx - ax) * t, ay + (by - ay) * t];
	};

	/** Something standing at a sample, `across` from the centre line: where its middle is and which way it faces. */
	const standing = (sample: number, across: number) => {
		const [x, y] = at(sample, across);
		const [ax, ay] = at(sample - 1, across);
		const [bx, by] = at(sample + 1, across);
		return { sample, across, x, y, angle: Math.atan2(by - ay, bx - ax) };
	};

	/** A way through each `[sample, across]` in turn, easing across between one and the next. */
	function way(keys: [number, number][]): Route {
		const from = keys[0][0];
		const count = Math.round((keys[keys.length - 1][0] - from) / STEP) + 1;
		const out: Route = {
			count,
			x: new Float64Array(count),
			y: new Float64Array(count),
			sample: new Int32Array(count),
			across: new Float64Array(count),
			along: new Float64Array(count),
			length: 0
		};
		let key = 0;
		for (let k = 0; k < count; k++) {
			const s = from + k * STEP;
			while (key + 2 < keys.length && s >= keys[key + 1][0]) key++;
			const [[s0, a0], [s1, a1]] = [keys[key], keys[key + 1]];
			const t = clamp((s - s0) / Math.max(STEP, s1 - s0), 0, 1);
			out.sample[k] = ((Math.round(s) % n) + n) % n;
			out.across[k] = a0 + (a1 - a0) * t * t * (3 - 2 * t);
			[out.x[k], out.y[k]] = at(s, out.across[k]);
		}
		// the corners taken off, both ends left where they are
		for (let pass = 0; pass < 3; pass++) {
			const [ax, ay] = [out.x.slice(), out.y.slice()];
			for (let k = 1; k + 1 < count; k++) {
				out.x[k] = (ax[k - 1] + 2 * ax[k] + ax[k + 1]) / 4;
				out.y[k] = (ay[k - 1] + 2 * ay[k] + ay[k + 1]) / 4;
			}
		}
		for (let k = 1; k < count; k++) {
			out.along[k] =
				out.along[k - 1] + Math.hypot(out.x[k] - out.x[k - 1], out.y[k] - out.y[k - 1]);
		}
		out.length = out.along[count - 1];
		return out;
	}

	/**
	 * The sample that is `far` metres on from another along the line the
	 * boxes are on, or back from it if `far` is negative. Where the track
	 * bends, a sample is less than a metre there.
	 */
	function on(sample: number, far: number) {
		const [x, y] = at(sample, -BOX_ACROSS);
		let next = sample + far;
		for (let pass = 0; pass < 8; pass++) {
			const [nx, ny] = at(next, -BOX_ACROSS);
			next += Math.sign(far) * (Math.abs(far) - Math.hypot(nx - x, ny - y));
		}
		return next;
	}

	/** Each box: the sample it is level with, where its middle is and which way a car in it faces. */
	const boxes = [standing(first, -BOX_ACROSS)];
	for (const [row, [start, count]] of rows.entries()) {
		for (let k = row ? 0 : 1; k < count && boxes.length < BOXES; k++) {
			const after = boxes[boxes.length - 1].sample;
			const sample = k ? on(after, BOX.pitch) : past(after, start);
			boxes.push(standing(sample, -BOX_ACROSS));
		}
	}
	const last = boxes[BOXES - 1].sample;
	// The trucks' yard: one stretch of paving past the last box, long enough
	// for them all one behind the other, on which a truck stands wherever
	// there is room for it (recovery.ts). It stands with both its axles on the
	// line the boxes are on, its front one level with a whole sample, since a
	// truck's way to it is worked out in whole samples. Where that line bends,
	// as it does on into a turn, the truck stands straight across the bend,
	// between the two. At the start they stand one behind the other from the
	// front of it, the front one being the one nearest the way out.
	const fronts = [
		Math.round(on(yardAt === undefined ? on(last, STAND.after) : past(last, yardAt), TRUCK.axle))
	];
	while (fronts.length < TRUCKS) fronts.unshift(Math.round(on(fronts[0], STAND.pitch)));
	/** A truck standing in the yard with its front axle level with `front`: where its middle is and which way it faces, and the samples its axles are level with. */
	const spot = (front: number) => {
		const back = on(front, -2 * TRUCK.axle);
		const [fx, fy] = at(front, -BOX_ACROSS);
		const [bx, by] = at(back, -BOX_ACROSS);
		return {
			sample: (front + back) / 2,
			across: -BOX_ACROSS,
			x: (fx + bx) / 2,
			y: (fy + by) / 2,
			angle: Math.atan2(fy - by, fx - bx),
			front,
			back
		};
	};
	/** Where the tow trucks stand at the start, the front one first. */
	const stands = fronts.map(spot);
	/** The yard: the furthest back and the furthest forward a truck's front axle is standing in it, and where one stands with it level with a sample between. */
	const yard = { back: fronts[TRUCKS - 1], front: fronts[0], spot };
	const out0 = Math.ceil(fronts[0] + STAND.run);
	const leave = away ? past(out0, away[0]) : out0;
	const out1 = away ? past(leave, away[1]) : out0 + RAMP;
	/** The way out, from the end of the lane: in line with it to where it leaves for the track. */
	const road = (to: number): [number, number][] =>
		leave > out0
			? [
					[out0, -RING],
					[leave, -RING],
					[out1, to]
				]
			: [
					[out0, -RING],
					[out1, to]
				];

	const paths = new Map<
		number,
		{ way: Route; line: number; stop: number; end: number; look: number; fast: Float64Array }
	>();

	/**
	 * How fast each point of a way may be passed (m/s), up to point `upTo`:
	 * what its bends allow at ROAD_GRIP, and slow enough before each to brake
	 * for it. From there on, where it eases out onto the track, it is wide
	 * enough open to be taken at whatever pace a car is joining at.
	 */
	function speeds(way: Route, upTo: number) {
		const fast = new Float64Array(way.count).fill(Infinity);
		const reach = 6;
		for (let k = reach; k + reach < way.count && k <= upTo; k++) {
			const [ax, ay, bx, by, cx, cy] = [-reach, 0, reach].flatMap((d) => [
				way.x[k + d],
				way.y[k + d]
			]);
			const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
			const sides =
				Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay);
			if (cross > 1e-9) fast[k] = Math.sqrt(ROAD_GRIP * (sides / (2 * cross)));
		}
		for (let k = way.count - 2; k >= 0; k--) {
			const ds = way.along[k + 1] - way.along[k];
			fast[k] = Math.min(fast[k], Math.sqrt(fast[k + 1] ** 2 + 2 * BRAKE * ds));
		}
		return fast;
	}

	/**
	 * The way through the pits for the car whose box is `box`: in from the
	 * track, down the lane, into the box and out of it, down the rest of the
	 * lane and out onto the track. `line` is how far along it the lane, and
	 * its speed limit, begins; `stop` how far along the box is; `end` how far
	 * along the lane ends and the way out begins; `look` how far along the
	 * way out leaves for the track, which is where a car waits for a gap to
	 * join in; and `fast`, how fast each point of it may be passed.
	 */
	function path(box: number) {
		let made = paths.get(box);
		if (!made) {
			const { sample } = boxes[box];
			const through = way([
				[in0, INSIDE],
				[in1, -RING],
				[sample - PULL, -RING],
				[sample - 0.5, -BOX_ACROSS],
				[sample + 0.5, -BOX_ACROSS],
				[sample + PULL, -RING],
				...road(INSIDE)
			]);
			made = {
				way: through,
				line: through.along[Math.round((in1 - in0) / STEP)],
				stop: through.along[Math.round((sample - in0) / STEP)],
				end: through.along[Math.round((out0 - in0) / STEP)],
				look: through.along[Math.round((leave - in0) / STEP)],
				fast: speeds(through, Math.round((leave - in0) / STEP))
			};
			paths.set(box, made);
		}
		return made;
	}

	return {
		/** The samples the way in starts and ends at, and the way out, counted on past the line. */
		in0,
		in1,
		out0,
		out1,
		/** Where the way out leaves the line of the lane for the track, and how far it is from there to the track. */
		leave,
		ramp: out1 - leave,
		/** The samples a car leaves the track at and rejoins it at, as the track counts them. */
		entry: ((in0 % n) + n) % n,
		merge: ((out1 % n) + n) % n,
		boxes,
		stands,
		yard,
		path,
		thirst,
		/** The way in through the wall, the lane, and the way out through the wall, to be paved. */
		ways: [
			// (from a little short of the way in, where a car may be let off the track)
			way([
				[in0 - TAKEN, INSIDE - 1],
				[in0, INSIDE - 1],
				[in1, -RING]
			]),
			way([
				[in1, -RING],
				[out0, -RING]
			]),
			way(road(INSIDE - 0.6))
		],
		at
	};
}

/**
 * A lap flat out burns about this much fuel, which is measured in such laps,
 * and the crews count on this much until a car has shown what it burns.
 */
const BURN = 1;
/** Fuel is burnt by the metre: this much just to be moving, and this much more at full throttle. */
const IDLE = 0.3;
const FULL = 1.2;
/**
 * A crew puts in this much more than it reckons the car needs to finish, and
 * under caution this many laps' worth on top, since the caution may go on
 * for longer than the lap it is on.
 */
const MARGIN = 1.1;
const SPARE = 0.3;
/** A driver saving fuel lifts to this much throttle, which stretches a tank by about this much. */
const LIFT = 0.7;
const STRETCH = 0.92;
/** How much grip tyres worn right out have lost. */
const WORN = 0.15;
/** Tyres wear by the metre: this much rolling straight, this much more cornering on the limit, and this much for each m/s they slide. */
const ROLL = 0.08;
const CORNER = 0.42;
const SLIDE = 0.012;
/** A lap behind the leader under caution burns about this much of what a lap raced does. */
const IDLING = 0.6;
/** A car out of fuel is out of the race once it has coasted down to this (m/s). */
const DRY = 4;

/** A crew calls its car in from this far before the way in, and under green no later than this (m); under caution, when nobody is going fast, this late. */
const CALL_FAR = 170;
const CALL_NEAR = 85;
const CALL_LATE = 35;
/** A car called in moves to the inside this far before the way in, and takes that much of the track at this share of its usual speed to hold it. */
const MOVE_IN = 70;
const TIGHT = 0.9;
/**
 * On the way in a car brakes this hard (m/s²) to be down to the lane's limit
 * by the line where it begins. It is not slowed on the track at all, unless
 * it is going faster than that braking could bring down in the room there
 * is, and then only at this rate.
 */
const SLOW = 11;
const EASE = 6;
/** Cars coming in together leave this much room between them (m). */
const QUEUE = 11;
/** The way through the pits is joined this far along it. */
const JOIN = 9;
/**
 * In the lane a car brakes and pulls away this hard (m/s²). On the way out it
 * pulls away this hard, up to this share of the speed the track is taken at
 * where it joins it, so it is in nobody's way when it does.
 */
const BRAKE = 8;
const PULL_AWAY = 5;
const GO = 8;
const EXIT = 0.95;
/** How fast a car joins the track when there is a wreck lying near where it does (m/s). */
const CRAWL = 7;
/** How far behind another car in the lane one stops, and behind the middle of a truck, which is long; nearer than this, two cars are level. */
const KEEP = 6;
const KEEP_TRUCK = 10.5;
/**
 * A car in the pits further than this (m) to one side of another's way is
 * out of it, and is passed, not queued behind: one turning into its box, or
 * pulling out of it, once it is that far over.
 */
const CLEAR = 2.8;
/** A car turning into its box starts this far before it (m), and is about this long. */
const TURN = PULL + 1;
const LENGTH = 4.5;
/** How fast a car in the pits may go with something `space` metres ahead going at `speed`, to stop `keep` metres behind it. */
const behind = (speed: number, space: number, keep: number) =>
	Math.sqrt(Math.max(0, speed) ** 2 + 2 * BRAKE * Math.max(0, space - keep));
/** A car on the track no further than this from the inside, just past where the way out joins it, is in the way of one coming out. */
const JOINED = 2.5;
const LEVEL = 3;
/** On its way out, a car stops this far short of joining the track with a tow truck across where it joins. */
const SHORT = 8;
/** A car looks for a gap on the track from this far before the end of the lane. Held there this long, it goes whoever is coming. */
const LOOK = 12;
const PATIENCE = 8;

/** Seconds to put fuel in: the hose on and off, and each lap's worth. */
const HOSE = 1.2;
const PER_LAP = 1.6;
/** Seconds to change four tyres, and how much longer the two jobs take together than the longer of them. */
const TYRES = 4;
const TOGETHER = 1;
/** A stop takes the slowest crew and the quickest this much of those times. */
const SLOWEST = 1.25;
const QUICKEST = 0.8;
/** How often the worst crew and the best fumble a stop, and the seconds it costs: at least this, and up to this much more. */
const FUMBLES = [0.22, 0.03];
const FUMBLE = 2;
const FUMBLE_MORE = 2;
/**
 * New tyres are reckoned worth this many seconds for each lap left to run,
 * for each lap's worth of wear on the old ones... as a crew judges it. Under
 * caution the seconds a change costs count for this much.
 */
const WORTH = 2.5;
const CHEAP = 0.35;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** What the pits need to know of the race, and may do to it. */
type Meeting = {
	flag: () => Flag;
	/** How many laps the race is, as it stands. */
	laps: () => number;
	note: (
		car: Car,
		what:
			| ({ kind: 'pit' } & Omit<Plan, 'seconds'>)
			| { kind: 'away'; seconds: number; slow: boolean }
			| { kind: 'dry' }
	) => void;
	/** Puts a car out of the race where it is. */
	retire: (car: Car) => void;
	/** The tow trucks, which use the lane too: where each is, in the world and by the track's count. */
	trucks: {
		x: number;
		y: number;
		sample: number;
		across: number;
		busy: boolean;
		speed: number;
	}[];
};

/** How a way through the pits is followed: its points, how far along each is, and where on it things are. */
type Rail = {
	x: number[];
	y: number[];
	along: number[];
	length: number;
	line: number;
	stop: number;
	end: number;
	look: number;
	/** How fast each point may be passed. */
	fast: number[];
};

/** How much grip a car's tyres have left, as a share of what they had new. */
export const tyreGrip = (car: Pick<Car, 'wear'>) => 1 - WORN * car.wear;

export type Pits = ReturnType<typeof createPits>;

/**
 * The crews of a race: they keep count of each car's fuel and tyres, call
 * the cars in, and see them through the lane. `rand` is theirs alone. With
 * the rules' `pits` off there are none: no car burns or wears anything, or
 * ever comes in.
 */
/**
 * How fast (m/s) a car may leave the track for the pits: as fast as it can
 * still brake on the way in to the lane's limit by where the limit begins.
 */
export function entering(lane: PitLane, rules: Rules) {
	return Math.sqrt(rules.limit ** 2 + 2 * SLOW * (lane.path(0).line - JOIN));
}

export function createPits(
	cars: Car[],
	track: Track,
	rules: Rules,
	rand: () => number,
	race: Meeting
) {
	const { n, step: spacing, length } = track;
	const lane = pitsFor(track);
	const on = rules.pits;
	/** Metres from one sample forward round the lap to another. */
	const ahead = (from: number, to: number) => ((((to - from) % n) + n) % n) * spacing;
	/** The same the short way round: negative if it is behind. */
	const along = (from: number, to: number) => (((to - from + n * 1.5) % n) - n / 2) * spacing;

	// How many laps before the end each crew means to stop, if nothing forces
	// its hand: any that a full tank would see out.
	const most = clamp(
		Math.floor(rules.tank / (BURN * MARGIN) - 0.05),
		1,
		Math.max(1, rules.laps - 1)
	);
	const crews = cars.map((car, box) => ({
		box,
		plan: on ? 1 + Math.floor(rand() * most) : 0,
		/** How much this crew thinks of new tyres. */
		appetite: on ? lerp(0.6, 1.4, rand()) : 1,
		/** Fuel burnt and metres run under green, by which the crew judges what the car needs. */
		used: 0,
		driven: 0,
		saving: false,
		stops: 0,
		// through the pits
		rail: null as Rail | null,
		at: 0,
		s: 0,
		v: 0,
		/** Standing in the box: since when, until when at the soonest, and what is being done. */
		since: 0,
		until: 0,
		service: 'fuel' as Stop,
		slow: false,
		/** What the stop is made of (crew.ts), and the fuel in the car as it began, and going in at it. */
		job: null as Plan | null,
		start: 0,
		add: 0,
		tyres: false,
		/** Since when it has been held at the end of the lane, or 0, and whether it has been let go. */
		held: 0,
		go: false
	}));
	type Crew = (typeof crews)[number];

	/** What a car burns in a lap, as far as its crew can tell. */
	const rate = (crew: Crew) => (crew.driven > 200 ? (crew.used / crew.driven) * length : BURN);
	/**
	 * Laps a car has still to run. Under caution the lap the leader is on is
	 * to be run again, so there is that much more of the race than it looks:
	 * as much of a lap as the leader has done of this one.
	 */
	const left = (car: Car) => {
		const flag = race.flag();
		let again = 0;
		if (flag === 'yellow' || flag === 'restart') {
			const lead = Math.max(...cars.map((other) => (other.retired ? 0 : other.progress)));
			again = Math.max(0, lead / length - Math.floor(lead / length));
		}
		return (race.laps() * length - car.progress) / length + again;
	};

	/**
	 * Whether this is a car's last chance to stop, `far` metres from the way
	 * in: it has not the fuel to come round again, at the pace it is going,
	 * which under caution takes a good deal less.
	 */
	const last = (car: Car, crew: Crew, far: number) =>
		car.fuel / (rate(crew) * (race.flag() === 'green' ? 1 : IDLING)) < far / length + 1.15;

	/** Whether a crew wants its car in, `far` metres from the way in. */
	function wants(car: Car, crew: Crew, far: number, flag: Flag) {
		const before = far / length;
		const after = left(car) - before;
		// no stop is worth making that close to the end
		if (after < 0.5) return false;
		const burn = rate(crew);
		const short = car.fuel < left(car) * burn * MARGIN;
		// it cannot get round to the pits again: now or never
		if (short && last(car, crew, far)) return true;
		// that apart, the pits are shut while the field lines up to go green
		if (flag === 'restart') return false;
		// whether a full tank from here would see it to the end
		const enough = after * burn * MARGIN <= rules.tank;
		if (flag === 'yellow') {
			// a stop that has to be made is made now, while it costs little, if there is room in the tank to make it worth it
			if (short) return enough || rules.tank - car.fuel > 0.5;
			// and new tyres taken, though those at the front give up their places less readily
			const place = cars.filter((other) => !other.retired && other.progress > car.progress).length;
			return after >= 1 && car.wear > 0.45 + (place === 0 ? 0.25 : place === 1 ? 0.12 : 0);
		}
		if (short) {
			if (crew.saving) return false;
			// it has stopped already and was not given enough, or could not be: again, once a tankful will do
			if (crew.stops) return enough;
			return enough && after <= crew.plan + 0.5;
		}
		return after >= 1.5 && car.wear > 0.8;
	}

	/** Takes a car off the track at the way in, and lays the way through the pits from where it is. */
	function take(car: Car, crew: Crew) {
		const { way, line, stop, end, look, fast } = lane.path(crew.box);
		// the point of the way nearest the car, and the one it joins at, a little further on
		let near = 0;
		for (let k = 1; k < Math.min(way.count, 60); k++) {
			if (
				Math.hypot(way.x[k] - car.x, way.y[k] - car.y) <
				Math.hypot(way.x[near] - car.x, way.y[near] - car.y)
			) {
				near = k;
			}
		}
		let join = near + 1;
		while (join + 1 < way.count && way.along[join] - way.along[near] < JOIN) join++;
		const onto = Math.atan2(way.y[join] - way.y[join - 1], way.x[join] - way.x[join - 1]);
		const lead = curve(
			{ x: car.x, y: car.y, angle: car.angle },
			{ x: way.x[join], y: way.y[join], angle: onto }
		).slice(0, -1);
		const rail: Rail = {
			x: [],
			y: [],
			along: [],
			length: 0,
			line: 0,
			stop: 0,
			end: 0,
			look: 0,
			fast: []
		};
		for (const [x, y] of lead) {
			rail.x.push(x);
			rail.y.push(y);
			rail.fast.push(Infinity);
		}
		for (let k = join; k < way.count; k++) {
			rail.x.push(way.x[k]);
			rail.y.push(way.y[k]);
			rail.fast.push(fast[k]);
		}
		rail.along.push(0);
		for (let k = 1; k < rail.x.length; k++) {
			rail.along.push(
				rail.along[k - 1] + Math.hypot(rail.x[k] - rail.x[k - 1], rail.y[k] - rail.y[k - 1])
			);
		}
		rail.length = rail.along[rail.along.length - 1];
		const joined = rail.along[lead.length] - way.along[join];
		rail.line = line + joined;
		rail.stop = stop + joined;
		rail.end = end + joined;
		rail.look = look + joined;
		crew.rail = rail;
		crew.at = 0;
		crew.s = 0;
		crew.v = Math.max(2, car.speed);
		crew.held = 0;
		crew.go = false;
		car.lane = LANE.in;
		// on the rail its tyres do not slide, so nothing comes off them
		car.slip = 0;
		// nothing can run into it from here on
		car.body.setActive(false);
	}

	/** What a crew does at a stop, decided as the car pulls up, and how long it will take. */
	function serve(car: Car, crew: Crew, time: number) {
		const laps = left(car);
		const yellow = race.flag() !== 'green';
		const need = (laps * rate(crew) + (yellow ? SPARE : 0)) * MARGIN;
		let add = clamp(need - car.fuel, 0, rules.tank - car.fuel);
		if (add < 0.1) add = 0;
		const filling = add ? HOSE + PER_LAP * add : 0;
		const both = Math.max(filling, TYRES) + (add ? TOGETHER : 0);
		// new tyres if they will win back the seconds they cost, as this crew judges it
		const worth = laps * car.wear * WORTH * crew.appetite;
		const tyres = !add || (laps >= 0.7 && worth > (both - filling) * (yellow ? CHEAP : 1));
		const skill = clamp(car.entry.crew, 0, 1);
		crew.service = add && tyres ? 'both' : add ? 'fuel' : 'tyres';
		crew.slow = rand() < lerp(FUMBLES[0], FUMBLES[1], skill);
		const pace = lerp(SLOWEST, QUICKEST, skill);
		const fumble = crew.slow ? FUMBLE + rand() * FUMBLE_MORE : 0;
		const seconds = (tyres ? both : filling) * pace + fumble;
		// the jobs that make up that time, which the fuel goes in by (crew.ts)
		const plan = planStop(crew.service, filling * pace, tyres ? TYRES * pace : 0, fumble, seconds);
		crew.since = time;
		crew.until = time + seconds;
		crew.job = plan;
		crew.start = car.fuel;
		crew.add = add;
		crew.tyres = tyres;
		crew.stops++;
		car.lane = LANE.box;
		race.note(car, {
			kind: 'pit',
			service: plan.service,
			fuel: plan.fuel,
			tyres: plan.tyres,
			fumble: plan.fumble
		});
	}

	/**
	 * How far ahead of a car something off the track is, in metres as the
	 * crow flies, which is what counts where the lane bends: negative if it
	 * is behind. Of two level by the track's count, `first` says whether the
	 * other is the one ahead.
	 */
	const aheadOf = (car: Car, other: { x: number; y: number; sample: number }, first = false) => {
		const way = along(car.sample, other.sample);
		const far = Math.hypot(other.x - car.x, other.y - car.y);
		return way > 0 || (way === 0 && first) ? far : -far;
	};

	/** Whether a car is on the move in the pits: on its way to its box or away from it, not standing in it. */
	const moving = (car: Car) => car.lane === LANE.in || car.lane === LANE.out;

	/**
	 * Whether a car in its box can pull out into the lane: nothing coming down
	 * it, or just past. It waits for one coming to go by unless it can be up to
	 * the lane's limit before that one is on it, so that it never has to brake.
	 */
	function free(car: Car, crew: Crew, lorries: Lorry[]) {
		const up = rules.limit / PULL_AWAY;
		for (const other of cars) {
			if (other === car || !moving(other)) continue;
			// one that is turning into a box before this one never gets here
			if (other.lane === LANE.in && crews[cars.indexOf(other)].box < crew.box) continue;
			const coming = Math.min(other.speed, rules.limit);
			const room = Math.max(16, coming * up - (PULL_AWAY * up ** 2) / 2 + KEEP + 2);
			const gap = aheadOf(car, other, cars.indexOf(other) < cars.indexOf(car));
			if (gap > -room && gap < 7) return false;
		}
		return lorries.every((lorry) => {
			const gap = aheadOf(car, lorry);
			// one stopped behind is waiting for this very car to go
			return gap <= -22 || gap >= KEEP_TRUCK || (gap < 0 && lorry.speed < 0.5);
		});
	}

	/** How long a car will take from where it is to the end of its way out, if nothing holds it up. */
	function joining(car: Car, crew: Crew) {
		const rail = crew.rail!;
		const away = joins(car);
		let [s, v, t, at] = [crew.s, crew.v, 0, crew.at];
		for (; s < rail.length && t < 10; t += 0.05) {
			while (at + 2 < rail.along.length && rail.along[at + 1] <= s) at++;
			v =
				s < rail.end
					? Math.min(rules.limit, v + PULL_AWAY * 0.05)
					: Math.min(away, rail.fast[at + 1], v + GO * 0.05);
			s += v * 0.05;
		}
		return t;
	}

	/**
	 * How fast a car is going as it joins the track: nearly what it would
	 * take that part of it at. Under caution, no faster than it went down the
	 * lane; and with a wreck or the truck anywhere near, at a crawl, to pick
	 * its way round.
	 */
	const joins = (car: Car) =>
		race.flag() === 'green' && !inTheWay(-12, 45)
			? Math.max(rules.limit, car.pace[lane.merge] * EXIT)
			: inTheWay(-12, 45)
				? CRAWL
				: rules.limit;
	/** How fast a car may be going as it leaves the track for the way in: what it can brake from on the way. */
	const enters = entering(lane, rules);

	/**
	 * Whether there is a wreck lying on the track, or the tow truck at work
	 * on it, between `from` metres and `to` metres on from where the way out
	 * joins the track, and no further out from the inside than `within`.
	 */
	function inTheWay(from: number, to: number, within = HALF_CORRIDOR) {
		const here = (sample: number, across: number) => {
			const far = along(lane.merge, sample);
			return far > from && far < to && across > -HALF_CORRIDOR && across < within;
		};
		for (const other of cars) {
			if (other.retired && here(other.sample, other.across)) return true;
		}
		for (const truck of race.trucks) {
			if (!truck.busy || Math.abs(truck.speed) >= 6) continue;
			if (here(truck.sample, truck.across)) return true;
		}
		return false;
	}

	/** Whether the track is blocked right where the way out joins it. */
	const blocked = () => inTheWay(-8, 12, 1);

	/** Whether a car at the end of the lane can go: nobody on the track will be where it joins when it gets there. */
	function gap(car: Car, crew: Crew) {
		const arrives = joining(car, crew);
		for (const other of cars) {
			if (other === car || other.retired || other.lane >= LANE.in) continue;
			const short = along(other.sample, lane.merge);
			if (short < -20 || short > 160) continue;
			// how far past where it joins the other will be by then
			const past = other.speed * arrives - short;
			if (past > -(6 + Math.max(0, other.speed - 16) * 1.2) && past < 8) return false;
		}
		// nor a tow truck coming by on the track, which is a good deal longer than a car, and slower to stop
		for (const truck of race.trucks) {
			if (!truck.busy || truck.across < -HALF_CORRIDOR) continue;
			const short = along(truck.sample, lane.merge);
			if (short < -25 || short > 160) continue;
			const past = truck.speed * arrives - short;
			if (past > -(10 + truck.speed * 0.5) && past < 22) return false;
		}
		return true;
	}

	/**
	 * Where something at `x`, `y` is as a car in the pits sees it, along its
	 * own way through them: how far on along it, negative if behind, and how
	 * far to one side of it. Only the stretch of the way from a little behind
	 * the car to a little past where it would queue is looked along, so what
	 * is further than that either way is a long way to one side of it.
	 */
	function onTheWay(crew: Crew, x: number, y: number) {
		const rail = crew.rail!;
		let k = crew.at;
		while (k > 0 && rail.along[k] > crew.s - LEVEL - 1) k--;
		let [space, side] = [0, Infinity];
		for (; k < rail.along.length && rail.along[k] < crew.s + 26; k++) {
			const far = Math.hypot(rail.x[k] - x, rail.y[k] - y);
			if (far < side) [space, side] = [rail.along[k] - crew.s, far];
		}
		return { space, side };
	}

	/**
	 * Where a car turning into its box will be `soon` seconds from now, at the
	 * soonest: it is braking for its box, and stops there.
	 */
	function turning(crew: Crew, soon: number): [number, number] {
		const rail = crew.rail!;
		const gone = Math.min(crew.v * soon - (BRAKE * soon ** 2) / 2, crew.v ** 2 / (2 * BRAKE));
		const s = Math.min(rail.stop, crew.s + Math.max(0, gone));
		let k = crew.at;
		while (k + 2 < rail.along.length && rail.along[k + 1] <= s) k++;
		const t = clamp((s - rail.along[k]) / (rail.along[k + 1] - rail.along[k] || 1), 0, 1);
		return [
			rail.x[k] + (rail.x[k + 1] - rail.x[k]) * t,
			rail.y[k] + (rail.y[k + 1] - rail.y[k]) * t
		];
	}

	/** One step of a car that is off the track: down the lane, into its box, out again. */
	function ride(car: Car, crew: Crew, time: number, dt: number, lorries: Lorry[]) {
		const rail = crew.rail!;
		let target = rules.limit;
		let pull = PULL_AWAY;
		let brake = BRAKE;
		if (car.lane === LANE.in && crew.s < rail.line) {
			// on the way in: braking from racing speed to the lane's limit by the line
			target = Math.sqrt(rules.limit ** 2 + 2 * SLOW * Math.max(0, rail.line - crew.s - 2));
			brake = SLOW * 1.3;
		} else if (car.lane === LANE.box) {
			target = 0;
			// the fuel goes in while the nozzle is on, and only then
			if (crew.job && crew.add) {
				const share = fuelled(crew.job, time - crew.since);
				car.fuel = Math.min(rules.tank, crew.start + crew.add * share);
			}
			if (time >= crew.until && free(car, crew, lorries)) {
				if (crew.tyres) car.wear = 0;
				car.lane = LANE.out;
				race.note(car, { kind: 'away', seconds: time - crew.since, slow: crew.slow });
			}
		} else if (car.lane === LANE.in) {
			target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, rail.stop - crew.s)));
		} else if (!crew.go && rail.look - crew.s < Math.max(LOOK, crew.v ** 2 / (2 * BRAKE) + 2)) {
			// Where the way out leaves for the track it looks for a gap to join
			// in, and once it has seen one it goes; until then it is held there.
			crew.held ||= time;
			// (held too long behind a wreck, it goes anyway: the truck wants the lane to fetch it)
			const waited = time - crew.held;
			if (waited > 3 * PATIENCE || (!blocked() && (gap(car, crew) || waited > PATIENCE))) {
				crew.go = true;
			} else target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, rail.look - 1 - crew.s)));
			if (crew.s >= rail.end) target = Math.min(target, rail.fast[crew.at + 1]);
		} else if (crew.s >= rail.end) {
			// on the way out, past the lane's limit, and no faster than its bends allow
			target = Math.min(joins(car), rail.fast[crew.at + 1]);
			pull = GO;
		}
		// Behind whatever is ahead of it on the move in the pits. Two that are
		// level cannot both go: the one further up the grid does.
		if (car.lane !== LANE.box) {
			for (const other of cars) {
				if (other === car || !moving(other)) continue;
				// One pulling out of its box ahead is coming into the lane, so it
				// is in the way already. Of the rest only what is on its own way
				// counts: not one off to the side of it, turning into its box,
				// nor one turning in that will be off to the side by the time this
				// one is up to it.
				const them = crews[cars.indexOf(other)];
				const joining = other.lane === LANE.out && them.s < them.rail!.stop + PULL;
				const { space, side } = joining
					? { space: aheadOf(car, other, cars.indexOf(other) < cars.indexOf(car)), side: 0 }
					: onTheWay(crew, other.x, other.y);
				if (side > CLEAR) continue;
				if (other.lane === LANE.in && them.s > them.rail!.stop - TURN && space > LEVEL) {
					const soon = clamp((space - LENGTH) / Math.max(1, crew.v), 0, 1.5);
					if (onTheWay(crew, ...turning(them, soon)).side > CLEAR) continue;
				}
				if (space > LEVEL && space < 25) {
					target = Math.min(target, behind(other.speed, space, KEEP));
				} else if (Math.abs(space) <= LEVEL && cars.indexOf(other) < cars.indexOf(car)) {
					target = 0;
				}
			}
			// On the way out, behind one that has just joined the track ahead of
			// it, which may be crawling there round a wreck or a truck.
			if (car.lane === LANE.out && crew.s >= rail.look) {
				for (const other of cars) {
					if (other === car || other.retired || other.lane !== LANE.racing) continue;
					const past = along(lane.merge, other.sample);
					if (past < -2 || past > 20 || Math.abs(other.across - INSIDE) > JOINED) continue;
					const space = aheadOf(car, other);
					if (space > 0 && space < 25) {
						target = Math.min(target, behind(other.speed, space, KEEP));
					}
				}
			}
			for (const lorry of lorries) {
				const space = aheadOf(car, lorry);
				if (space > 0 && space < 28) {
					target = Math.min(target, behind(lorry.speed, space, KEEP_TRUCK));
				}
			}
			// On the way out, it does not join the track into the side of a tow
			// truck that is out there across where it joins: it stops short until
			// the truck has gone on.
			const left = rail.length - crew.s;
			if (car.lane === LANE.out && truckAtJoin(left))
				target = Math.min(target, behind(0, left, SHORT));
		}
		crew.v = Math.max(0, crew.v + clamp(target - crew.v, -brake * dt, pull * dt));
		crew.s = Math.min(rail.length, crew.s + crew.v * dt);
		if (car.lane === LANE.in && rail.stop - crew.s < 0.12) {
			crew.s = rail.stop;
			crew.v = 0;
			serve(car, crew, time);
		}
		while (crew.at + 2 < rail.along.length && rail.along[crew.at + 1] <= crew.s) crew.at++;
		const [a, b] = [crew.at, crew.at + 1];
		const t = clamp((crew.s - rail.along[a]) / (rail.along[b] - rail.along[a] || 1), 0, 1);
		const x = rail.x[a] + (rail.x[b] - rail.x[a]) * t;
		const y = rail.y[a] + (rail.y[b] - rail.y[a]) * t;
		// facing the way the way runs, over a couple of metres of it so it turns smoothly
		const [from, to] = [Math.max(0, a - 2), Math.min(rail.x.length - 1, b + 2)];
		const angle = Math.atan2(rail.y[to] - rail.y[from], rail.x[to] - rail.x[from]);
		car.body.setTransform({ x, y }, angle);
		car.body.setLinearVelocity({ x: Math.cos(angle) * crew.v, y: Math.sin(angle) * crew.v });
		car.body.setAngularVelocity(0);
		if (crew.s >= rail.length) {
			// back on the track, and a car like any other again, holding the inside
			crew.rail = null;
			car.lane = LANE.racing;
			car.body.setActive(true);
			car.offset = INSIDE - track.line[lane.merge];
			car.steer = 0;
			car.stuck = 0;
		}
	}

	/**
	 * Whether a tow truck out on the track is in the way of a car joining it
	 * `left` metres from now: on the inside, with some of it within a few
	 * metres of where the way out joins, or about to be.
	 */
	function truckAtJoin(left: number) {
		if (left > SHORT + 30) return false;
		return race.trucks.some((truck) => {
			if (!truck.busy || truck.across < -HALF_CORRIDOR + 0.5 || truck.across > 1) return false;
			// how far past the join its front bumper is, and its back
			const front = along(lane.merge, truck.sample) + TRUCK.long - TRUCK.axle;
			const back = front - 2 * TRUCK.long;
			return front > -4 - truck.speed && back < 6;
		});
	}

	/** A truck that is in the lane, or crossing it, as the cars there see it. */
	type Lorry = { x: number; y: number; sample: number; speed: number };
	function inTheLane(): Lorry[] {
		const found: Lorry[] = [];
		for (const truck of race.trucks) {
			if (!truck.busy) continue;
			// where it is by its own count: off the track it may be as near another stretch of it as its own
			const { sample, across } = truck;
			// in the lane, on its way through the wall, or in among the boxes
			if (across < -HALF_CORRIDOR + 0.5 && across > -BOX_ACROSS - 1.5) {
				found.push({
					x: truck.x,
					y: truck.y,
					sample,
					speed: Math.max(0, truck.speed)
				});
			}
		}
		return found;
	}

	return {
		lane,

		/** How much throttle a driver may use: less while saving fuel. */
		lift: (car: Car) => (on && crews[cars.indexOf(car)].saving ? LIFT : 1),

		/**
		 * Where across the track a car called in should be, if it matters yet,
		 * and how fast it may be going, on its way to the way in. Null for any
		 * other car.
		 */
		call(car: Car) {
			if (car.lane !== LANE.called) return null;
			const far = ahead(car.sample, lane.entry);
			const to = far > length / 2 ? 0 : far;
			let limit = Math.sqrt(enters ** 2 + 2 * EASE * Math.max(0, to - 3));
			// Those coming in go in one behind another, not side by side. Only
			// the one behind gives anything up for it, and only a little: it
			// drops back until there is room between them. Of two that are level
			// the one further down the grid is the one behind.
			for (const other of cars) {
				if (other === car || other.retired) continue;
				if (other.lane !== LANE.called && other.lane !== LANE.in) continue;
				const space = along(car.sample, other.sample);
				const behind = space > 0 || (space === 0 && cars.indexOf(other) < cars.indexOf(car));
				if (behind && space < QUEUE) limit = Math.min(limit, Math.max(8, other.speed - 2));
			}
			// It keeps to the racing line until it is nearly there, and then to
			// the inside, lifting a little to hold it: no more than that is
			// given up on the track. (Under caution that leaves the inside to
			// the tow truck for as long as may be.)
			if (to > MOVE_IN) return { across: null, limit };
			return { across: INSIDE, limit: Math.min(limit, car.pace[car.sample] * TIGHT) };
		},

		/** Counts what a car has burnt and worn this step, given the throttle it is using and how much of its grip the corner is taking. */
		use(car: Car, throttle: number, cornering: number, dt: number) {
			if (!on) return;
			const crew = crews[cars.indexOf(car)];
			const moved = Math.abs(car.speed) * dt;
			const burnt = (moved / length) * BURN * lane.thirst * (IDLE + FULL * Math.max(0, throttle));
			car.fuel = Math.max(0, car.fuel - burnt);
			car.wear = Math.min(
				1,
				car.wear +
					rules.wear * (moved / length) * (ROLL + CORNER * cornering ** 2 + SLIDE * car.slip)
			);
			// what it burns is judged from racing laps, not from laps spent saving it
			if (race.flag() === 'green' && !crew.saving) {
				crew.used += burnt;
				crew.driven += moved;
			}
		},

		/** One step of the crews. Call before the world is stepped, once the drivers have had their turn. */
		step(time: number, started: boolean, dt: number) {
			if (!on) return;
			const flag = race.flag();
			const lorries = cars.some((car) => car.lane >= LANE.in) ? inTheLane() : [];
			cars.forEach((car, index) => {
				const crew = crews[index];
				if (car.retired) return;
				if (car.lane >= LANE.in) return ride(car, crew, time, dt, lorries);
				if (car.finishTime || !started) return;
				if (car.fuel <= 0 && Math.abs(car.speed) < DRY) {
					car.lane = LANE.racing;
					race.note(car, { kind: 'dry' });
					race.retire(car);
					return;
				}
				// saving fuel while a little short of what it needs, until it is not
				const need = left(car) * rate(crew) * MARGIN;
				crew.saving = car.fuel < need * (crew.saving ? 1.02 : 1) && car.fuel >= need * STRETCH;
				const far = ahead(car.sample, lane.entry);
				if (car.lane === LANE.called) {
					if (flag === 'checkered' || (flag === 'restart' && !last(car, crew, far))) {
						// the pits shut as the field lines up to go green
						car.lane = LANE.racing;
					} else if (far <= 2 * spacing || far >= length - 10 * spacing) {
						// At the way in: taken off the track if it is where it should
						// be and slow enough, and not on top of the one that went in
						// before it.
						const facing = Math.atan2(track.ty[car.sample], track.tx[car.sample]);
						const square = Math.abs(
							Math.atan2(Math.sin(car.angle - facing), Math.cos(car.angle - facing))
						);
						const room = cars.every(
							(other) =>
								other === car ||
								!moving(other) ||
								Math.hypot(other.x - car.x, other.y - car.y) > KEEP - 1
						);
						if (
							room &&
							car.across < 0.5 &&
							car.speed < enters + 4 &&
							car.speed > 0.3 &&
							square < 0.5
						) {
							take(car, crew);
						}
					} else if (far > length - 18 * spacing) {
						// missed it: round again
						car.lane = LANE.racing;
					}
				} else if (
					flag !== 'checkered' &&
					far <= CALL_FAR &&
					far >= (flag === 'green' ? CALL_NEAR : CALL_LATE) &&
					wants(car, crew, far, flag)
				) {
					car.lane = LANE.called;
				}
			});
		}
	};
}
