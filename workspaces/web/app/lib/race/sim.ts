import { ChainShape, PolygonShape, World, type Body, type Fixture } from 'planck';
import type { Plan } from './crew';
import { createPits, LANE as PIT, tyreGrip } from './pits';
import { FAR, pathOf, roughly, speedsAlong, think, type Thought } from './plan';
import { curvature, SPAN } from './line';
import { createRecovery } from './recovery';
import type { Entry } from './roster';
import { serviceFor } from './service';
import {
	clamp,
	HALF_CORRIDOR,
	HALF_ROAD,
	lateral,
	MAX_OFFSET,
	nearest,
	NOSE,
	WALLS,
	type Track
} from './track';

// One race, start to finish. Each car is a rigid body pushed around by its
// two axles' tyres, which grip up to a limit and slide past it, and steered
// by a driver that follows the racing line, brakes for corners, goes round
// traffic and now and then gets it wrong. Hard knocks dent the bodywork for
// good and add up to a retirement. The same seed always runs the same race.
//
// A retirement brings out a caution: the whole field slows, closes up into a
// queue behind the leader and holds its order while a truck fetches the wreck
// (recovery.ts). Race control can throw one by hand as well. Once the track
// is clear and the field has closed up, the race is going green: the field
// lines up two by two behind the leader, and the green is given as the leader
// crosses the finish line, once the lines have formed (or a lap later). A lap the leader ends under caution is not one of the race's: it is
// run again, so the race is that much longer and is never won under caution.

export const DT = 1 / 60;
/** Seconds the cars sit on the grid before the start. */
export const LIGHTS = 2;

/**
 * What a race is run to, which /admin/race can change (settings.ts): how
 * many laps it is, whether the cars burn fuel, wear tyres and pit for more
 * (pits.ts), how many laps of hard running a full tank holds, how fast the
 * tyres wear as a share of the usual, the pit lane's speed limit in m/s, and
 * how much damage a knock does as a share of what it did before there was a
 * dial for it: as it was, by default. More makes for more wrecks and
 * cautions, but at half as much again a pile-up now and then takes out a
 * small field, or a whole one on the first lap, so it is not the default.
 */
export type Rules = {
	laps: number;
	pits: boolean;
	tank: number;
	wear: number;
	limit: number;
	damage: number;
};
export const RULES: Rules = { laps: 4, pits: true, tank: 3.3, wear: 1, limit: 12, damage: 1 };
/** The race as it was before there were pits: three laps, flat out all the way. */
export const CLASSIC: Rules = { ...RULES, laps: 3, pits: false };

/**
 * A race is called off this long after the start, whoever is still out. A
 * caution or two fits inside it, each as long as the tow truck takes to go
 * round for the wreck. On a track with a longer lap than most (`length`, in
 * metres), it is longer in proportion.
 */
export const timeCap = (laps: number, length = 0) =>
	(180 + 60 * laps) * Math.max(1, length / USUAL_LAP);
/** About how long a lap is on most tracks (m). */
const USUAL_LAP = 400;
/** Once someone has won, the rest get this long to finish. */
const AFTER_WINNER = 8;
/** And this much longer where there are pits, which string a field out. */
const AFTER_STOPS = 4;

const G = 9.81;
/** The tyres' grip, as a share of G, of a car middling for grip. */
const GRIP = 1.9;
const MASS = 1000;
const INERTIA = 1800;
/** Centre of the car to each axle. */
const AXLE = 1.3;
const MAX_STEER = 0.55;
/**
 * How far down the road, in metres, a driver steering back onto the line
 * takes to get there: firmly, since a car off the line in a bend is a car
 * heading for the edge of the road, but not so hard that it swings past.
 */
const HOLD = 3.5;
/**
 * The mistakes a driver makes: braking late for a corner, fluffing a gear
 * change on a straight, getting on the power too soon out of a corner, and
 * twitching at the wheel in one.
 */
const SLIP = { late: 0, fluff: 1, greedy: 2, twitch: 3 };
/** Seconds, by its own clock, between one mistake and the next: of the calmest driver and the rashest, on average. */
const CALM = 60;
const RASH = 30;
/**
 * How big a driver's mistakes are: the dial for how often one ends in the
 * wall. At 1, about one race in two on the road course loses a car to one;
 * at 1.5, a car a race; at 2, three cars in two races.
 */
const SEVERE = 1.5;
/**
 * How much faster a driver's clock runs, as a share of its usual speed:
 * with a car right behind, with one right ahead, on tyres worn out, and in
 * a car knocked about as far as it will go.
 */
const CHASED = 0.8;
const CHASING = 0.4;
const WORN = 0.6;
const HURT = 1;
/** A mistake that is due, but has not been made for want of the place to make it, is some other one after this long on the driver's clock (s). */
const PATIENT = 8;
/** Seconds a driver brakes ahead of where the speed has to be down. */
const BEAT = 0.2;
/** How fast a driver moves over, across the road (m/s). */
const SIDLE = 4;
/** A car this far to one side of the racing line (m), or making for there, is off it. */
const OFF_LINE = 0.1;
/** A driver off the racing line thinks through the speeds for the road ahead again every this many steps. */
const RETHINK = 6;
/** And one in traffic, which way to go through it, every this many. */
const PONDER = 12;
/** Grip on the verge, as a share of grip on tarmac. */
const VERGE_GRIP = 0.6;
/** How hard a wreck's wheels drag, bent and flat as they are, as a share of the grip it has. */
const WRECK_DRAG = 0.2;
/** Sideways room one car leaves another when passing, centre to centre. */
const CLEAR = 2.5;
/**
 * A driver only pulls out to pass where the car ahead is on road straighter
 * than this (the curvature, 1/m): pulling out as it brakes into a bend only
 * takes the long way round the outside, or runs wide off it.
 */
const STRAIGHT = 0.01;
/** Extra room given to a wrecked car, which may be lying across the road. */
const WRECK = 1.5;
/**
 * Under caution: the speed (m/s) the leader holds, the speed the rest close
 * up at, and the speed the leader brings them round to the line at once the
 * track is clear and they have.
 */
const PACE = 12;
const CATCH = 17;
const RUN_IN = 16;
/** On a long lap, where the run to the line is quicker, the leader is down to this speed (m/s) this far short of the line (m), for the lines to close up. */
const CLOSE_UP = 12;
const EASE = 80;
/** How far apart the queue runs, middle to middle. */
const QUEUE = 8;
/** Under caution, how fast (m/s) a car goes by a wreck, or a truck at work, and from how far either side of it (m). */
const GO_BY = 8;
const PAST = 6;
/** Under caution, how far ahead (m) a driver looks out for wrecks and trucks. */
const SIGHT = 80;
/** Twice the braking (m/s²) a car in a queue counts on: half of what the tyres of an average car can take. */
const QUEUE_BRAKE = GRIP * G;
/** A caution lasts at least this long, and the field is given no longer than this to close up before it is let go at the line anyway. */
const CAUTION_MIN = 8;
const CAUTION_MAX = 25;
/**
 * Going green: the fastest the field closes up into its two lines behind
 * the leader, how far either side of the middle of the road the lines run,
 * the most time it is given to form up before it is let go at the line
 * anyway, and how long
 * after it each car keeps to its line, so the rows do not all dive for the
 * same piece of road at the first corner.
 */
const FORM = 21;
const LANE = 2;
const RESTART_MAX = 15;
const SETTLE = 10;
/**
 * After SETTLE, a car keeps to its line while there is a car in the other
 * one this near (m), ahead or behind, but no longer than this long after the
 * green (s).
 */
const SPLIT = 20;
const SETTLE_MAX = 25;
/** Under caution, a car moves over for the tow truck when it is this near behind (m), and leaves this much room between their middles. */
const GIVE_WAY = 60;
const MAKE_WAY = 3.6;
/** A knock slower than this (m/s) leaves no mark. */
const SHRUG = 2.5;
/** The furthest any corner of the bodywork can be pushed in. */
const MAX_DENT = 0.5;

/**
 * The car's outline from above, x forward, as x,y pairs: down the left side
 * from nose to tail, then back up the right. Dents move these corners.
 */
export const HULL = [
	2.1, 0.75, 0.7, 0.95, -0.7, 0.95, -2.1, 0.85, -2.1, -0.85, -0.7, -0.95, 0.7, -0.95, 2.1, -0.75
];

