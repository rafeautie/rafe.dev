import { PolygonShape, type World } from 'planck';
import {
	BAY,
	BAYS,
	BAY_IN,
	BAY_OUT,
	GATES,
	HOMES,
	NEARSIDE,
	LAYBY,
	LAYBY_IN,
	LAYBY_OUT,
	RING,
	SLIP,
	TRUCK,
	ahead,
	curve,
	drive,
	parked,
	trace,
	type Pose,
	type Route
} from './service';
import type { Car } from './sim';
import { HALF_CORRIDOR, TRACK, lateral, nearest } from './track';

// The tow trucks and the job they do. Called for a wreck, a truck leaves its
// garage along the service road, which only runs the way the race does, and
// holds at the last gate before the wreck until the cars have gone by. Then
// it comes out onto the track, drives past the wreck, and backs up to it the
// way a car is backed into a space, until its hook is a little short of the
// end of the wreck that points down the track. The crew run the cable out,
// the winch draws that end up to the hook, and the truck tows the wreck out
// at the next gate and on to a bay on the grass. It goes home the same way
// round, or straight to the next wreck. Whichever truck can be at the gate
// soonest is the one sent.
//
// The truck is not driven like a car. It follows a way worked out for each
// part of the job (service.ts), with one axle on the way and the other
// following it, so it turns only as it moves and no tighter than the way
// bends. A wreck on the hook is a trailer: the end on the cable follows the
// hook and the wheels still on the ground follow that, without sliding
// sideways. The cars can run into either, but neither can be pushed about.

/** Seconds from the call to the truck leaving its garage. */
const SCRAMBLE = 0.6;
/** A truck holds at a gate with its front axle this far short of where the way through it begins. */
const HOLD = 2;
/** Along the track, how far it takes the truck to get across to the side it passes the wreck on. */
const DRIFT = 14;
/** It is across by this far before the wreck, and stops with its front axle this far past it. */
const BEFORE = 7;
const PAST = 21;
/** The gate a truck comes out of is no nearer the wreck than this, so there is room for all that. */
const REACH = SLIP + DRIFT + BEFORE;
/** How far to one side the truck passes a wreck, middle to middle, and how near the wall it will go. */
const PASS = 3.7;
const EDGE = 5.4;
/** The tightest the truck steers, backing up, as a radius in metres. */
const STEER = 5.5;
/** It needs the place it is backing to at least this far behind it, or it goes on further first. */
const ROOM = 6;
/** The truck lines up with the wreck, but no further off the way the track runs than this (radians). */
const SKEW = 0.55;
/** It backs up until its hook is this far from the wreck. */
const CABLE = 1.3;
/** Seconds stopped between driving forward and backing up, and at the wreck while the crew run the cable out. */
const SHIFT = 0.4;
const CREW = 0.9;
/** How fast the winch draws the wreck in, m/s, and how much cable is left when it is up on the hook. */
const WINCH = 0.8;
const LIFTED = 0.5;
/** Seconds stopped at the bay to let the wreck down. */
const UNHOOK = 1.2;
/** From the middle of a wreck to the end that is hooked, and to the axle left on the ground. */
const NOSE = 2.1;
const WHEELS = 1.3;
/** How far past the bay's sample the truck's front axle stops, to leave the wreck in it. */
const BEYOND = 8;
/** How hard the truck brakes, and pulls away, light and loaded, m/s². */
const BRAKE = 5;
const PULL = 6;
const HAUL = 3;
/** How fast it backs up, m/s. */
const BACKING = 4.5;
/** After this long held at a gate, the truck goes whoever is coming. */
const PATIENCE = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** An angle as the short way round, -π to π. */
const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export type Truck = ReturnType<typeof createTruck>['truck'];

/** The gate a truck comes out of for a wreck: the one that leaves the least of the track to drive. */
const gateFor = (wreck: Car) =>
	GATES.reduce((best, sample) =>
		ahead(sample + REACH, wreck.sample) < ahead(best + REACH, wreck.sample) ? sample : best
	);

