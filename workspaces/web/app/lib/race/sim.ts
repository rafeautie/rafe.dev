import { ChainShape, PolygonShape, World, type Body, type Fixture } from 'planck';
import { createRecovery } from './recovery';
import type { Entry } from './roster';
import { ahead as onRound } from './service';
import { HALF_CORRIDOR, HALF_ROAD, MAX_OFFSET, TRACK, clamp, lateral, nearest } from './track';

// One race, start to finish. Each car is a rigid body pushed around by its
// two axles' tyres, which grip up to a limit and slide past it, and steered
// by a driver that follows the racing line, brakes for corners, goes round
// traffic and now and then gets it wrong. Hard knocks dent the bodywork for
// good and add up to a retirement. The same seed always runs the same race.
//
// A retirement brings out a caution: the whole field slows, closes up into a
// queue behind the leader and holds its order while a truck fetches the wreck
// (recovery.ts). Race control can throw one by hand as well. The race goes
// green again as the leader crosses the finish line, once the track is clear
// and the field has closed up. A lap the leader ends under caution is not one
// of the race's: it is run again, so the race is that much longer and is
// never won under caution.

export const DT = 1 / 60;
export const LAPS = 3;
/** Seconds the cars sit on the grid before the start. */
export const LIGHTS = 2;
/** The race is called off this long after the start, whoever is still out. A caution or two fits inside it. */
export const TIME_CAP = 240;
/** Once someone has won, the rest get this long to finish. */
const AFTER_WINNER = 8;

const G = 9.81;
const MASS = 1000;
const INERTIA = 1800;
/** Centre of the car to each axle. */
const AXLE = 1.3;
const MAX_STEER = 0.55;
/** Grip on the verge, as a share of grip on tarmac. */
const VERGE_GRIP = 0.6;
/** Sideways room one car leaves another when passing, centre to centre. */
const CLEAR = 2.5;
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
/** How far apart the queue runs, middle to middle. */
const QUEUE = 8;
/** A caution lasts at least this long, and the field is given no longer than this to close up before it is let go at the line anyway. */
const CAUTION_MIN = 8;
const CAUTION_MAX = 25;
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
	/** A wreck the truck has hold of, or has taken away. */
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
	errorEvery: number;
	/** The speed to be doing at each track sample to make the corners. */
	pace: Float32Array;
	offset: number;
	errorAt: number;
	errorUntil: number;
	/** How much too fast the driver takes the corner they misjudge, as a share of the right speed. */
	errorBy: number;
	stuck: number;
	reverseUntil: number;
};

type Happening =
	/** A knock: where, how hard (the m/s it took off the car), and the car's damage after it. */
	| { kind: 'hit'; x: number; y: number; force: number; damage: number }
	/** A lap completed, and the seconds it took. */
	| { kind: 'lap'; lap: number }
	| { kind: 'retire' | 'finish' }
	/** The caution comes out, for a wreck or because race control threw it, and goes back in. */
	| { kind: 'caution'; by: 'wreck' | 'control' }
	| { kind: 'green' }
	/** The leader ends a lap under caution: it does not count, and the race is a lap longer. */
	| { kind: 'again' };

/**
 * Something that happened to a car (an index into `cars`) at a race time.
 * What happens to the race and not to a car, a caution without a wreck and
 * every green, has -1 for the car.
 */
export type RaceEvent = Happening & { time: number; car: number };

/** The flag flying: green while it is raced, yellow under caution, checkered once it has been won. */
export type Flag = 'green' | 'yellow' | 'checkered';

/** The flag flying after something has happened, given the one that was. */
export const flown = (flag: Flag, kind: RaceEvent['kind']): Flag =>
	kind === 'caution'
		? 'yellow'
		: kind === 'green'
			? 'green'
			: kind === 'finish'
				? 'checkered'
				: flag;

/**
 * Something on the road, as a driver sees it: where it is, how fast it is
 * going, whether it is a wreck, and whether it is on a truck's cable. A truck
 * out on the track is one, and is gone round like a wreck.
 */
type Obstacle = Pick<Car, 'sample' | 'across' | 'speed' | 'retired' | 'towed'>;

export type Race = ReturnType<typeof createRace>;

/** Which way the track bends at each sample: 1 to the left, -1 to the right. */
const TURN = TRACK.tx.map((tx, i) => {
	const j = (i + 1) % TRACK.n;
	return Math.sign(tx * TRACK.ty[j] - TRACK.ty[i] * TRACK.tx[j]);
});

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