export type Car = {
	entry: Entry;
	x: number;
	y: number;
	angle: number;
	/** Forward speed, m/s. Negative when rolling backwards. */
	speed: number;
	steer: number;
	/** How fast the tyres are sliding sideways over the road, m/s; 0 while they grip. */
	slip: number;
	/** The outline as it is now, dents and all. */
	hull: Float32Array;
	/** 0 when new; the car retires at 1. */
	damage: number;
	retired: boolean;
	/** A wreck a truck has lifted, or has taken away. */
	towed: boolean;
	/** Metres driven from the start line; negative on the grid. */
	progress: number;
	/** Laps completed; -1 until the car first crosses the line. */
	laps: number;
	bestLap: number;
	/** Race time at the flag, or 0 if the car has not finished. */
	finishTime: number;

	body: Body;
	fixtures: Fixture[];
	sample: number;
	across: number;
	lapStart: number;
	// the car, from its stats
	grip: number;
	power: number;
	tough: number;
	// the driver
	nerve: number;
	follow: number;
	/** How many moments ahead the driver thinks before a move, and what it gives to have a go (plan.ts). */
	foresee: number;
	bold: number;
	errorEvery: number;
	/** The cornering the driver asks of the tyres at most, m/s²: a little less than they have. */
	limit: number;
	/** The speed to be doing at each track sample to make the corners, on the racing line. */
	pace: Float32Array;
	offset: number;
	/**
	 * Where the driver is making for: how far beside the racing line, and the
	 * place across the road instead where it is one (else NaN). It is what the
	 * other drivers plan around (plan.ts).
	 */
	aim: number;
	spot: number;
	/** Or the car it is keeping beside (an index into the cars, else -1), and on which side of it (1 or -1). */
	mate: number;
	mateSide: number;
	/** The share of its pace the car has the grip for now. */
	fade: number;
	/**
	 * What the driver last thought to do in traffic (plan.ts): where to make
	 * for, beside the line or as a place across the road (else NaN), and the
	 * car to drop in behind (-1 for none), where that will be (as `progress`
	 * is counted) and the speed that car will be doing by then.
	 */
	way: number;
	waySpot: number;
	wayMate: number;
	wayMateSide: number;
	leader: number;
	leadSpeed: number;
	leadPoint: number;
	/**
	 * Off the racing line, the speeds the driver has planned for the path
	 * ahead (plan.ts): one for each track sample from `planFrom` on, `planFar`
	 * of them, or none.
	 */
	plan: Float32Array;
	planFrom: number;
	planFar: number;
	/**
	 * The driver's mistakes. They come round on a clock of the driver's own
	 * (`errorClock`, in seconds, which runs faster under pressure): the next
	 * is due when it gets to `errorAt`. The one being made lasts until
	 * `errorUntil` (race time), is of one kind (SLIP), and is as big as
	 * `errorBy`: for braking late, how much too fast the corner is taken, as
	 * a share of the right speed; for getting on the power too soon, the
	 * share of their grip the spinning back tyres are left with; for a
	 * twitch at the wheel, how far it is turned and which way (radians).
	 */
	errorClock: number;
	errorAt: number;
	errorUntil: number;
	errorKind: number;
	errorBy: number;
	/** The kind of mistake that is coming next. */
	errorNext: number;
	stuck: number;
	reverseUntil: number;
	/** Fuel in the tank, in laps of hard running, and how worn the tyres are: 0 new, 1 worn out. */
	fuel: number;
	wear: number;
	/** Where the car is with the pits (LANE in pits.ts): 0 racing, 1 called in, and off the track from 2. */
	lane: number;
};

type Happening =
	/** A knock: where, how hard (the m/s it took off the car), and the car's damage after it. */
	| { kind: 'hit'; x: number; y: number; force: number; damage: number }
	/** A lap completed, and the seconds it took. */
	| { kind: 'lap'; lap: number }
	| { kind: 'retire' | 'finish' }
	/**
	 * In the pits: the car stops in its box, and for what; it leaves, having
	 * stood this long, longer if the crew fumbled it. And out on the track,
	 * a car runs out of fuel, which retires it.
	 */
	| ({ kind: 'pit' } & Omit<Plan, 'seconds'>)
	| { kind: 'away'; seconds: number; slow: boolean }
	| { kind: 'dry' }
	/**
	 * The caution comes out, for a wreck or because race control threw it;
	 * the field is going green, lining up for the restart; and the caution
	 * goes back in.
	 */
	| { kind: 'caution'; by: 'wreck' | 'control' }
	| { kind: 'restart' }
	| { kind: 'green' }
	/** The leader ends a lap under caution: it does not count, and the race is a lap longer. */
	| { kind: 'again' };

/**
 * Something that happened to a car (an index into `cars`) at a race time.
 * What happens to the race and not to a car, a caution without a wreck and
 * every green, has -1 for the car.
 */
export type RaceEvent = Happening & { time: number; car: number };

/**
 * The flag flying: green while it is raced, yellow under caution, restart
 * while the field lines up to go green again, checkered once it has been won.
 */
export type Flag = 'green' | 'yellow' | 'restart' | 'checkered';

/** The flags under which the race is neutralised: the caution, and going green at the end of it. */
export const neutral = (flag: Flag) => flag === 'yellow' || flag === 'restart';

/** The flag each kind of event flies; the rest leave the one that was flying. */
const FLIES: Partial<Record<RaceEvent['kind'], Flag>> = {
	caution: 'yellow',
	restart: 'restart',
	green: 'green',
	finish: 'checkered'
};

/** The flag flying after something has happened, given the one that was. */
export const flown = (flag: Flag, kind: RaceEvent['kind']): Flag => FLIES[kind] ?? flag;

/**
 * Something on the road, as a driver sees it: where it is, how fast it is
 * going, whether it is a wreck, and whether it is on a truck. A truck out on
 * the track is one at either end of it, and is gone round like a wreck.
 */
type Obstacle = Pick<Car, 'sample' | 'across' | 'speed' | 'retired' | 'towed'> & {
	lane?: number;
	/** How much further it reaches to either side than a wreck does: a truck beside the wreck it is lifting, as the two of them are gone round. */
	wide?: number;
};

