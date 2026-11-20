import { ChainShape, PolygonShape, World, type Body, type Fixture } from 'planck';
import type { Entry } from './roster';
import { HALF_CORRIDOR, HALF_ROAD, MAX_OFFSET, TRACK, lateral, nearest } from './track';

// One race, start to finish. Each car is a rigid body pushed around by its
// two axles' tyres, which grip up to a limit and slide past it, and steered
// by a driver that follows the racing line, brakes for corners, goes round
// traffic and now and then gets it wrong. Hard knocks dent the bodywork for
// good and add up to a retirement. The same seed always runs the same race.

export const DT = 1 / 60;
export const LAPS = 3;
/** Seconds the cars sit on the grid before the start. */
export const LIGHTS = 2;
/** The race is called off this long after the start, whoever is still out. */
const TIME_CAP = 120;
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
	/** 0 while the tyres grip, rising to 1 as they slide. */
	slip: number;
	/** The outline as it is now, dents and all. */
	hull: Float32Array;
	/** 0 when new; the car retires at 1. */
	damage: number;
	retired: boolean;
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
	stuck: number;
	reverseUntil: number;
};

export type RaceEvent = {
	time: number;
	kind: 'hit' | 'retire' | 'lap' | 'finish';
	/** Index into `cars`. */
	car: number;
	x: number;
	y: number;
	/** For a hit, how hard, as the speed (m/s) knocked off the car. */
	force: number;
};

export type Race = ReturnType<typeof createRace>;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
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