/** The crews: sends a truck for each wreck, and steps them all. */
export function createRecovery(world: World, cars: Car[]) {
	/** Bays with a wreck in them. */
	const taken = new Set<number>();
	const crews = HOMES.map((home) => createTruck(world, cars, home, taken));
	return {
		trucks: crews.map((crew) => crew.truck),
		/** Whether the track is clear: no wreck waiting, and none on a hook still on it. */
		get clear() {
			return crews.every((crew) => crew.clear);
		},
		/** The trucks out on the track, for the cars to go round. */
		get onTrack() {
			return crews.filter((crew) => crew.onTrack).map((crew) => crew.truck);
		},
		/** Sends a truck for a wreck: the one with the least of the service road to cover first. */
		call(car: Car, time: number) {
			const nearest = crews.reduce((best, crew) => (crew.away(car) < best.away(car) ? crew : best));
			nearest.call(car, time);
		},
		/** One step of every job. Call before the world is stepped. */
		step(time: number, dt: number) {
			for (const crew of crews) crew.step(time, dt);
		},
		/** Reads where the trucks have got to. Call after the world is stepped. */
		sync() {
			for (const crew of crews) crew.sync();
		}
	};
}

function createTruck(world: World, cars: Car[], home: number, taken: Set<number>) {
	const body = world.createBody({
		type: 'kinematic',
		position: parked(home),
		angle: parked(home).angle,
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
		restitution: 0.1
	});

	const truck = {
		...parked(home),
		/** Forward speed, m/s: negative while it backs up. */
		speed: 0,
		/** Out on a job, lights going, rather than parked in its garage. */
		busy: false,
		/** The car on the hook, as an index into the race's cars, or -1. */
		towing: -1,
		/** The gate it has had opened to go through, as an index into GATES, or -1. */
		gate: -1,
		/** Where on the lap the axle it is steering by is, as a car's place is kept. */
		sample: home + 2,
		across: -RING - LAYBY,
		// to a driver it is one more wreck to go round
		retired: true as const
	};

	/** Wrecks called in and not yet gone for. */
	const waiting: Car[] = [];
	let stage: 'parked' | 'out' | 'held' | 'approach' | 'back' | 'hook' | 'tow' | 'drop' | 'home' =
		'parked';
	/** The wreck being fetched, and the gate the truck goes in by. */
	let wreck: Car | null = null;
	let gate = 0;
	/** When the truck may leave its garage. */
	let ready = 0;
	/**
	 * The way being driven, how fast each point of it may be passed, how far
	 * along it the leading axle is and how fast it is going. That axle is the
	 * front one, or the back one of a truck that is `backing`; the other is
	 * on the way too, behind it.
	 */
	let way: Route | null = null;
	let caps = new Float64Array(0);
	let gone = 0;
	let at = 0;
	let pace = 0;
	let backing = false;
	/** The way the leading axle faces as the way begins, which is the way to the other one, reversed. */
	let setOff = 0;
	/** Seconds in the stage, for the ones that are waits. */
	let timer = 0;
	/** How many times it has driven further on for more room to back up in. */
	let tries = 0;
	/**
	 * The wreck on the cable: the end of it the cable is on, the axle it still
	 * rolls on, how much cable is out, and whether it is the tail that is hooked.
	 */
	let end = { x: 0, y: 0 };
	let axle = { x: 0, y: 0 };
	let cable = 0;
	let tail = false;
	/** The gate open for this way, and from how far along it to how far. */
	let door: { gate: number; from: number; to: number } | null = null;
	/** How far along the tow the wreck is behind the wall. */
	let off = Infinity;

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

	/** One of the truck's axles, `fore` of its middle, and the way the truck faces. */
	function axleAt(fore: number): Pose {
		const { x, y } = body.getPosition();
		const angle = body.getAngle();
		return { x: x + Math.cos(angle) * fore, y: y + Math.sin(angle) * fore, angle };
	}

	/** Takes a way to drive: light or with a wreck on the hook, forwards or backing along it. */
	function take(next: Route, loaded: boolean, reverse = false) {
		way = next;
		gone = at = 0;
		backing = reverse;
		setOff = body.getAngle() + (reverse ? Math.PI : 0);
		door = null;
		const { count, x, y, along } = next;
		caps = new Float64Array(count);
		for (let k = 0; k + 1 < count; k++) {
			const road = next.across[k] <= -RING + 0.5;
			caps[k] = reverse ? BACKING : road ? (loaded ? 12 : 24) : loaded ? 11 : 18;
			// No faster round a bend than the truck can hold, less with a car
			// behind. It is taken gently where it is tight and the truck has to
			// swing right round, and more briskly where it is only a curve.
			const [a, b] = [Math.max(0, k - 3), Math.min(count - 1, k + 3)];
			const cross = (x[k] - x[a]) * (y[b] - y[a]) - (y[k] - y[a]) * (x[b] - x[a]);
			const sides =
				Math.hypot(x[k] - x[a], y[k] - y[a]) *
				Math.hypot(x[b] - x[k], y[b] - y[k]) *
				Math.hypot(x[b] - x[a], y[b] - y[a]);
			const bend = sides ? Math.abs(2 * cross) / sides : 0;
			const hold = clamp(7 + (1 / Math.max(bend, 1e-3) - 10) * 0.4, 7, 11) * (loaded ? 0.5 : 1);
			if (bend > 1e-3) caps[k] = Math.min(caps[k], Math.sqrt(hold / bend));
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
	 * Where the way is, `far` metres along it. Before its start it runs
	 * straight back the way it sets out, which is where the truck's other
	 * axle is when it begins.
	 */
	function point(far: number): [number, number] {
		const { count, x, y, along } = way!;
		if (far < 0) return [x[0] + Math.cos(setOff) * far, y[0] + Math.sin(setOff) * far];
		let k = Math.min(at, count - 2);
		while (k > 0 && along[k] > far) k--;
		while (k + 2 < count && along[k + 1] <= far) k++;
		const t = clamp((far - along[k]) / (along[k + 1] - along[k] || 1), 0, 1);
		return [x[k] + (x[k + 1] - x[k]) * t, y[k] + (y[k + 1] - y[k]) * t];
	}

	/** How far along the way its leading axle first comes to a sample. */
	function reach(sample: number) {
		const first = way!.sample[0];
		for (let k = 0; k < way!.count; k++) {
			if (ahead(first, way!.sample[k]) >= ahead(first, sample)) return way!.along[k];
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
		gone = Math.min(length, gone + pace * dt);
		const arrived = length - gone < 0.05;
		if (arrived) {
			gone = length;
			pace = 0;
		}
		truck.speed = backing ? -pace : pace;
		const reached = arrived ? count - 1 : at;
		truck.sample = way!.sample[reached];
		truck.across = way!.across[reached];
		// one axle is on the way here and the other on it a wheelbase behind:
		// the truck is between them, facing from its back axle to its front
		const [lx, ly] = point(gone);
		const [fx, fy] = point(gone - 2 * TRUCK.axle);
		const facing = backing ? Math.atan2(fy - ly, fx - lx) : Math.atan2(ly - fy, lx - fx);
		move(body, (lx + fx) / 2, (ly + fy) / 2, facing, dt);
		return arrived;
	}

	/** The nearest of some samples that is at least `least` on round the lap from `from`. */
	function next(samples: number[], from: number, least: number) {
		return samples.reduce((best, sample) =>
			ahead(from + least, sample) < ahead(from + least, best) ? sample : best
		);
	}

	/** Sets off for the next wreck, from wherever the truck is. */
	function fetch() {
		wreck = waiting.shift()!;
		truck.busy = true;
		head(gateFor(wreck));
	}

	/** Makes for a gate along the service road, to hold just short of it. */
	function head(to: number) {
		gate = to;
		const { sample, across } = truck;
		const on = sample + LAYBY_OUT - 2;
		take(
			drive(axleAt(TRUCK.axle), [
				[sample, across],
				[on, -RING],
				[on + ahead(on, gate - SLIP - HOLD), -RING]
			]),
			false
		);
		stage = 'out';
	}

	/** Whether a truck held at the gate may come out: nobody about to arrive, nobody just gone by. */
	function open() {
		return cars.every(
			(car) =>
				car.retired ||
				(ahead(car.sample, gate) >= Math.max(30, car.speed * 4) && ahead(gate, car.sample) >= 18)
		);
	}

	/**
	 * Out through the gate and along the track, across to the side of the
	 * wreck with more room, and past it far enough to back up to it.
	 */
	function approach() {
		const from = truck.sample;
		const lying = from + ahead(from, wreck!.sample);
		const side = clamp(
			wreck!.across >= PASS - EDGE ? wreck!.across - PASS : wreck!.across + PASS,
			-EDGE,
			EDGE
		);
		const on = from + HOLD + 2 * SLIP;
		take(
			drive(axleAt(TRUCK.axle), [
				[from, -RING],
				[from + HOLD, -RING],
				[on, NEARSIDE],
				[Math.max(on, lying - BEFORE - DRIFT), NEARSIDE],
				[Math.max(on, lying - BEFORE), side],
				[Math.max(on, lying + PAST), side]
			]),
			false
		);
		// the gate is open from the word to go until the truck is through it
		door = { gate: GATES.indexOf(gate), from: 0, to: reach(gate + SLIP + 3) };
		stage = 'approach';
	}

	/**
	 * Backs up to the wreck: to the end of it that points more down the track,
	 * in line with it if that leaves the truck pointing near enough down the
	 * track itself to drive off, and if the way back to there is one a truck
	 * can steer. If not, as near in line as it can be.
	 */
	function back() {
		const car = wreck!;
		const { x, y } = car.body.getPosition();
		const lie = car.body.getAngle();
		const along = Math.atan2(TRACK.ty[car.sample], TRACK.tx[car.sample]);
		tail = Math.cos(lie - along) < 0;
		const skew = clamp(turn(lie + (tail ? Math.PI : 0) - along), -SKEW, SKEW);
		const out = NOSE * (tail ? -1 : 1);
		const from = axleAt(-TRUCK.axle);
		let best: { points: [number, number][]; tightest: number; behind: number } | null = null;
		// in line first, then less and less so, until the way there bends gently enough
		for (const share of [1, 0.66, 0.33, 0]) {
			const facing = along + skew * share;
			const [dx, dy] = [Math.cos(facing), Math.sin(facing)];
			// its middle, with the hook a cable's length off the end of the wreck
			let cx = x + Math.cos(lie) * out + dx * (CABLE + TRUCK.hook);
			let cy = y + Math.sin(lie) * out + dy * (CABLE + TRUCK.hook);
			// and no nearer the wall than it would drive
			const sample = nearest(cx, cy, car.sample);
			const across = lateral(cx, cy, sample);
			const room = clamp(across, -EDGE, EDGE) - across;
			cx += TRACK.nx[sample] * room;
			cy += TRACK.ny[sample] * room;
			// the back axle leads, from where it is to where that puts it
			const to = { x: cx - dx * TRUCK.axle, y: cy - dy * TRUCK.axle, angle: facing + Math.PI };
			const points = curve({ ...from, angle: from.angle + Math.PI }, to);
			// how tightly that bends, by the circle through each point and the ones a metre either side
			let tightest = Infinity;
			for (let k = 4; k + 4 < points.length; k++) {
				const [[ax, ay], [bx, by], [ex, ey]] = [points[k - 4], points[k], points[k + 4]];
				const cross = (bx - ax) * (ey - ay) - (by - ay) * (ex - ax);
				const sides =
					Math.hypot(bx - ax, by - ay) *
					Math.hypot(ex - bx, ey - by) *
					Math.hypot(ex - ax, ey - ay);
				tightest = Math.min(tightest, sides / Math.abs(2 * cross || 1e-9));
			}
			const behind =
				(from.x - to.x) * Math.cos(from.angle) + (from.y - to.y) * Math.sin(from.angle);
			if (!best || tightest > best.tightest) best = { points, tightest, behind };
			if (tightest >= STEER) break;
		}
		// A wreck knocked on down the track since the truck set out is not
		// behind it any more, or not far enough to back up to: drive on past
		// it again first.
		// Nor is one it could only reach by wrenching the wheel over.
		if (best!.behind < ROOM || (best!.tightest < STEER - 1.5 && tries++ < 2)) return pass();
		tries = 0;
		take(trace(best!.points, truck.sample), false, true);
		stage = 'back';
		timer = 0;
	}

	/** On down the track, as it is, until the wreck is far enough behind to back up to. */
	function pass() {
		const front = axleAt(TRUCK.axle);
		const from = nearest(front.x, front.y, truck.sample);
		const n = TRACK.n;
		const lying = from + ((wreck!.sample - from + n * 1.5) % n) - n / 2;
		const across = lateral(front.x, front.y, from);
		take(
			drive(front, [
				[from, across],
				[Math.max(from + ROOM, lying + PAST), across]
			]),
			false
		);
		stage = 'approach';
	}

	/** Off with the wreck: out at the next gate with room before it, and on to the next empty bay. */
	function tow() {
		const front = axleAt(TRUCK.axle);
		const from = nearest(front.x, front.y, truck.sample);
		const across = lateral(front.x, front.y, from);
		// far enough to be back at the kerb without swinging the wreck about
		const run = Math.ceil(Math.max(10, Math.sqrt(42 * Math.abs(across - NEARSIDE))));
		const out = from + run + SLIP + ahead(from + run + SLIP, next(GATES, from, run + SLIP));
		const free = BAYS.filter((bay) => !taken.has(bay));
		const bay = next(free.length ? free : BAYS, out + SLIP, BAY_IN);
		taken.add(bay);
		const stop = out + SLIP + BAY_IN + ahead(out + SLIP + BAY_IN, bay);
		take(
			drive(
				front,
				[
					[from, across],
					[from + run, NEARSIDE],
					[out - SLIP, NEARSIDE],
					[out + SLIP, -RING],
					[stop - BAY_IN, -RING],
					[stop, -RING - BAY],
					[stop + BEYOND, -RING - BAY]
				],
				// it may be standing well askew, with a wreck to bring round behind it
				14
			),
			true
		);
		// the gate is opened as the truck comes up to it, and a truck this far
		// past it has the wreck behind the wall
		off = reach(out + SLIP + 3);
		door = { gate: GATES.indexOf(ahead(0, out)), from: reach(out - SLIP - 12), to: off };
		stage = 'tow';
	}

	/** Back round to the lay-by and into the garage. */
	function goHome() {
		const { sample, across } = truck;
		const on = sample + BAY_OUT - BEYOND;
		const turnIn = on + ahead(on, home - LAYBY_IN);
		take(
			drive(axleAt(TRUCK.axle), [
				[sample, across],
				[on, -RING],
				[turnIn, -RING],
				[turnIn + LAYBY_IN - 4, -RING - LAYBY],
				[turnIn + LAYBY_IN + 2, -RING - LAYBY]
			]),
			false
		);
		stage = 'home';
	}

	/** On the track, the truck does not drive into the back of a car that is moving. */
	function traffic() {
		if (truck.across < -HALF_CORRIDOR) return Infinity;
		let limit = Infinity;
		for (const car of cars) {
			const before = ahead(truck.sample, car.sample);
			if (car.retired || car.speed < 2 || before === 0 || before > 8 + pace) continue;
			if (Math.abs(car.across - truck.across) < 3) limit = Math.min(limit, car.speed - 1);
		}
		return limit;
	}

	return {
		truck,

		/** How far round the service road the truck has to go to be at the gate for a wreck, and a lap more for each job it has first. */
		away(car: Car) {
			const jobs = waiting.length + (wreck ? 1 : 0);
			const on = truck.sample + LAYBY_OUT - 2;
			return ahead(on, gateFor(car) - SLIP - HOLD) + jobs * 1000;
		},

		/** Whether this truck leaves the track clear: no wreck waiting, and none on the hook still on it. */
		get clear() {
			return (
				waiting.length === 0 &&
				(stage === 'parked' ||
					stage === 'home' ||
					stage === 'drop' ||
					(stage === 'tow' && gone >= off))
			);
		},

		/** Whether the truck is out on the track. */
		get onTrack() {
			return truck.across > -HALF_CORRIDOR - 1;
		},

		/** Sends the truck for a wreck, after any it is already going for. */
		call(car: Car, time: number) {
			if (stage === 'parked' && waiting.length === 0) ready = time + SCRAMBLE;
			waiting.push(car);
		},

		/** One step of the job. Call before the world is stepped. */
		step(time: number, dt: number) {
			if (stage === 'parked' && waiting.length && time >= ready) fetch();
			// a call on the way home is answered from where the truck is
			if (stage === 'home' && waiting.length) fetch();

			if (stage === 'parked') {
				rest(body);
			} else if (stage === 'out') {
				// a wreck still rolling when the truck set off may have gone on past a later gate
				const nearer = gateFor(wreck!);
				if (nearer !== gate && ahead(truck.sample + LAYBY_OUT - 2, nearer - SLIP - HOLD) < 150) {
					head(nearer);
				}
				if (advance(dt)) {
					stage = 'held';
					timer = 0;
				}
			} else if (stage === 'held') {
				rest(body);
				timer += dt;
				const rolling = wreck!.body.getLinearVelocity();
				const still = Math.hypot(rolling.x, rolling.y) < 0.5;
				if (still && timer > 0.3 && (open() || timer > PATIENCE)) approach();
			} else if (stage === 'approach') {
				if (advance(dt, traffic())) back();
			} else if (stage === 'back') {
				// a moment to find reverse, then back to the wreck
				timer += dt;
				if (timer < SHIFT) {
					rest(body);
				} else if (advance(dt)) {
					stage = 'hook';
					timer = 0;
				}
			} else if (stage === 'hook') {
				rest(body);
				const car = wreck!;
				if (truck.towing < 0 && timer + dt >= CREW) {
					// The cable is on: from here the wreck goes where it is drawn.
					// It is on the end that was backed up to, and the wheels at the
					// other end are the ones still on the ground.
					car.towed = true;
					car.body.setKinematic();
					const { x, y } = car.body.getPosition();
					const lie = car.body.getAngle() + (tail ? Math.PI : 0);
					end = { x: x + Math.cos(lie) * NOSE, y: y + Math.sin(lie) * NOSE };
					axle = { x: x - Math.cos(lie) * WHEELS, y: y - Math.sin(lie) * WHEELS };
					const hook = axleAt(-TRUCK.hook);
					cable = Math.hypot(end.x - hook.x, end.y - hook.y);
					truck.towing = cars.indexOf(car);
				}
				timer += dt;
				if (truck.towing >= 0) {
					// the winch draws it in, and with it up on the hook the truck is away
					if (cable > LIFTED) cable = Math.max(LIFTED, cable - WINCH * dt);
					else tow();
				}
			} else if (stage === 'tow') {
				if (advance(dt, traffic(), HAUL)) {
					stage = 'drop';
					timer = 0;
				}
			} else if (stage === 'drop') {
				rest(body);
				timer += dt;
				if (timer >= UNHOOK) {
					rest(wreck!.body);
					wreck = null;
					truck.towing = -1;
					if (waiting.length) fetch();
					else goHome();
				}
			} else if (stage === 'home') {
				if (advance(dt)) {
					stage = 'parked';
					truck.busy = false;
				}
			}

			// a gate is opened for the truck that is going through it, and shut behind it
			truck.gate = door && gone >= door.from && gone < door.to ? door.gate : -1;

			// A wreck on the cable follows like a trailer. The end the cable is
			// on is drawn after the hook, as far behind it as there is cable out,
			// and the axle still on the ground is drawn after that end, rolling
			// but never sliding sideways. The truck's body is not where it is
			// going yet, so this works from where it is about to be.
			if (truck.towing >= 0 && wreck) {
				const speed = body.getLinearVelocity();
				const facing = body.getAngle() + body.getAngularVelocity() * dt;
				const centre = body.getPosition();
				const hx = centre.x + speed.x * dt - Math.cos(facing) * TRUCK.hook;
				const hy = centre.y + speed.y * dt - Math.sin(facing) * TRUCK.hook;
				const slack = Math.hypot(end.x - hx, end.y - hy) || 1;
				end = { x: hx + ((end.x - hx) / slack) * cable, y: hy + ((end.y - hy) / slack) * cable };
				const length = Math.hypot(end.x - axle.x, end.y - axle.y) || 1;
				const [ux, uy] = [(end.x - axle.x) / length, (end.y - axle.y) / length];
				axle = { x: end.x - ux * (NOSE + WHEELS), y: end.y - uy * (NOSE + WHEELS) };
				move(
					wreck.body,
					end.x - ux * NOSE,
					end.y - uy * NOSE,
					Math.atan2(uy, ux) + (tail ? Math.PI : 0),
					dt
				);
			}
		},

		/** Reads where the truck has got to. Call after the world is stepped. */
		sync() {
			const { x, y } = body.getPosition();
			truck.x = x;
			truck.y = y;
			truck.angle = body.getAngle();
		}
	};
}