export type Race = ReturnType<typeof createRace>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A small seeded random number generator (mulberry32). */
export function random(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Cars in finishing order: by time at the flag, then by distance covered. */
export function rank<T extends { finishTime: number; progress: number }>(cars: T[]): T[] {
	return [...cars].sort((a, b) => {
		if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
		if (a.finishTime || b.finishTime) return a.finishTime ? -1 : 1;
		return b.progress - a.progress;
	});
}

/**
 * A field of `count` cars from the roster, drawn from the seed, in their
 * starting order, pole first. Unless `count` says otherwise, the whole roster.
 */
export function drawGrid(seed: number, roster: Entry[], count = roster.length): Entry[] {
	const rand = random(seed ^ 0x9e3779b9);
	const grid = [...roster];
	for (let i = grid.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[grid[i], grid[j]] = [grid[j], grid[i]];
	}
	return grid.slice(0, count);
}

/**
 * `grid` is the starting order, pole first, on `track`. `flags` are the race
 * times at which race control throws a caution, whatever is happening on the
 * track. `rules` are what it is run to.
 */
export function createRace(
	seed: number,
	grid: Entry[],
	track: Track,
	flags: number[] = [],
	rules: Rules = RULES
) {
	const rand = random(seed);
	const { n, step: spacing, length } = track;
	const { ahead: onRound } = serviceFor(track);
	const world = new World({ gravity: { x: 0, y: 0 } });

	// a wall along each side of the track
	const walls = world.createBody();
	for (const side of [-1, 1]) {
		const loop = [];
		for (let i = 0; i < n; i += 2) {
			loop.push({
				x: track.x[i] + track.nx[i] * HALF_CORRIDOR * side,
				y: track.y[i] + track.ny[i] * HALF_CORRIDOR * side
			});
		}
		walls.createFixture({
			shape: new ChainShape(loop, true),
			friction: 0.3,
			restitution: 0.2,
			filterCategoryBits: WALLS
		});
	}

	// How long each driver takes to react to the lights: mostly quick, now
	// and then slow enough to lose a place or two before the first corner.
	const reaction = grid.map(() => rand() ** 2 * 0.4);

	const cars = grid.map((entry, slot): Car => {
		// two by two behind the line
		const behind = -(6 + 6.5 * slot);
		const sample = (Math.round(behind / spacing) + n) % n;
		const across = slot % 2 ? -2 : 2;
		const x = track.x[sample] + track.nx[sample] * across;
		const y = track.y[sample] + track.ny[sample] * across;
		const angle = Math.atan2(track.ty[sample], track.tx[sample]);
		const body = world.createBody({
			type: 'dynamic',
			position: { x, y },
			angle,
			angularDamping: 0.2,
			userData: slot
		});
		// The stats spread the cars wide enough apart that a quicker one can
		// catch and pass a slower one in three laps. The engine is weak enough
		// that power, not only grip, sets how fast a car leaves each corner.
		const grip = GRIP * lerp(0.94, 1.06, entry.grip);
		const errorEvery = lerp(CALM, RASH, entry.aggression);
		// the most aggressive driver runs right at what the tyres can do,
		// which is quickest; past it they only slide
		const limit = grip * G * lerp(0.73, 0.79, entry.aggression);
		const car: Car = {
			entry,
			x,
			y,
			angle,
			speed: 0,
			steer: 0,
			slip: 0,
			hull: Float32Array.from(HULL),
			damage: 0,
			retired: false,
			towed: false,
			progress: behind,
			laps: -1,
			bestLap: 0,
			finishTime: 0,
			body,
			fixtures: [],
			sample,
			across,
			lapStart: 0,
			grip,
			power: 110_000 * lerp(0.6, 1.4, entry.speed),
			tough: lerp(0.7, 1.4, entry.reliability),
			nerve: lerp(0.9, 1.05, entry.aggression),
			follow: lerp(7, 4.6, entry.aggression),
			foresee: Math.round(lerp(10, 6, entry.aggression)),
			bold: lerp(4, 12, entry.aggression),
			errorEvery,
			limit,
			pace: paceFor(track, limit),
			offset: 0,
			aim: 0,
			spot: NaN,
			mate: -1,
			mateSide: 0,
			fade: 1,
			way: 0,
			waySpot: NaN,
			wayMate: -1,
			wayMateSide: 0,
			leader: -1,
			leadSpeed: 0,
			leadPoint: 0,
			plan: new Float32Array(FAR + 1),
			planFrom: 0,
			planFar: 0,
			errorClock: 0,
			errorAt: -Math.log(1 - rand()) * errorEvery,
			errorUntil: 0,
			errorKind: SLIP.late,
			errorBy: 1,
			errorNext: SLIP.late,
			stuck: 0,
			reverseUntil: 0,
			fuel: rules.tank,
			wear: 0,
			lane: PIT.racing
		};
		reshape(car);
		return car;
	});

	// Knocks are collected while the world steps and applied after it, since
	// a body's shape cannot change mid-step.
	const hits: { car: Car; x: number; y: number; dx: number; dy: number; blow: number }[] = [];
	world.on('post-solve', (contact, impulse) => {
		const manifold = contact.getWorldManifold(null);
		if (!manifold) return;
		let total = 0;
		for (let k = 0; k < manifold.pointCount; k++) total += impulse.normalImpulses[k];
		const blow = total / MASS - SHRUG;
		if (blow <= 0) return;
		const { x, y } = manifold.points[0];
		// the normal runs from the first body to the second, so each is pushed
		// away from the other along it
		const a = contact.getFixtureA().getBody().getUserData();
		const b = contact.getFixtureB().getBody().getUserData();
		const { x: nx, y: ny } = manifold.normal;
		if (typeof a === 'number') hits.push({ car: cars[a], x, y, dx: -nx, dy: -ny, blow });
		if (typeof b === 'number') hits.push({ car: cars[b], x, y, dx: nx, dy: ny, blow });
	});

	// A truck is as solid as a car, and much heavier (recovery.ts): a car that
	// runs into it is knocked, and the truck hardly moves.
	const recovery = createRecovery(world, cars, track);
	/**
	 * The caution that is out: when it came out, and once the track is clear
	 * and the field together, when it started going green (0 until then).
	 */
	let caution: { since: number; going: number } | null = null;
	/** Under caution, the car the queue forms behind, and whether it has just crossed the line. */
	let pacer: Car | undefined;
	let atLine = false;
	/**
	 * Going green, the order the field lines up in two by two, leader first:
	 * the order it was in when it started to, of the cars within half a lap
	 * behind the leader. A car a lap down stays out of it, in the queue. It
	 * is kept until `settled`, a few seconds after the green, and after that
	 * by each car until it has the road to itself to move over in.
	 */
	let lineup: Car[] = [];
	let settled = 0;
	/** The cars that have left their line since, each once there was nobody alongside it in the other. */
	const merged = new Set<Car>();
	/** Whether the lineup has formed: every car in it near its place. Till then the leader holds the pace down. */
	let formed = false;
	/** Everything on the road this step: the cars, and the trucks that are out on the track. */
	let road: Obstacle[] = cars;
	/** How fast the leader brings the field round to the line, once it has lined up: quicker on a long lap, by up to half as much again. */
	const runIn = RUN_IN * clamp(length / USUAL_LAP, 1, 1.5);
	/** How many samples apart a driver looks at the road ahead to plan its speed: every couple of metres. */
	const rough = roughly(track);
	/** How many steps the race has run. */
	let ticks = 0;
	/** What a driver has just thought (plan.ts). */
	const thought: Thought = {
		aim: 0,
		spot: NaN,
		mate: -1,
		mateSide: 0,
		leader: -1,
		leadSpeed: 0,
		leadGap: 0
	};
	/** Whether a car is racing, out on the track. */
	const racing = (index: number) => !cars[index].retired && cars[index].lane < PIT.in;
	/** A second plan's speeds, to set against a car's own (plan.ts). */
	const other = new Float32Array(FAR + 1);

	/**
	 * Whether something is to be waited behind and not passed. Under caution
	 * that is a car still running, wherever across the road it is. It is also
	 * a truck on the move, and a wreck that is, until they have stopped or are
	 * off the track; and a truck with a wreck on board or on its crane, and
	 * that wreck, stopped or not. A truck that has stopped beside a wreck it
	 * has yet to lift is gone round, as the wreck is.
	 */
	const followed = (other: Obstacle) =>
		caution !== null &&
		// a car in the pits is not on the road at all
		!(other.lane! >= PIT.in) &&
		(!other.retired ||
			(Math.abs(other.across) < HALF_CORRIDOR && (Math.abs(other.speed) > 1 || other.towed)));

	/** How far from the middle of something a car going by it keeps: more for a wreck, which may be lying across the road, and more again for a truck at work on one. */
	const clearOf = (other: Obstacle) => CLEAR + (other.retired ? WRECK + (other.wide ?? 0) : 0);

	/**
	 * How far from the middle of something a car can get going by it on one
	 * side (1 the left, -1 the right), wanting `room`, short of the road
	 * running out.
	 */
	const passing = (other: Obstacle, side: number, room: number) =>
		Math.abs(clamp(other.across + side * room, -MAX_OFFSET, MAX_OFFSET) - other.across);

	/** The track sample a driver steers for: a little way ahead, further the faster it is going. */
	const aimed = (car: Car) =>
		(car.sample + Math.round((5 + Math.abs(car.speed) * 0.3) / spacing)) % n;

	/**
	 * The steering that keeps a car on the line it is taking, `held` (where
	 * that is at each sample). Steering for a point on it some way ahead, as
	 * a driver finding their way would, cuts the inside of every bend, and the
	 * faster the car the further ahead the point and the more it cuts. So it
	 * is steered the way the bend just ahead takes, with as much lock as that
	 * bends by, and corrected for how far it is to one side of the line and
	 * how far it is heading off it, enough to bring it back on within a few
	 * metres (HOLD) without swinging past. A car's tyres do not slide until
	 * they are asked for more than they have, so the lock a bend takes is
	 * simply the one that turns the car on an arc as tight as the bend.
	 */
	function hold(car: Car, held: (i: number) => [number, number]) {
		const { sample } = car;
		// the bend a little ahead, as far as the steering takes to wind on
		const lead = sample + Math.round((1 + Math.abs(car.speed) * 0.08) / spacing);
		const bend = curvature(...held(lead - SPAN), ...held(lead), ...held(lead + SPAN));
		// how far the car is to one side of the line (+ to the driver's right),
		// and how far it is heading off it
		const [bx, by] = held(sample - 1);
		const [fx, fy] = held(sample + 1);
		const way = Math.atan2(fy - by, fx - bx);
		const { x: vx, y: vy } = car.body.getLinearVelocity();
		// which way the car is going: where it is heading, as the wheels
		// would take it, until it is going fast enough to tell by that
		const going =
			Math.hypot(vx, vy) > 2
				? Math.atan2(vy, vx)
				: car.angle + Math.atan(Math.tan(car.steer) / 2) + (car.speed < 0 ? Math.PI : 0);
		const off = Math.atan2(Math.sin(going - way), Math.cos(going - way));
		const [hx, hy] = held(sample);
		const wide = ((car.x - hx) * track.nx[sample] + (car.y - hy) * track.ny[sample]) * track.hand;
		const want = bend - clamp(wide, -3, 3) / HOLD ** 2 - (1.8 * off) / HOLD;
		return Math.atan(2 * AXLE * want);
	}

	/** Metres from one track sample forward to another, the short way round: negative if it is behind. */
	const along = (from: number, to: number) => (((to - from + n * 1.5) % n) - n / 2) * spacing;

	/**
	 * How fast to go behind something `gap` metres ahead, to close up to
	 * `keep` metres behind it: and no faster than can be braked down to its
	 * speed in time, braking at `brake` (m/s², doubled). It creeps up at
	 * walking pace rather than stall, but not right up to something that has
	 * stopped, which a car would only nose into (a truck cannot be pushed out
	 * of the way), nor towards something coming back down the road: for
	 * those it stops. A car level with this one is no such thing: stopping
	 * for it while it gives way to this one would hold the two of them there
	 * for good. A wreck or a truck, though, gives way to nobody, and is not
	 * crept into while it edges along: it is waited behind.
	 */
	function approach({ speed, retired }: Obstacle, gap: number, keep: number, brake: number) {
		const slower = Math.max(0, speed);
		const stopping = gap > keep ? Math.sqrt(slower ** 2 + brake * (gap - keep)) : slower;
		// (nor does it creep into a wreck, or a truck, that is only edging along: it would only push it on)
		const crawl = speed < -1 || (gap > 2 && gap < keep - 2) || (retired && slower < 3) ? 0 : 3;
		return Math.max(crawl, Math.min(slower + (gap - keep) * 1.5, stopping));
	}

	/**
	 * How fast to go in a queue behind something, `gap` metres ahead, to close
	 * up to `keep` metres behind it. Under caution, where what is ahead may
	 * have all but stopped, braking for it at half what the tyres can take;
	 * racing, the queue is only ever a line of cars at speed.
	 */
	const queueing = (ahead: Obstacle, gap: number, keep = QUEUE) =>
		approach(ahead, gap, keep, caution ? QUEUE_BRAKE : Infinity);

	/**
	 * Just after the green, how fast to go behind the car ahead in the same
	 * line, `gap` metres ahead: the gap is let open with the speed, but by
	 * accelerating after it rather than braking. A car still a queue's gap
	 * back or more holds whatever speed the one ahead has, even with less room
	 * than it would want at that speed, since the rows cross the line a queue's
	 * gap apart and would otherwise all brake at once at the green.
	 */
	const opening = (ahead: Obstacle, gap: number, speed: number) =>
		Math.max(
			queueing(ahead, gap, QUEUE + speed * 0.5),
			Math.min(Math.max(0, ahead.speed), queueing(ahead, gap))
		);

	/**
	 * Going green, how far behind the leader each place in the lineup is: the
	 * one beside them a little way back, and each row a queue's gap behind the
	 * one in front.
	 */
	const slot = (place: number) => Math.floor(place / 2) * QUEUE + (place % 2) * 2;

	/** Whether there is a car in the other line near enough, ahead or behind, to be run into by moving over. */
	const alongside = (car: Car) =>
		cars.some(
			(other) =>
				other !== car &&
				!other.retired &&
				!other.finishTime &&
				other.lane === PIT.racing &&
				Math.abs(other.across - car.across) >= CLEAR &&
				Math.abs(along(car.sample, other.sample)) < SPLIT
		);

	/** How far behind the leader a car is, forward round the lap: one that has edged a little ahead of them is a little way behind. */
	function trailing(car: Car) {
		const behind = onRound(car.sample, pacer!.sample) * spacing;
		return behind > length - 20 ? behind - length : behind;
	}

	const race = {
		time: 0,
		done: false,
		flag: 'green' as Flag,
		/** How many laps the race is: more than it set out to be by each lap ended under caution. */
		laps: rules.laps,
		rules,
		cars,
		trucks: recovery.trucks,
		/** What has happened since the caller last emptied this. */
		events: [] as RaceEvent[],
		step,
		order: () => rank(cars)
	};

	/** Puts on the record what has happened, and flies the flag that goes with it. */
	function note(car: Car | null, what: Happening) {
		race.flag = flown(race.flag, what.kind);
		race.events.push({ ...what, time: race.time, car: car ? cars.indexOf(car) : -1 });
	}

	// The pit crews have their own run of random numbers, so the race is the
	// same with them as without until a car first does something about its
	// fuel or its tyres.
	const pits = createPits(cars, track, rules, random(seed ^ 0x51ed270b), {
		flag: () => race.flag,
		laps: () => race.laps,
		note,
		retire,
		trucks: recovery.trucks
	});

	function step() {
		if (race.done) return;
		race.time += DT;
		ticks++;
		for (const car of cars) locate(car);
		marshal();
		// the trucks do not move until the drivers have had their turn
		// (a wreck a truck has stopped beside to lift is part of the truck, to a driver)
		road = [...cars.filter((car) => !recovery.covers(car)), ...recovery.onTrack];
		for (const car of cars) drive(car);
		pits.step(race.time, race.time >= LIGHTS, DT);
		recovery.step(race.time, DT);
		world.step(DT, 8, 3);
		for (const hit of hits) dent(hit);
		hits.length = 0;
		for (const car of cars) {
			const at = car.body.getPosition();
			car.x = at.x;
			car.y = at.y;
			car.angle = car.body.getAngle();
		}
		recovery.sync();

		const running = cars.filter((car) => !car.retired);
		const won = Math.min(...cars.map((car) => car.finishTime || Infinity));
		race.done =
			running.every((car) => car.finishTime) ||
			race.time > won + AFTER_WINNER + (rules.pits ? AFTER_STOPS : 0) ||
			race.time > LIGHTS + timeCap(rules.laps, track.length);
	}

	/**
	 * Brings the caution out. Once the race has been won there is nothing
	 * left to neutralise. One already out stays out; if the field was going
	 * green, it is held under yellow again until the track is clear once more.
	 */
	function raise(wreck: Car | null) {
		if (cars.some((car) => car.finishTime)) return;
		if (caution && !caution.going) return;
		if (caution) {
			caution.going = 0;
			lineup = [];
			merged.clear();
			formed = false;
		} else {
			caution = { since: race.time, going: 0 };
			pacer = rank(cars.filter((car) => !car.retired))[0];
		}
		note(wreck, { kind: 'caution', by: wreck ? 'wreck' : 'control' });
	}

	/**
	 * Race control, each step: throws the cautions it was told to, and under
	 * one, names the car the queue forms behind. Once the track is clear and
	 * the field has closed up or has had long enough to, it is going green:
	 * the field lines up behind that car, and is given the green as it
	 * crosses the line, once the lines have formed or have had long enough to.
	 */
	function marshal() {
		if (race.time > LIGHTS && flags.some((at) => at > race.time - DT && at <= race.time)) {
			raise(null);
		}
		if (!caution) {
			// Once settled, each car leaves its line as soon as it has room to,
			// rather than the whole field diving for the same piece of road at
			// once, two by two, wherever it has got to (on the circuit, the
			// hairpin). One still alongside another by SETTLE_MAX goes anyway.
			if (lineup.length && race.time >= settled) {
				const loose = race.time >= settled - SETTLE + SETTLE_MAX;
				for (const car of lineup) if (loose || !alongside(car)) merged.add(car);
				if (lineup.every((car) => merged.has(car))) {
					lineup = [];
					merged.clear();
				}
			}
			return;
		}
		// a car in the pits is neither led nor waited for, unless they all are
		const running = cars.filter((car) => !car.retired && !car.finishTime);
		const racing = running.some((car) => car.lane < PIT.in)
			? running.filter((car) => car.lane < PIT.in)
			: running;
		// nor is one that is in the pits, or on its way there, held to a place in the lines
		if (lineup.some((car) => car.lane !== PIT.racing)) {
			lineup = lineup.filter((car) => car.lane === PIT.racing);
		}
		// lined up, the leader is the one at the head of the lineup, so the
		// one beside them does not take over by edging ahead
		pacer = (caution.going && lineup[0]) || rank(racing)[0];
		const out = race.time - caution.since;
		// closed up: from the leader back, nobody much more than a queue's gap behind the next
		const behind = racing.map((car) => onRound(car.sample, pacer!.sample)).sort((a, b) => a - b);
		const closed = behind.every((far, place) => place === 0 || far - behind[place - 1] < QUEUE + 5);
		// Going green once the track is clear and the field is together, and
		// from then on unless there is another wreck (which brings the yellow
		// back): the queue strings out a little as the leader picks up speed.
		// It starts lining up as soon as the last wreck is lifted, the truck
		// having a lap of the track to take it round yet, but is not given the
		// green until that is off the track too.
		if (!caution.going && recovery.away && out >= CAUTION_MIN && (closed || out >= CAUTION_MAX)) {
			caution.going = race.time;
			merged.clear();
			lineup = rank(racing).filter((car) => onRound(car.sample, pacer!.sample) < n / 2);
			formed = false;
			note(null, { kind: 'restart' });
		}
		// formed once every car is within a few metres of its place, however
		// many there are, and from then on: the leader picks up the pace
		formed ||=
			caution.going > 0 && lineup.every((car, place) => Math.abs(trailing(car) - slot(place)) < 3);
		// the green is only ever given at the line, and only to a field that
		// has lined up (or had long enough to): if it cannot be this time, it
		// is a lap more
		if (
			atLine &&
			caution.going &&
			recovery.clear &&
			(formed || race.time - caution.going >= RESTART_MAX)
		) {
			caution = null;
			settled = race.time + SETTLE;
			note(null, { kind: 'green' });
		}
		atLine = false;
	}

	/**
	 * Works out where on the track a car is, and counts its laps. A wreck is
	 * still followed as it coasts, so the drivers coming up on it see where
	 * it is now rather than where it gave up, but it completes no more laps.
	 */
	function locate(car: Car) {
		const at = car.body.getPosition();
		const sample = nearest(track, at.x, at.y, car.sample);
		let moved = sample - car.sample;
		if (moved > n / 2) moved -= n;
		if (moved < -n / 2) moved += n;
		car.sample = sample;
		car.across = lateral(track, at.x, at.y, sample);
		// a wreck on a truck is not driving anywhere
		if (!car.towed) car.progress += moved * spacing;

		const laps = Math.floor(car.progress / length);
		if (car.retired || laps <= car.laps) return;
		car.laps = laps;
		if (laps > 0) {
			const lap = race.time - car.lapStart;
			if (!car.bestLap || lap < car.bestLap) car.bestLap = lap;
			note(car, { kind: 'lap', lap });
			// The lap the leader ends under caution is run again, whether it
			// ends it on the track or in the pit lane, which the line runs
			// across too. The green is for the car the field is behind, as it
			// comes to the line on the track.
			const leads = cars.every(
				(other) => other.retired || other.finishTime > 0 || other.progress <= car.progress
			);
			if (caution && leads) {
				race.laps++;
				note(car, { kind: 'again' });
			}
			if (caution && car === pacer) atLine = true;
			// the race is never won under caution, even by a car beside the
			// leader that gets to the line first
			if (laps === race.laps && !caution) {
				car.finishTime = race.time;
				note(car, { kind: 'finish' });
			}
		}
		car.lapStart = race.time;
	}

	/** One step of a car's driver, and of the tyres carrying out what it asks. */
	function drive(car: Car) {
		const { body } = car;
		const velocity = body.getLinearVelocity();
		const heading = body.getWorldVector({ x: 1, y: 0 });
		car.speed = velocity.x * heading.x + velocity.y * heading.y;
		// A wreck on a truck goes where the truck takes it, and a car in the
		// pits where its crew sends it, with nothing sliding.
		if (car.towed || car.lane >= PIT.in) {
			car.slip = 0;
			return;
		}

		const offRoad = Math.abs(car.across) > HALF_ROAD;
		const grip = car.grip * (offRoad ? VERGE_GRIP : 1) * (1 - 0.2 * car.damage) * tyreGrip(car);
		car.fade = Math.sqrt(grip / car.grip);

		if (car.retired) {
			// Nobody is driving a wreck, but it is still on its wheels: they
			// grip the road sideways and drag along it, so it coasts to a stop
			// where it is rather than gliding on round the lap.
			const most = (grip * G * MASS) / 2;
			car.slip = Math.max(
				tyres(body, AXLE, 0, 0, WRECK_DRAG * most, most),
				tyres(body, -AXLE, 0, 0, WRECK_DRAG * most, most)
			);
		} else if (race.time >= LIGHTS + reaction[cars.indexOf(car)]) {
			// The car in the way: the nearest one ahead or alongside that the
			// racing line, or the line this car is taking now, would run into.
			// A wreck may be lying across the road, so it is given more room.
			// A truck, while it is out on the track, is one more thing to go
			// round. Whatever is being followed is not gone round at all: the
			// one ahead on the road is waited behind.
			const index = cars.indexOf(car);
			let blocker: Obstacle | undefined;
			const reach = 8 + car.speed * 1.2;
			let gap = reach;
			// and the nearest of what is being followed, which a wreck being
			// gone round may be nearer than, but which is waited behind all the same
			let queued: Obstacle | undefined;
			let queue = Infinity;
			/** How near the cars racing just ahead of it and just behind it are (m). */
			let chasing = Infinity;
			let chased = Infinity;
			for (const other of road) {
				if (other === car) continue;
				const ahead = along(car.sample, other.sample);
				if (!other.retired && other.lane! < PIT.in) {
					if (ahead > 0) chasing = Math.min(chasing, ahead);
					else if (ahead < 0) chased = Math.min(chased, -ahead);
				}
				const waits = followed(other);
				const infront = ahead > 0 || (ahead === 0 && cars.indexOf(other as Car) < index);
				if (waits && infront && ahead < queue) {
					queued = other;
					queue = ahead;
				}
				if (ahead < -5 || Math.abs(ahead) >= Math.abs(gap)) continue;
				const room = clearOf(other);
				const line = track.line[other.sample];
				if (
					waits
						? ahead < 0 || (ahead === 0 && cars.indexOf(other as Car) > index)
						: Math.abs(line - other.across) >= room &&
							Math.abs(line + car.offset - other.across) >= room
				) {
					continue;
				}
				blocker = other;
				gap = ahead;
			}
			let offset = 0;
			/** Where across the road it is making for, where that is a place on the road and not one beside the racing line. */
			let fixed: number | null = null;
			let limit = Infinity;
			// Under caution, a wreck on the road, or a truck stopped at work, is
			// gone by slowly, and slowed for in good time, by a car on its side of
			// the road; and two by two, the lines go by it, or wait behind it,
			// single file.
			let funnel = false;
			if (caution) {
				for (const other of road) {
					if (!other.retired || other.lane! >= PIT.in) continue;
					const apart = Math.abs(other.across - car.across);
					const room = clearOf(other);
					if (apart >= room + CLEAR) continue;
					const ahead = along(car.sample, other.sample);
					if (ahead <= -PAST || ahead >= SIGHT) continue;
					funnel = true;
					if (followed(other)) continue;
					// (slower still where it leaves little room)
					const tight = clamp((apart - CLEAR) / (room - CLEAR), 0.4, 1);
					const slowing = Math.max(0, ahead - PAST);
					limit = Math.min(limit, Math.sqrt((GO_BY * tight) ** 2 + (QUEUE_BRAKE / 2) * slowing));
				}
			}
			const place = funnel || merged.has(car) ? -1 : lineup.indexOf(car);
			/** Whether it is on its way round a wreck, or a truck, which comes before making for the pits. */
			let rounding = false;
			/** Whether it is keeping beside another car, wherever that one's path goes. */
			let mated = false;
			/** Whether the driver is finding its own way through the traffic (plan.ts), as it does racing. */
			const weighing = place < 0 && !caution && !blocker?.retired;
			if (!weighing) {
				car.way = car.aim;
				car.waySpot = car.spot;
				car.wayMate = -1;
				car.leader = -1;
			}
			if (place >= 0) {
				// Going green, two by two: the leader on one side of the road and
				// the one beside them on the other, each in its place. Anything in
				// the other line is no more in the way than a car being passed.
				// Just after the green each car still keeps to its line, but races,
				// and lets the gap to the one ahead in it open with the speed, so a
				// big field is strung out by the time the lines merge.
				fixed = LANE * (place % 2 ? -1 : 1);
				offset = fixed - track.line[aimed(car)];
				if (caution && place > 0) limit = queueing(pacer!, trailing(car), slot(place));
				// It queues behind whatever is ahead of it in its own line, the
				// cars still moving across into theirs included (but not a wreck
				// that has been left off the road).
				for (const other of road) {
					if (other === car || (other.retired && !followed(other))) continue;
					if (Math.abs(other.across - car.across) >= CLEAR) continue;
					const ahead = along(car.sample, other.sample);
					if (ahead <= 0 || ahead > 40 + car.speed) continue;
					limit = Math.min(
						limit,
						caution ? queueing(other, ahead) : opening(other, ahead, car.speed)
					);
				}
			} else if (weighing) {
				// Racing, a driver with cars around thinks a few times a second
				// which way to go, each in turn: on the line, round the car ahead
				// on one side or the other, or where it is. It runs each forward
				// against where the others are going, and takes the one that gets
				// it furthest without running into anybody.
				if ((ticks + index) % PONDER === 0) {
					think(track, cars, index, racing, CLEAR, MAX_OFFSET, SIDLE, thought);
					car.way = thought.aim;
					car.waySpot = thought.spot;
					car.wayMate = thought.mate;
					car.wayMateSide = thought.mateSide;
					car.leader = thought.leader;
					car.leadSpeed = thought.leadSpeed;
					car.leadPoint = car.progress + thought.leadGap;
				}
				offset = car.way;
				if (car.wayMate >= 0 && racing(car.wayMate)) {
					// beside a car: where that car's path is, a little way ahead, and clear of it
					mated = true;
					const theirs = pathOf(track, cars, cars[car.wayMate], aimed(car), CLEAR, MAX_OFFSET);
					fixed = clamp(theirs + car.wayMateSide * CLEAR, -MAX_OFFSET, MAX_OFFSET);
					offset = fixed - track.line[aimed(car)];
				} else if (!Number.isNaN(car.waySpot)) {
					fixed = car.waySpot;
					offset = fixed - track.line[aimed(car)];
				}
				// The car it means to drop in behind, it slows for as late as it
				// can and still be down to that car's speed where it drops in: a
				// driver who lifts as soon as it sees it will be held up never
				// gets alongside anybody.
				if (car.leader >= 0 && racing(car.leader)) {
					const room = Math.max(0, car.leadPoint - car.progress - 1);
					limit = Math.max(3, Math.sqrt(car.leadSpeed ** 2 + grip * G * room));
					// (and nearer it already than it is followed, it drops back)
					const leader = cars[car.leader];
					const ahead = along(car.sample, leader.sample);
					if (ahead > 0 && ahead < car.follow)
						limit = Math.min(limit, Math.max(3, leader.speed + (ahead - car.follow) * 1.5));
				}
				// and the one it is tucked in behind now, it keeps its distance from
				for (const other of cars) {
					if (other === car || other.retired || other.lane >= PIT.in) continue;
					const ahead = along(car.sample, other.sample);
					if (ahead <= 0 || ahead >= reach) continue;
					const tucked = track.bend[other.sample] < STRAIGHT ? 0.7 : 1.5;
					if (Math.abs(car.across - other.across) < tucked)
						limit = Math.min(limit, Math.max(3, approach(other, ahead, car.follow, grip * G)));
				}
			} else if (blocker && !followed(blocker)) {
				// Go round it on whichever side is nearer the line already held, of
				// those with room. A wreck lying near the middle of the road may leave
				// the full room on neither: then it is the side with the more, or the
				// car would sit behind it and push it on down the road.
				const room = clearOf(blocker);
				const line = track.line[blocker.sample];
				let sides = [blocker.across + room - line, blocker.across - room - line].filter(
					(o) => Math.abs(line + o) <= MAX_OFFSET
				);
				if (!sides.length && blocker.retired) {
					const way = passing(blocker, 1, room) >= passing(blocker, -1, room) ? 1 : -1;
					sides = [blocker.across + way * passing(blocker, way, room) - line];
				}
				sides.sort((p, q) => Math.abs(p - car.offset) - Math.abs(q - car.offset));
				// Once to one side of it, stay there, even where the road runs out
				// on that side: crossing back behind it throws the move away, and
				// a car alongside will be given room. A wreck or a truck gives
				// none, though, so where there is too little on the side taken and
				// more on the other, cross over behind it: at a hairpin, where the
				// line runs along the outside edge, a wreck there leaves no way by
				// outside it. But until close enough to be held up, keep to its
				// wheel tracks, which are quicker than any way round it, and in
				// its tow; and behind a car in a bend, stay there until the road
				// straightens (STRAIGHT). Close enough is a few car lengths
				// back, so it pulls out with the tow's speed and room to use it.
				const apart = car.across - blocker.across;
				let side = Math.sign(apart);
				const here = passing(blocker, side, room);
				if (blocker.retired && here < room && passing(blocker, -side, room) > here + 0.5)
					side = -side;
				const closing = Math.max(0, car.speed - Math.max(0, blocker.speed));
				if (
					gap < car.follow + (blocker.retired ? 3 : 8) + closing * 1.5 &&
					(blocker.retired || Math.abs(apart) > 1 || track.bend[blocker.sample] < STRAIGHT)
				) {
					offset = Math.abs(apart) > 1 ? blocker.across + side * room - line : (sides[0] ?? 0);
					rounding = blocker.retired;
				}
				// And hold back while tucked in behind it, slowing in time to be
				// no faster than it by the following distance, which matters most
				// when it is a wreck. A car most of the way out to one side goes
				// for the gap: it may rub, but it does not sit and wait. On a
				// straight, where it pulls out to pass, a little way out is enough
				// (in a bend, it would only run into the back of the car ahead).
				// Nor does one tucked in behind a wreck stop as a queue would:
				// creeping on is how it gets round, as a stopped car cannot steer.
				const tucked = track.bend[blocker.sample] < STRAIGHT ? 0.7 : 1.5;
				if (gap > 0 && Math.abs(apart) < (blocker.retired ? room : tucked))
					limit = Math.max(3, approach(blocker, gap, car.follow, grip * G));
			}
			// and in the queue behind whatever is being followed, if anything is
			// (seen from further off when it is a wreck or a truck, which may be standing still)
			const sight = caution && queued?.retired ? SIGHT : reach;
			if (place < 0 && queued && queue < sight) limit = Math.min(limit, queueing(queued, queue));
			// called in: to the inside, and slowing for the way into the pits
			const bound = pits.call(car);
			if (bound) limit = Math.min(limit, bound.limit);
			// Under caution the tow truck is let by: with it coming up behind,
			// or alongside, a car keeps out of its way until it has gone, even
			// one that was making for the pits, which will come round again. It
			// moves over only as far as it has to, to the side of the truck it
			// is on if there is room there: thrown right across the road, in a
			// bend, it would run on into the wall. One that has stopped beside a
			// wreck is gone round, either side.
			// (One on its way round a wreck goes on round it: the truck waits behind it.)
			const line = track.line[aimed(car)];
			let letBy = false;
			if (caution && !rounding) {
				for (const truck of recovery.onTrack) {
					const clear = along(truck.sample, car.sample);
					if (truck.speed <= 1 || clear <= -8 || clear >= GIVE_WAY) continue;
					letBy = true;
					const apart = car.across - truck.across;
					let side = apart === 0 ? 1 : Math.sign(apart);
					// (but not by crossing in front of it, with it close behind: it will wait behind this car)
					if (passing(truck, side, MAKE_WAY) < MAKE_WAY && clear > GIVE_WAY / 2) side = -side;
					const room = clamp(truck.across + side * MAKE_WAY, -MAX_OFFSET, MAX_OFFSET);
					offset = side > 0 ? Math.max(offset, room - line) : Math.min(offset, room - line);
				}
				if (letBy) fixed = line + offset;
			}
			/** Whether it is on its way into the pits, on the line and at the speed the pits give it for that (pits.ts). */
			let pitting = false;
			if (!letBy && !rounding && bound && bound.across !== null) {
				pitting = true;
				fixed = bound.across;
				offset = bound.across - line;
			}
			// Leave room for a car alongside rather than turn in on it: the one
			// on the inside keeps the inside, and the one being passed has to
			// give up the line. Where that runs out of road, lift and let it
			// through rather than be squeezed onto the verge. (Under caution,
			// where two may be all but stopped dead level, only one of them
			// does, or neither would ever go: the one further down the grid.)
			for (const other of cars) {
				if (other === car || other.retired) continue;
				const ahead = along(car.sample, other.sample);
				const apart = car.across - other.across;
				if (Math.abs(ahead) >= 4 || Math.abs(apart) >= CLEAR + 0.5) continue;
				const room = other.across + Math.sign(apart) * CLEAR;
				const asked = offset;
				offset =
					apart > 0
						? Math.max(offset, room - track.line[car.sample])
						: Math.min(offset, room - track.line[car.sample]);
				if (offset !== asked) fixed = room;
				const yields = ahead > 0 || (ahead === 0 && (!caution || cars.indexOf(other) < index));
				if (Math.abs(room) > MAX_OFFSET + 0.3 && yields)
					limit = Math.min(limit, Math.max(0, other.speed) - 1);
			}
			// (no further beside the line than there is road for)
			const lineAhead = track.line[aimed(car)];
			offset = clamp(offset, -MAX_OFFSET - lineAhead, MAX_OFFSET - lineAhead);
			car.offset = clamp(car.offset, -MAX_OFFSET - lineAhead, MAX_OFFSET - lineAhead);
			const making = offset;
			car.aim = making;
			car.spot = fixed ?? NaN;
			car.mate = mated ? car.wayMate : -1;
			car.mateSide = car.wayMateSide;
			car.offset += clamp(offset - car.offset, -SIDLE * DT, SIDLE * DT);

			// where the line, or the line this car is taking, is at a sample
			const held = (i: number): [number, number] => {
				const k = ((i % n) + n) % n;
				const across = clamp(track.line[k] + car.offset, -MAX_OFFSET, MAX_OFFSET);
				return [track.x[k] + track.nx[k] * across, track.y[k] + track.ny[k] * across];
			};
			// Which way to go, roughly: for a point on it a little way ahead.
			// That is how a car facing the wrong way, or backing off something,
			// finds its way; one on its way round follows the line itself.
			const ahead = aimed(car);
			const [aimX, aimY] = held(ahead);
			const aim = body.getLocalPoint({ x: aimX, y: aimY });
			const bearing = Math.atan2(aim.y, aim.x);
			let steer = Math.atan2(4 * AXLE * Math.sin(bearing), Math.hypot(aim.x, aim.y));
			if (Math.abs(bearing) < 1.2 && race.time >= car.reverseUntil) steer = hold(car, held);

			// Off the line, the arc through a bend is tighter on the inside and
			// wider on the outside, and so is the speed it can be taken at.
			const inside = (car.across - track.line[car.sample]) * track.turn[car.sample];
			const arc = Math.sqrt(clamp(1 - track.bend[car.sample] * inside, 0.5, 1.5));
			// The speed for here, or for a moment from now if that is less: a
			// driver starts braking a beat before the braking point, since the
			// car takes that long to slow once they do.
			const soon = (car.sample + Math.round((Math.abs(car.speed) * BEAT) / spacing)) % n;
			const fade = Math.sqrt(grip / car.grip);
			let want = Math.min(car.pace[car.sample], car.pace[soon]) * fade * arc;
			// Off the racing line, or on its way off it, the pace is not the
			// speed for the road ahead: the driver works that out for the path
			// the car is going to take (plan.ts), which is across the road to
			// where it is making for, no faster than it moves over, and then
			// along there: beside the line, or at a place on the road.
			if ((Math.abs(car.offset) > OFF_LINE || Math.abs(making) > OFF_LINE) && !pitting) {
				// (thought through again a few times a second, each driver in turn, and at once if the car is past the end of the last plan)
				let on = (car.sample - car.planFrom + n) % n;
				const looks = Math.round((Math.abs(car.speed) * BEAT) / spacing);
				if (!car.planFar || on + looks >= car.planFar || (ticks + index) % RETHINK === 0) {
					// Where it is making for: a place on the road, or beside the
					// line. It is planned for as if the car were there already, as it
					// soon will be, since it is slowed for in good time or not at all.
					const from = car.sample;
					const most = car.limit * fade * fade;
					const beside = (off: number) => (k: number) =>
						clamp(track.line[(from + k + n) % n] + off, -MAX_OFFSET, MAX_OFFSET);
					const there = clamp(fixed ?? 0, -MAX_OFFSET, MAX_OFFSET);
					const path = mated
						? (k: number) => pathOf(track, cars, car, (from + k + n) % n, CLEAR, MAX_OFFSET)
						: fixed !== null
							? () => there
							: beside(making);
					car.planFar = speedsAlong(track, from, car.speed, path, most, car.pace, fade, car.plan, rough);
					// And while it is still a way from there, for where it is now as
					// well, the slower of the two: beside the line, or making for a
					// place on the road, at the place on it that it has got to.
					const here = clamp(track.line[from] + car.offset, -MAX_OFFSET, MAX_OFFSET);
					const now = clamp(car.across, -MAX_OFFSET, MAX_OFFSET);
					const stay =
						fixed !== null
							? Math.abs(there - now) > 0.5 && (() => now)
							: Math.abs(track.line[from] + making - here) > 0.5 && beside(car.offset);
					if (stay) {
						speedsAlong(track, from, car.speed, stay, most, car.pace, fade, other, rough);
						for (let k = 0; k <= car.planFar; k++) car.plan[k] = Math.min(car.plan[k], other[k]);
					}
					car.planFrom = from;
					on = 0;
				}
				want = Infinity;
				for (let k = on; k <= Math.min(on + looks, car.planFar); k++) want = Math.min(want, car.plan[k]);
			} else {
				car.planFar = 0;
			}
			// What the tyres have left after cornering is all there is to
			// accelerate or brake with.
			const cornering = Math.min(1, (car.speed ** 2 * track.bend[car.sample]) / (grip * G));
			// Mistakes. A driver makes one every so often by its own clock,
			// which runs faster the more it has on its mind: a car right behind
			// it, or one it is right behind, tyres going off, a car knocked
			// about. Which mistake it is depends on what it is doing when it is
			// due. Braking for a corner, it brakes late, and arrives too fast.
			// Cornering hard, it gets on the power too soon and too hard for the
			// back tyres, or twitches at the wheel. On a straight, it fluffs a
			// gear change, and coasts for a moment. Most cost a little time, and
			// the car behind a chance; now and then one ends in the wall.
			const prone = !caution && !car.finishTime && car.lane === PIT.racing;
			let made = false;
			if (prone) {
				const second = Math.max(car.speed, 10);
				car.errorClock +=
					DT *
					(1 +
						CHASED * clamp(1 - chased / second, 0, 1) +
						CHASING * clamp(1 - chasing / second, 0, 1) +
						WORN * car.wear +
						HURT * car.damage);
			}
			if (prone && car.errorClock >= car.errorAt && race.time >= car.errorUntil) {
				// It is the mistake that was coming (`errorKind`), once the driver is
				// doing what that one is made doing; or, if it has not been for a
				// while, whichever one it can make now.
				const overdue = car.errorClock >= car.errorAt + PATIENT;
				const braking = car.speed > want + 0.5;
				const leaning = cornering > 0.45 && car.speed > 8;
				let kind = car.errorNext;
				if (overdue) kind = braking ? SLIP.late : leaning ? SLIP.twitch : SLIP.fluff;
				const now =
					kind === SLIP.late
						? braking
						: kind === SLIP.fluff
							? !braking && !leaning
							: leaning && !braking;
				if (now) {
					const size = rand() ** 2;
					car.errorKind = kind;
					if (kind === SLIP.late) {
						car.errorUntil = race.time + 0.3 + rand() ** 2 * 0.7;
						car.errorBy = 1 + SEVERE * (0.07 + size * 0.2);
					} else if (kind === SLIP.greedy) {
						car.errorUntil = race.time + 0.4 + rand() * 0.5;
						car.errorBy = Math.max(0.25, 1 - SEVERE * (0.2 + size * 0.35));
					} else if (kind === SLIP.twitch) {
						car.errorUntil = race.time + 0.15 + rand() * 0.2;
						car.errorBy = (rand() < 0.5 ? -1 : 1) * SEVERE * (0.1 + size * 0.2);
					} else {
						car.errorUntil = race.time + 0.4 + size * 0.7;
					}
					made = true;
				}
			}
			if (made) {
				// and the next one that is coming, and when
				car.errorAt = car.errorClock - Math.log(1 - rand()) * car.errorEvery;
				const which = rand();
				car.errorNext =
					which < 0.45 ? SLIP.late : which < 0.65 ? SLIP.fluff : which < 0.85 ? SLIP.greedy : SLIP.twitch;
			}
			/** The mistake being made, if one is (SLIP), else -1. */
			const slip = race.time < car.errorUntil ? car.errorKind : -1;
			if (slip === SLIP.late) want *= car.errorBy;
			if (caution) {
				// nobody stands on the brakes at the flag: the speed allowed comes
				// down over a few seconds, so the cars behind are not caught out
				const easing = 32 - 6 * (race.time - caution.since);
				// (On a long lap the run to the line, once the lines have formed, is
				// quicker in proportion, and so are the cars keeping up with it.
				// But a long lap is one with corners in it that string the lines
				// out, so the leader eases right down for the last of it, and the
				// rest close up on it before the green.)
				const toLine = ((n - pacer!.sample) % n) * spacing;
				const run =
					runIn > RUN_IN
						? lerp(CLOSE_UP, runIn, clamp((toLine - EASE) / (2 * EASE), 0, 1))
						: RUN_IN;
				const held =
					car !== pacer
						? caution.going
							? FORM + (formed ? Math.max(0, run - RUN_IN) : 0)
							: CATCH
						: formed
							? run
							: PACE;
				want = Math.min(want, Math.max(held, easing));
			}
			const corner = want;
			want = Math.min(want, limit);
			// facing the wrong way: turn round slowly
			if (Math.abs(bearing) > 1.2) want = Math.min(want, 5);
			if (car.finishTime) want = Math.min(want, 12);

			// Into a corner too fast, a driver still brakes a little even with
			// nothing left, giving up some line to scrub off speed rather than
			// run on into the wall.
			const spare = Math.sqrt(1 - cornering ** 2) * car.nerve;
			let throttle = 0;
			let brake = 0;
			if (car.speed > want + 0.5) {
				// a car ahead gets the brakes harder and sooner than a corner does
				brake = Math.min((car.speed - want) / (limit < corner ? 1.5 : 4), spare + 0.25, 1);
			} else if (caution && want < 0.5 && car.speed > 0) {
				// told to stop, in a queue under caution: on the brakes, not rolling on into the car ahead
				brake = 1;
			} else {
				throttle = Math.min(clamp((want - car.speed) / 2, 0, 1), pits.lift(car));
			}
			// (a gear change fluffed: nothing from the engine till it is found)
			if (slip === SLIP.fluff) throttle = 0;
			// (on the power too soon: all of it, and no thought for the tyres)
			if (slip === SLIP.greedy && throttle > 0) throttle = 1;

			// stopped against something: back away from it (but not when
			// stopped on purpose, waiting in a queue)
			if (race.time < car.reverseUntil) {
				throttle = -1;
				brake = 0;
				steer = -steer;
			} else {
				// (and nosing a wreck on down the road is being stuck against it,
				// however slowly the two of them are going)
				const shoving =
					caution !== null &&
					blocker?.retired &&
					gap < 2 * NOSE + 1 &&
					Math.abs(car.across - blocker.across) < 1.5 &&
					Math.abs(blocker.speed) > 0.3 &&
					car.speed < 2.5 &&
					// (a wreck, that is, not a truck)
					'body' in blocker;
				const stalled = Math.abs(car.speed) < 1 || shoving;
				car.stuck = stalled && want > 1 ? car.stuck + DT : 0;
				if (car.stuck > 1) {
					car.stuck = 0;
					car.reverseUntil = race.time + 1.4;
				}
			}

			// bent bodywork at the front pulls the steering to one side
			const bent = Math.abs(car.hull[1] - HULL[1]) - Math.abs(car.hull[15] - HULL[15]);
			steer = clamp(
				steer + bent * 0.1 + (slip === SLIP.twitch ? car.errorBy : 0),
				-MAX_STEER,
				MAX_STEER
			);
			car.steer += clamp(steer - car.steer, -3 * DT, 3 * DT);

			// the engine pushes the rear axle, as hard as its power allows at
			// this speed and no harder than the rear tyres can take
			const most = (grip * G * MASS) / 2;
			// with nothing in the tank there is no engine to speak of
			const engine =
				car.fuel > 0 ? Math.min(11000, car.power / Math.max(Math.abs(car.speed), 8)) : 0;
			pits.use(car, throttle, cornering, DT);
			const push =
				throttle < 0
					? -4000
					: Math.min(
							throttle * engine * (1 - 0.35 * car.damage),
							most * (slip === SLIP.greedy ? 1 : spare)
						);
			const stop = brake * most;
			// (back tyres that are spinning do not hold the car sideways as they did)
			const back = slip === SLIP.greedy ? most * car.errorBy : most;
			car.slip = Math.max(
				tyres(body, AXLE, car.steer, 0, stop, most),
				tyres(body, -AXLE, 0, Math.min(push, back), stop, back)
			);
		} else {
			// held on the grid until the lights go out
			tyres(body, AXLE, 0, 0, 1e5, 1e5);
			tyres(body, -AXLE, 0, 0, 1e5, 1e5);
		}

		// Air and rolling resistance, and the drag of the verge. Behind another
		// car the air is already moving, so there is less of it to push: the
		// tow that lets a quicker car draw alongside on a straight. It is felt
		// from a long way back, and still as the car pulls out to pass, or the
		// short straights would leave a quicker car stuck behind for good.
		// Under caution, though, with the field nose to tail and braking for
		// wrecks, a tow like that only carries each car on into the one ahead:
		// there it is only felt close behind, as a gentle one.
		const [wide, felt, cut] = caution ? [1.6, 25, 0.7] : [2.5, 80, 0.9];
		let tow = 0;
		for (const other of cars) {
			if (other === car || other.retired) continue;
			const ahead = along(car.sample, other.sample);
			if (ahead > 0 && Math.abs(other.across - car.across) < wide)
				tow = Math.max(tow, 1 - ahead / felt);
		}
		const air = 2.2 * (1 - cut * tow);
		const drag = 30 + air * Math.hypot(velocity.x, velocity.y) + (offRoad ? 400 : 0);
		body.applyForceToCenter({ x: -velocity.x * drag, y: -velocity.y * drag });
	}

	/** Dents a car where it was hit, and retires it once it has had enough. */
	function dent({ car, x, y, dx, dy, blow }: (typeof hits)[number]) {
		const at = car.body.getLocalPoint({ x, y });
		const into = car.body.getLocalVector({ x: dx, y: dy });
		const depth = (blow * 0.06) / car.tough;
		for (let k = 0; k < HULL.length; k += 2) {
			const near = 1 - Math.hypot(car.hull[k] - at.x, car.hull[k + 1] - at.y) / 1.6;
			if (near <= 0) continue;
			let mx = car.hull[k] + into.x * depth * near - HULL[k];
			let my = car.hull[k + 1] + into.y * depth * near - HULL[k + 1];
			const moved = Math.hypot(mx, my);
			if (moved > MAX_DENT) {
				mx *= MAX_DENT / moved;
				my *= MAX_DENT / moved;
			}
			car.hull[k] = HULL[k] + mx;
			car.hull[k + 1] = HULL[k + 1] + my;
		}
		reshape(car);
		const wrecked = car.retired;
		// (rules kept from before there was a dial for it do what a knock did then)
		const harm = rules.damage ?? 1;
		if (!wrecked) car.damage = Math.min(1, car.damage + (harm * blow) / (5 * car.tough));
		note(car, { kind: 'hit', x, y, force: blow + SHRUG, damage: car.damage });
		if (wrecked || car.damage < 1) return;
		retire(car);
	}

	/** Puts a car out of the race where it is: wrecked, or out of fuel. */
	function retire(car: Car) {
		car.retired = true;
		car.slip = 0;
		car.body.setLinearDamping(1.5);
		car.body.setAngularDamping(2.5);
		note(car, { kind: 'retire' });
		// A wreck on the track: the truck is sent for it and the race is
		// neutralised. One that happens after the race is won lies where it is.
		if (cars.some((car) => car.finishTime)) return;
		recovery.call(car, race.time);
		raise(car);
	}

	return race;
}

/**
 * The speed to hold at each track sample: as fast as cornering grip `limit`
 * (m/s²) allows round each bend, slowing early enough to make the next one.
 */
function paceFor(track: Track, limit: number) {
	const { n, step, bend } = track;
	const pace = new Float32Array(n);
	for (let i = 0; i < n; i++) pace[i] = Math.min(60, Math.sqrt(limit / Math.max(bend[i], 1e-4)));
	// backwards round the lap, twice so the limit carries across the line
	for (let k = 2 * n - 1; k >= 0; k--) {
		const i = k % n;
		const next = pace[(i + 1) % n];
		// braking has only the grip that cornering is not using
		const braking = 0.9 * Math.sqrt(Math.max(0, limit ** 2 - (next ** 2 * bend[i]) ** 2));
		pace[i] = Math.min(pace[i], Math.sqrt(next ** 2 + 2 * braking * step));
	}
	return pace;
}

/** Rebuilds a car's collision shape from its outline: three boxes, nose to tail. */
function reshape(car: Car) {
	for (const fixture of car.fixtures) car.body.destroyFixture(fixture);
	car.fixtures = [0, 1, 2].map((k) =>
		car.body.createFixture({
			shape: new PolygonShape(
				[k, k + 1, 6 - k, 7 - k].map((v) => ({ x: car.hull[v * 2], y: car.hull[v * 2 + 1] }))
			),
			density: 1,
			friction: 0.3,
			restitution: 0.15
		})
	);
	// dents do not make the car any lighter
	car.body.setMassData({ mass: MASS, center: { x: 0, y: 0 }, I: INERTIA });
}

/**
 * One axle's tyres for one step. They stop the axle sliding sideways and
 * apply `push` (N, along the wheels) and up to `stop` (N) of braking, but
 * can pass no more than `most` (N) to the road in total; asked for more,
 * they slide. Returns how fast they are left sliding sideways, in m/s.
 */
function tyres(body: Body, at: number, steer: number, push: number, stop: number, most: number) {
	const point = body.getWorldPoint({ x: at, y: 0 });
	const along = body.getWorldVector({ x: Math.cos(steer), y: Math.sin(steer) });
	const sideX = -along.y;
	const sideY = along.x;
	const velocity = body.getLinearVelocityFromWorldPoint(point);
	const centre = body.getWorldCenter();
	const arm = (point.x - centre.x) * sideY - (point.y - centre.y) * sideX;
	// the impulses that would stop the axle's sideways slide outright, and
	// brake its roll without reversing it
	const drift = velocity.x * sideX + velocity.y * sideY;
	let sideways = -drift / (1 / MASS + arm ** 2 / INERTIA);
	const rolling = velocity.x * along.x + velocity.y * along.y;
	let forward = push * DT + clamp((-rolling * MASS) / 2, -stop * DT, stop * DT);
	const asked = Math.hypot(sideways, forward);
	const limit = most * DT;
	// the share of what was asked that the tyres deliver; sliding tyres grip
	// a little less than rolling ones
	const held = asked > limit ? (0.9 * limit) / asked : 1;
	sideways *= held;
	forward *= held;
	body.applyLinearImpulse(
		{ x: sideX * sideways + along.x * forward, y: sideY * sideways + along.y * forward },
		point,
		true
	);
	// whatever sideways movement they could not stop is rubber sliding on road
	return Math.abs(drift) * (1 - held);
}