/** `grid` is the starting order, pole first. */
export function createRace(seed: number, grid: Entry[]) {
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
		const grip = 1.9 * lerp(0.97, 1.03, entry.grip);
		const errorEvery = lerp(60, 20, entry.aggression);
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
			power: 180_000 * lerp(0.85, 1.15, entry.speed),
			tough: lerp(0.7, 1.4, entry.reliability),
			nerve: lerp(0.9, 1.05, entry.aggression),
			follow: lerp(7, 4.6, entry.aggression),
			errorEvery,
			pace: paceFor(grip * G * lerp(0.76, 0.82, entry.aggression)),
			offset: 0,
			errorAt: LIGHTS - Math.log(1 - rand()) * errorEvery,
			errorUntil: 0,
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

	const race = {
		time: 0,
		done: false,
		cars,
		/** What has happened since the caller last emptied this. */
		events: [] as RaceEvent[],
		step,
		/** The cars in finishing order: by time at the flag, then by distance. */
		order: () =>
			[...cars].sort((a, b) => {
				if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
				if (a.finishTime || b.finishTime) return a.finishTime ? -1 : 1;
				return b.progress - a.progress;
			})
	};

	function note(kind: RaceEvent['kind'], car: Car, x = car.x, y = car.y, force = 0) {
		race.events.push({ time: race.time, kind, car: cars.indexOf(car), x, y, force });
	}

	function step() {
		if (race.done) return;
		race.time += DT;
		for (const car of cars) if (!car.retired) locate(car);
		for (const car of cars) drive(car);
		world.step(DT, 8, 3);
		for (const hit of hits) dent(hit);
		hits.length = 0;
		for (const car of cars) {
			const at = car.body.getPosition();
			car.x = at.x;
			car.y = at.y;
			car.angle = car.body.getAngle();
		}

		const running = cars.filter((car) => !car.retired);
		const won = Math.min(...cars.map((car) => car.finishTime || Infinity));
		race.done =
			running.every((car) => car.finishTime) ||
			race.time > won + AFTER_WINNER ||
			race.time > LIGHTS + TIME_CAP;
	}

	/** Works out where on the track a car is, and counts its laps. */
	function locate(car: Car) {
		const at = car.body.getPosition();
		const sample = nearest(at.x, at.y, car.sample);
		let moved = sample - car.sample;
		if (moved > n / 2) moved -= n;
		if (moved < -n / 2) moved += n;
		car.sample = sample;
		car.across = lateral(at.x, at.y, sample);
		car.progress += moved * spacing;

		const laps = Math.floor(car.progress / length);
		if (laps <= car.laps) return;
		car.laps = laps;
		if (laps > 0) {
			const lap = race.time - car.lapStart;
			if (!car.bestLap || lap < car.bestLap) car.bestLap = lap;
			note('lap', car);
			if (laps === LAPS) {
				car.finishTime = race.time;
				note('finish', car);
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

		if (race.time >= LIGHTS) {
			// The car in the way: the nearest one ahead or alongside that the
			// racing line would run into.
			let blocker: Car | undefined;
			let gap = 8 + car.speed * 0.8;
			for (const other of cars) {
				if (other === car) continue;
				const ahead = (((other.sample - car.sample + n * 1.5) % n) - n / 2) * spacing;
				if (ahead < -5 || Math.abs(ahead) >= Math.abs(gap)) continue;
				if (Math.abs(TRACK.line[other.sample] - other.across) >= CLEAR) continue;
				blocker = other;
				gap = ahead;
			}
			let offset = 0;
			let limit = Infinity;
			if (blocker) {
				// go round it on whichever side is nearer the line already held
				const line = TRACK.line[blocker.sample];
				const sides = [blocker.across + CLEAR - line, blocker.across - CLEAR - line]
					.filter((o) => Math.abs(line + o) <= MAX_OFFSET)
					.sort((p, q) => Math.abs(p - car.offset) - Math.abs(q - car.offset));
				offset = sides[0] ?? 0;
				// and hold back while still tucked in behind it
				if (gap > 0 && Math.abs(blocker.across - car.across) < 2.1) {
					limit = Math.max(3, Math.max(0, blocker.speed) + (gap - car.follow) * 1.5);
				}
			}
			car.offset += clamp(offset - car.offset, -3 * DT, 3 * DT);

			// steer for a point on the line a little way ahead
			const ahead = (car.sample + Math.round((5 + Math.abs(car.speed) * 0.3) / spacing)) % n;
			const across = clamp(TRACK.line[ahead] + car.offset, -MAX_OFFSET, MAX_OFFSET);
			const aim = body.getLocalPoint({
				x: TRACK.x[ahead] + TRACK.nx[ahead] * across,
				y: TRACK.y[ahead] + TRACK.ny[ahead] * across
			});
			const bearing = Math.atan2(aim.y, aim.x);
			let steer = Math.atan2(4 * AXLE * Math.sin(bearing), Math.hypot(aim.x, aim.y));

			// A mistake: once one is due, the driver misjudges the next braking
			// point and arrives at the corner too fast. Most are small; a few
			// are not.
			let want = car.pace[car.sample] * Math.sqrt(grip / car.grip);
			if (race.time >= car.errorAt && car.speed > want + 0.5) {
				car.errorUntil = race.time + 0.3 + rand() ** 2 * 0.7;
				car.errorAt = race.time - Math.log(1 - rand()) * car.errorEvery;
			}
			if (race.time < car.errorUntil) want = Infinity;
			want = Math.min(want, limit);
			// facing the wrong way: turn round slowly
			if (Math.abs(bearing) > 1.2) want = Math.min(want, 5);
			if (car.finishTime) want = Math.min(want, 12);

			// what the tyres have left after cornering is all there is to
			// accelerate or brake with
			const cornering = Math.min(1, (car.speed ** 2 * TRACK.bend[car.sample]) / (grip * G));
			const spare = Math.sqrt(1 - cornering ** 2) * car.nerve;
			let throttle = 0;
			let brake = 0;
			if (car.speed > want + 0.5) {
				brake = Math.min((car.speed - want) / 4, spare + 0.1, 1);
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

		// air and rolling resistance, and the drag of the verge
		const drag = 30 + 2.2 * Math.hypot(velocity.x, velocity.y) + (offRoad ? 400 : 0);
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
		note('hit', car, x, y, blow + SHRUG);
		if (car.retired) return;
		car.damage = Math.min(1, car.damage + blow / (14 * car.tough));
		if (car.damage < 1) return;
		car.retired = true;
		car.slip = 0;
		car.body.setLinearDamping(1.5);
		car.body.setAngularDamping(2.5);
		note('retire', car);
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
 * they slide. Returns how far past the limit they were asked to go, 0 to 1.
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
	let sideways = -(velocity.x * sideX + velocity.y * sideY) / (1 / MASS + arm ** 2 / INERTIA);
	const rolling = velocity.x * along.x + velocity.y * along.y;
	let forward = push * DT + clamp((-rolling * MASS) / 2, -stop * DT, stop * DT);
	const asked = Math.hypot(sideways, forward);
	const limit = most * DT;
	if (asked > limit) {
		// sliding tyres grip a little less than rolling ones
		sideways *= (0.9 * limit) / asked;
		forward *= (0.9 * limit) / asked;
	}
	body.applyLinearImpulse(
		{ x: sideX * sideways + along.x * forward, y: sideY * sideways + along.y * forward },
		point,
		true
	);
	return clamp(asked / limit - 1, 0, 1);
}