/** The roster in a starting order drawn from the seed, pole first. */
export function drawGrid(seed: number, roster: Entry[]): Entry[] {
	const rand = random(seed ^ 0x9e3779b9);
	const grid = [...roster];
	for (let i = grid.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[grid[i], grid[j]] = [grid[j], grid[i]];
	}
	return grid;
}

/**
 * `grid` is the starting order, pole first. `flags` are the race times at
 * which race control throws a caution, whatever is happening on the track.
 */
export function createRace(seed: number, grid: Entry[], flags: number[] = []) {
	const rand = random(seed);
	const { n, step: spacing, length } = TRACK;
	const world = new World({ gravity: { x: 0, y: 0 } });

	// a wall along each side of the track
	const walls = world.createBody();
	for (const side of [-1, 1]) {
		const loop = [];
		for (let i = 0; i < n; i += 2) {
			loop.push({
				x: TRACK.x[i] + TRACK.nx[i] * HALF_CORRIDOR * side,
				y: TRACK.y[i] + TRACK.ny[i] * HALF_CORRIDOR * side
			});
		}
		walls.createFixture({ shape: new ChainShape(loop, true), friction: 0.3, restitution: 0.2 });
	}

	// How long each driver takes to react to the lights: mostly quick, now
	// and then slow enough to lose a place or two before the first corner.
	const reaction = grid.map(() => rand() ** 2 * 0.4);

	const cars = grid.map((entry, slot): Car => {
		// two by two behind the line
		const behind = -(6 + 6.5 * slot);
		const sample = (Math.round(behind / spacing) + n) % n;
		const across = slot % 2 ? -2 : 2;
		const x = TRACK.x[sample] + TRACK.nx[sample] * across;
		const y = TRACK.y[sample] + TRACK.ny[sample] * across;
		const angle = Math.atan2(TRACK.ty[sample], TRACK.tx[sample]);
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
		const grip = 1.9 * lerp(0.94, 1.06, entry.grip);
		const errorEvery = lerp(30, 14, entry.aggression);
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
			errorEvery,
			// the most aggressive driver runs right at what the tyres can do,
			// which is quickest; past it they only slide
			pace: paceFor(grip * G * lerp(0.73, 0.79, entry.aggression)),
			offset: 0,
			errorAt: LIGHTS - Math.log(1 - rand()) * errorEvery,
			errorUntil: 0,
			errorBy: 1,
			stuck: 0,
			reverseUntil: 0
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

	const recovery = createRecovery(world, cars);
	// A truck, and a wreck on its hook, cannot be pushed, so a car they bore
	// down on would be crushed against the wall. A car that drives into them
	// hits them; one they are the ones closing on, they pass over, and go on
	// passing over until they are clear of it, or it would be thrown out from
	// under them the moment they stopped.
	world.on('pre-solve', (contact) => {
		const a = contact.getFixtureA().getBody();
		const b = contact.getFixtureB().getBody();
		const [fixed, free] = a.isKinematic() ? [a, b] : [b, a];
		if (!fixed.isKinematic() || !free.isDynamic()) return;
		const manifold = contact.getWorldManifold(null);
		if (!manifold?.pointCount) return;
		// the normal runs from the first body to the second: here, from the truck to the car
		const way = fixed === a ? 1 : -1;
		const { x: nx, y: ny } = manifold.normal;
		const push = fixed.getLinearVelocityFromWorldPoint(manifold.points[0]);
		const come = free.getLinearVelocity();
		const pushing = (push.x * nx + push.y * ny) * way;
		const driving = -(come.x * nx + come.y * ny) * way;
		const deep = Math.min(...manifold.separations.slice(0, manifold.pointCount)) < -0.3;
		// nor is a car with the wall at its other side given a knock it cannot ride
		const car = free.getUserData();
		const pinned = typeof car === 'number' && Math.abs(cars[car].across) > HALF_CORRIDOR - 1.5;
		if (deep || pinned || pushing > Math.max(0, driving)) contact.setEnabled(false);
	});
	/** The caution that is out: when it came out, and whether the race is ready to go green at the line. */
	let caution: { since: number; ready: boolean } | null = null;
	/** Under caution, the car the queue forms behind, and whether it has just crossed the line. */
	let pacer: Car | undefined;
	let atLine = false;
	/** Everything on the road this step: the cars, and the trucks that are out on the track. */
	let road: Obstacle[] = cars;

	/**
	 * Whether something is to be waited behind and not passed. Under caution
	 * that is a car still running, wherever across the road it is. It is also
	 * a truck on the move, a wreck that is, and the two of them once the cable
	 * is on, until they have stopped or are off the track.
	 */
	const followed = (other: Obstacle) =>
		caution !== null &&
		(!other.retired ||
			(Math.abs(other.across) < HALF_CORRIDOR && (other.speed > 1 || other.towed)));

	const race = {
		time: 0,
		done: false,
		flag: 'green' as Flag,
		/** How many laps the race is: more than it set out to be by each lap ended under caution. */
		laps: LAPS,
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

	function step() {
		if (race.done) return;
		race.time += DT;
		for (const car of cars) locate(car);
		marshal();
		// the trucks do not move until the drivers have had their turn
		road = [...cars, ...recovery.onTrack];
		for (const car of cars) drive(car);
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
			race.time > won + AFTER_WINNER ||
			race.time > LIGHTS + TIME_CAP;
	}

	/** Brings the caution out. Once the race has been won there is nothing left to neutralise. */
	function raise(wreck: Car | null) {
		if (caution || cars.some((car) => car.finishTime)) return;
		caution = { since: race.time, ready: false };
		pacer = rank(cars.filter((car) => !car.retired))[0];
		note(wreck, { kind: 'caution', by: wreck ? 'wreck' : 'control' });
	}

	/**
	 * Race control, each step: throws the cautions it was told to, and under
	 * one, names the car the queue forms behind and gives it the green as it
	 * crosses the line, once the track is clear and the field has closed up or
	 * has had long enough to.
	 */
	function marshal() {
		if (race.time > LIGHTS && flags.some((at) => at > race.time - DT && at <= race.time)) {
			raise(null);
		}
		if (!caution) return;
		const racing = cars.filter((car) => !car.retired && !car.finishTime);
		pacer = rank(racing)[0];
		const out = race.time - caution.since;
		// closed up: from the leader back, nobody much more than a queue's gap behind the next
		const behind = racing.map((car) => onRound(car.sample, pacer!.sample)).sort((a, b) => a - b);
		const closed = behind.every((far, place) => place === 0 || far - behind[place - 1] < QUEUE + 5);
		// Ready once the track is clear and the field is together, and from
		// then on unless there is another wreck: the queue strings out a
		// little as the leader picks up speed for the line.
		caution.ready =
			recovery.clear && out >= CAUTION_MIN && (caution.ready || closed || out >= CAUTION_MAX);
		// the green is only ever given at the line: if it cannot be this time, it is a lap more
		if (atLine && caution.ready) {
			caution = null;
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
		const sample = nearest(at.x, at.y, car.sample);
		let moved = sample - car.sample;
		if (moved > n / 2) moved -= n;
		if (moved < -n / 2) moved += n;
		car.sample = sample;
		car.across = lateral(at.x, at.y, sample);
		// a wreck on the hook is not driving anywhere
		if (!car.towed) car.progress += moved * spacing;

		const laps = Math.floor(car.progress / length);
		if (car.retired || laps <= car.laps) return;
		car.laps = laps;
		if (laps > 0) {
			const lap = race.time - car.lapStart;
			if (!car.bestLap || lap < car.bestLap) car.bestLap = lap;
			note(car, { kind: 'lap', lap });
			if (caution && car === pacer) {
				race.laps++;
				atLine = true;
				note(car, { kind: 'again' });
			}
			if (laps === race.laps) {
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
		// a retired car is left to coast to a stop where it is
		if (car.retired) return;

		const offRoad = Math.abs(car.across) > HALF_ROAD;
		const grip = car.grip * (offRoad ? VERGE_GRIP : 1) * (1 - 0.2 * car.damage);

		if (race.time >= LIGHTS + reaction[cars.indexOf(car)]) {
			// The car in the way: the nearest one ahead or alongside that the
			// racing line, or the line this car is taking now, would run into.
			// A wreck may be lying across the road, so it is given more room.
			// A truck, while it is out on the track, is one more thing to go
			// round. Whatever is being followed is not gone round at all: the
			// one ahead on the road is waited behind.
			const index = cars.indexOf(car);
			let blocker: Obstacle | undefined;
			let gap = 8 + car.speed * 1.2;
			for (const other of road) {
				if (other === car) continue;
				const ahead = (((other.sample - car.sample + n * 1.5) % n) - n / 2) * spacing;
				if (ahead < -5 || Math.abs(ahead) >= Math.abs(gap)) continue;
				const room = CLEAR + (other.retired ? WRECK : 0);
				const line = TRACK.line[other.sample];
				if (
					followed(other)
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
			let limit = Infinity;
			if (blocker && followed(blocker)) {
				// in the queue behind it
				limit = Math.max(3, Math.max(0, blocker.speed) + (gap - QUEUE) * 1.5);
			} else if (blocker) {
				// go round it on whichever side is nearer the line already held
				const room = CLEAR + (blocker.retired ? WRECK : 0);
				const line = TRACK.line[blocker.sample];
				const sides = [blocker.across + room - line, blocker.across - room - line]
					.filter((o) => Math.abs(line + o) <= MAX_OFFSET)
					.sort((p, q) => Math.abs(p - car.offset) - Math.abs(q - car.offset));
				// Once to one side of it, stay there, even where the road runs out
				// on that side: crossing back behind it throws the move away, and
				// a car alongside will be given room. But until close enough to be
				// held up, keep to its wheel tracks, which are quicker than any
				// way round it.
				const apart = car.across - blocker.across;
				const closing = Math.max(0, car.speed - Math.max(0, blocker.speed));
				if (gap < car.follow + 3 + closing * 1.5) {
					offset =
						Math.abs(apart) > 1 ? blocker.across + Math.sign(apart) * room - line : (sides[0] ?? 0);
				}
				// And hold back while tucked in behind it, slowing in time to be
				// no faster than it by the following distance, which matters most
				// when it is a wreck. A car most of the way out to one side goes
				// for the gap: it may rub, but it does not sit and wait.
				if (gap > 0 && Math.abs(apart) < (blocker.retired ? room : 1.5)) {
					const slower = Math.max(0, blocker.speed);
					const stopping = Math.sqrt(slower ** 2 + grip * G * Math.max(0, gap - car.follow));
					limit = Math.max(3, Math.min(slower + (gap - car.follow) * 1.5, stopping));
				}
			}
			// Leave room for a car alongside rather than turn in on it: the one
			// on the inside keeps the inside, and the one being passed has to
			// give up the line. Where that runs out of road, lift and let it
			// through rather than be squeezed onto the verge.
			for (const other of cars) {
				if (other === car || other.retired) continue;
				const ahead = (((other.sample - car.sample + n * 1.5) % n) - n / 2) * spacing;
				const apart = car.across - other.across;
				if (Math.abs(ahead) >= 4 || Math.abs(apart) >= CLEAR + 0.5) continue;
				const room = other.across + Math.sign(apart) * CLEAR;
				offset =
					apart > 0
						? Math.max(offset, room - TRACK.line[car.sample])
						: Math.min(offset, room - TRACK.line[car.sample]);
				if (Math.abs(room) > MAX_OFFSET + 0.3 && ahead > -1)
					limit = Math.min(limit, Math.max(0, other.speed) - 1);
			}
			car.offset += clamp(offset - car.offset, -4 * DT, 4 * DT);

			// steer for a point on the line a little way ahead
			const ahead = (car.sample + Math.round((5 + Math.abs(car.speed) * 0.3) / spacing)) % n;
			const across = clamp(TRACK.line[ahead] + car.offset, -MAX_OFFSET, MAX_OFFSET);
			const aim = body.getLocalPoint({
				x: TRACK.x[ahead] + TRACK.nx[ahead] * across,
				y: TRACK.y[ahead] + TRACK.ny[ahead] * across
			});
			const bearing = Math.atan2(aim.y, aim.x);
			let steer = Math.atan2(4 * AXLE * Math.sin(bearing), Math.hypot(aim.x, aim.y));

			// Off the line, the arc through a bend is tighter on the inside and
			// wider on the outside, and so is the speed it can be taken at.
			const inside = (car.across - TRACK.line[car.sample]) * TURN[car.sample];
			const arc = Math.sqrt(clamp(1 - TRACK.bend[car.sample] * inside, 0.5, 1.5));
			// A mistake: once one is due, the driver misjudges the next braking
			// point and arrives at the corner too fast, by a few per cent most
			// times and by a quarter now and then.
			let want = car.pace[car.sample] * Math.sqrt(grip / car.grip) * arc;
			if (race.time >= car.errorAt && car.speed > want + 0.5) {
				car.errorUntil = race.time + 0.3 + rand() ** 2 * 0.7;
				car.errorBy = 1.06 + rand() ** 3 * 0.22;
				car.errorAt = race.time - Math.log(1 - rand()) * car.errorEvery;
			}
			if (race.time < car.errorUntil) want *= car.errorBy;
			if (caution) {
				// nobody stands on the brakes at the flag: the speed allowed comes
				// down over a few seconds, so the cars behind are not caught out
				const easing = 32 - 6 * (race.time - caution.since);
				const held = car !== pacer ? CATCH : caution.ready ? RUN_IN : PACE;
				want = Math.min(want, Math.max(held, easing));
			}
			const corner = want;
			want = Math.min(want, limit);
			// facing the wrong way: turn round slowly
			if (Math.abs(bearing) > 1.2) want = Math.min(want, 5);
			if (car.finishTime) want = Math.min(want, 12);

			// What the tyres have left after cornering is all there is to
			// accelerate or brake with. Into a corner too fast, a driver still
			// brakes a little even with nothing left, giving up some line to
			// scrub off speed rather than run on into the wall.
			const cornering = Math.min(1, (car.speed ** 2 * TRACK.bend[car.sample]) / (grip * G));
			const spare = Math.sqrt(1 - cornering ** 2) * car.nerve;
			let throttle = 0;
			let brake = 0;
			if (car.speed > want + 0.5) {
				// a car ahead gets the brakes harder and sooner than a corner does
				brake = Math.min((car.speed - want) / (limit < corner ? 1.5 : 4), spare + 0.25, 1);
			} else {
				throttle = clamp((want - car.speed) / 2, 0, 1);
			}

			// stopped against something: back away from it
			if (race.time < car.reverseUntil) {
				throttle = -1;
				brake = 0;
				steer = -steer;
			} else {
				car.stuck = Math.abs(car.speed) < 1 ? car.stuck + DT : 0;
				if (car.stuck > 1) {
					car.stuck = 0;
					car.reverseUntil = race.time + 1.4;
				}
			}

			// bent bodywork at the front pulls the steering to one side
			const bent = Math.abs(car.hull[1] - HULL[1]) - Math.abs(car.hull[15] - HULL[15]);
			steer = clamp(steer + bent * 0.1, -MAX_STEER, MAX_STEER);
			car.steer += clamp(steer - car.steer, -3 * DT, 3 * DT);

			// the engine pushes the rear axle, as hard as its power allows at
			// this speed and no harder than the rear tyres can take
			const most = (grip * G * MASS) / 2;
			const engine = Math.min(11000, car.power / Math.max(Math.abs(car.speed), 8));
			const push =
				throttle < 0 ? -4000 : Math.min(throttle * engine * (1 - 0.35 * car.damage), most * spare);
			const stop = brake * most;
			car.slip = Math.max(
				tyres(body, AXLE, car.steer, 0, stop, most),
				tyres(body, -AXLE, 0, push, stop, most)
			);
		} else {
			// held on the grid until the lights go out
			tyres(body, AXLE, 0, 0, 1e5, 1e5);
			tyres(body, -AXLE, 0, 0, 1e5, 1e5);
		}

		// Air and rolling resistance, and the drag of the verge. Close behind
		// another car the air is already moving, so there is less of it to
		// push: the tow that lets a quicker car draw alongside on a straight.
		let tow = 0;
		for (const other of cars) {
			if (other === car || other.retired) continue;
			const ahead = (((other.sample - car.sample + n * 1.5) % n) - n / 2) * spacing;
			if (ahead > 0 && Math.abs(other.across - car.across) < 1.6)
				tow = Math.max(tow, 1 - ahead / 25);
		}
		const air = 2.2 * (1 - 0.7 * tow);
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
		if (!wrecked) car.damage = Math.min(1, car.damage + blow / (5 * car.tough));
		note(car, { kind: 'hit', x, y, force: blow + SHRUG, damage: car.damage });
		if (wrecked || car.damage < 1) return;
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
function paceFor(limit: number) {
	const { n, step, bend } = TRACK;
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
