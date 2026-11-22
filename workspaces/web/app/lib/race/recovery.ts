import { PolygonShape, type World } from 'planck';
import { BOX_ACROSS, LANE, RAMP, pitsFor } from './pits';
import { NEARSIDE, RING, TRUCK, curve, serviceFor, type Pose, type Route } from './service';
import type { Car } from './sim';
import { HALF_CORRIDOR, clamp, lateral, nearest, triangle, type Track } from './track';

// The tow trucks and the job they do. They stand at the end of the pit lane,
// past the last box (pits.ts), one behind the other, and the pit lane is
// their way onto the track and off it. The one in front goes first, and the
// one behind moves up; one coming back takes the stand in front if it is
// empty and the one behind if it is not, so neither ever has to get past the
// other. Called for a wreck, a truck pulls out to the end of the lane and
// holds there until the cars have gone by. Then it goes out onto the track, drives
// round to the wreck and past it, and backs up to it the way a car is backed
// into a space, until its hook is a little short of the end of the wreck that
// points down the track. The crew run the cable out, the winch draws that end
// up to the hook, and the truck tows the wreck on round the lap, in at the
// way into the pits, and down the lane to the wreck's own box, where it is
// left. Then it goes back to its stand, or straight out for the next wreck.
//
// The truck is not driven like a car. It follows a way worked out for each
// part of the job (service.ts), with one axle on the way and the other
// following it, so it turns only as it moves and no tighter than the way
// bends. A wreck on the hook is a trailer: the end on the cable follows the
// hook and the wheels still on the ground follow that, without sliding
// sideways. The cars can run into either, but neither can be pushed about.

/** Seconds from the call to the truck leaving its stand. */
const SCRAMBLE = 0.6;
/** The truck holds at the end of the lane with its front axle this far short of where the way out begins. */
const HOLD = 2;
/** With its front axle this far past the end of the way in, the truck and anything on its hook are through the wall. */
const THROUGH = 4;
/** Along the track, how far it takes the truck to get across to the side it passes the wreck on. */
const DRIFT = 14;
/** It is across by this far before the wreck, and stops with its front axle this far past it. */
const BEFORE = 7;
const PAST = 21;
/** Held at the end of the lane, the truck needs a wreck this far ahead to have room for all that; one that is nearer, it goes round the lap for. */
const REACH = HOLD + RAMP + DRIFT + BEFORE;
/** How far to one side the truck passes a wreck, middle to middle, and how near the wall it will go. */
const PASS = 3.7;
const EDGE = 5.4;
/** The tightest the truck steers, backing up, as a radius in metres. */
const LOCK = 5.5;
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
/** Seconds stopped at the box to let the wreck down. */
const UNHOOK = 1.2;
/** From the middle of a wreck to the end that is hooked, and to the axle left on the ground. */
const NOSE = 2.1;
const WHEELS = 1.3;
/** How far behind the truck's front axle the middle of a wreck on its hook trails. */
const TRAIL = TRUCK.axle + TRUCK.hook + LIFTED + NOSE;
/** How far along the lane the truck takes to swing into a box with a wreck, and how far short of the middle of the box it is straight again. */
const SWING = 12;
const STRAIGHT = 2;
/** In the pits, the truck stops for a car this near the road just ahead of it (m). */
const SHY = 2.6;
/** And for the other truck this near it (m), which is nearer than one standing beside the lane is to one going down it. */
const SHY_TRUCK = 3.2;
/** How hard the truck brakes, and pulls away, light and loaded, m/s². */
const BRAKE = 5;
const PULL = 8;
const HAUL = 6;
/** How fast it goes down the pit lane, m/s. */
const LANE_PACE = 11;
/** How fast it backs up, m/s. */
const BACKING = 4.5;
/** On the track, a truck stops this far short of another that is going for a wreck or at work on one (m). */
const STAND_OFF = 34;
/** On the track, it waits this long behind a car that is all but stopped in its way before it goes on regardless. */
const FORBEARANCE = 6;
/** After this long held at the end of the lane, the truck goes whoever is coming. */
const PATIENCE = 8;

/** An angle as the short way round, -π to π. */
const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export type Truck = ReturnType<typeof createTruck>['truck'];

/**
 * What the trucks share: which of them has each stand, the front one first,
 * whether it is standing on it or on its way to it (null while nobody has);
 * and where they all are, so they keep out of each other's way.
 */
type Yard = { stands: (number | null)[]; trucks: Truck[] };

/** The crews: send a truck for each wreck, and step them all. */
export function createRecovery(world: World, cars: Car[], track: Track) {
	const { stands } = pitsFor(track);
	const yard: Yard = { stands: stands.map((_, index) => index), trucks: [] };
	const crews = stands.map((_, index) => createTruck(world, cars, track, index, yard));
	yard.trucks = crews.map((crew) => crew.truck);
	return {
		trucks: crews.map((crew) => crew.truck),
		/** Whether the track is clear: no wreck waiting, and none on a hook still on it. */
		get clear() {
			return crews.every((crew) => crew.clear);
		},
		/** Whether every wreck is on its way off: none waiting, and none lying where it stopped. The last may be on a hook still on the track. */
		get away() {
			return crews.every((crew) => crew.away);
		},
		/** The trucks out on the track, for the cars to go round. */
		get onTrack() {
			return crews.filter((crew) => crew.onTrack).map((crew) => crew.truck);
		},
		/** Sends a truck for a wreck: the one with the fewest to fetch first, and of two with none, the one on the front stand. */
		call(car: Car, time: number) {
			const nearest = crews.reduce((best, crew) =>
				(crew.jobs - best.jobs || crew.stand - best.stand) < 0 ? crew : best
			);
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

function createTruck(world: World, cars: Car[], track: Track, index: number, yard: Yard) {
	const { n } = track;
	const { ahead, drive, trace } = serviceFor(track);
	const lane = pitsFor(track);
	/** The stand the truck has, standing on it or on its way to it, the front one being 0; -1 while it has none. */
	let slot = index;
	/** The stand it is pulling out of, which is kept for it until it is clear, or -1. */
	let vacating = -1;
	/** Whether it is only moving up from the stand behind to the one in front. */
	let shuffling = false;
	/** Whether no other truck is on its way to a wreck or at work on one, as of this step. */
	let alone = true;
	const stand = lane.stands[slot];
	const stall = { x: stand.x, y: stand.y, angle: stand.angle };
	/** As the track counts its samples: where the truck's front axle is on a stand, and where it holds at the end of the lane. */
	const homeOf = (which: number) =>
		((Math.round(lane.stands[which].sample + TRUCK.axle) % n) + n) % n;
	const exit = (((lane.out0 - HOLD) % n) + n) % n;
	const body = world.createBody({
		type: 'kinematic',
		position: stall,
		angle: stall.angle,
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
		...stall,
		/** Forward speed, m/s: negative while it backs up. */
		speed: 0,
		/** Out on a job, lights going, rather than on its stand. */
		busy: false,
		/** The car on the hook, as an index into the race's cars, or -1. */
		towing: -1,
		/** Always -1: there are no gates of its own for it to have opened, now that it uses the pits'. */
		gate: -1,
		/** Where on the lap the axle it is steering by is, as a car's place is kept. */
		sample: homeOf(slot),
		across: stand.across,
		// To a driver it is one more wreck to go round, and with a car on its
		// hook, one that is being towed.
		retired: true as const,
		get towed(): boolean {
			return this.towing >= 0;
		},
		/** Backing up to a wreck, a stop for the cable included: it may swing back across the road at any moment. */
		get backing(): boolean {
			return stage === 'back';
		},
		/** On its way to a wreck or at work on one, with nothing on its hook yet. */
		get fetching(): boolean {
			return (
				stage === 'out' ||
				stage === 'held' ||
				stage === 'approach' ||
				stage === 'back' ||
				stage === 'hook'
			);
		}
	};

	/** Wrecks called in and not yet gone for. */
	const waiting: Car[] = [];
	let stage: 'parked' | 'out' | 'held' | 'approach' | 'back' | 'hook' | 'tow' | 'drop' | 'home' =
		'parked';
	/** The wreck being fetched, and where the truck comes out onto the track, which is where it looks for a gap. */
	let wreck: Car | null = null;
	const gate = (((lane.out0 + RAMP / 2) % n) + n) % n;
	/** When the truck may leave its stand. */
	let ready = 0;
	/**
	 * The way being driven, how fast each point of it may be passed, how far
	 * along it the leading axle is and how fast it is going. That axle is the
	 * front one, or the back one of a truck that is `reversing`; the other is
	 * on the way too, behind it.
	 */
	let way: Route | null = null;
	let caps = new Float64Array(0);
	let gone = 0;
	let at = 0;
	let pace = 0;
	let reversing = false;
	/** The way the leading axle faces as the way begins, which is the way to the other one, reversed. */
	let setOff = 0;
	/** Seconds in the stage, for the ones that are waits. */
	let timer = 0;
	/** Seconds it has been waiting behind a car on the track. */
	let waited = 0;
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
	/** Towing: how far along the way the truck and the wreck behind it are through the wall. */
	let door: { to: number } | null = null;

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
		reversing = reverse;
		setOff = body.getAngle() + (reverse ? Math.PI : 0);
		door = null;
		const { count, x, y, along } = next;
		caps = new Float64Array(count);
		for (let k = 0; k + 1 < count; k++) {
			// in the pits no faster than the cars go there; on the track, as fast as it can with what it has on
			const pits = next.across[k] <= -RING + 0.5;
			caps[k] = reverse ? BACKING : pits ? LANE_PACE : loaded ? 18 : 28;
			// No faster round a bend than the truck can hold, less with a car
			// behind. It is taken gently where it is tight and the truck has to
			// swing right round, and more briskly where it is only a curve.
			const [a, b] = [Math.max(0, k - 3), Math.min(count - 1, k + 3)];
			const [cross, sides] = triangle(x[a], y[a], x[k], y[k], x[b], y[b]);
			const bend = sides ? Math.abs(2 * cross) / sides : 0;
			const hold = clamp(7 + (1 / Math.max(bend, 1e-3) - 10) * 0.4, 7, 14) * (loaded ? 0.8 : 1);
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
		truck.speed = reversing ? -pace : pace;
		const reached = arrived ? count - 1 : at;
		truck.sample = way!.sample[reached];
		truck.across = way!.across[reached];
		// one axle is on the way here and the other on it a wheelbase behind:
		// the truck is between them, facing from its back axle to its front
		const [lx, ly] = point(gone);
		const [fx, fy] = point(gone - 2 * TRUCK.axle);
		const facing = reversing ? Math.atan2(fy - ly, fx - lx) : Math.atan2(ly - fy, lx - fx);
		move(body, (lx + fx) / 2, (ly + fy) / 2, facing, dt);
		return arrived;
	}

	/** Sets off for the next wreck, from wherever the truck is. */
	function fetch() {
		wreck = waiting.shift()!;
		head();
	}

	/** Makes for the end of the lane, to hold there. */
	function head() {
		// The stand it is leaving is kept until it is out of the way; one it
		// was only on its way to is given up at once.
		if (slot >= 0 && stage === 'parked') vacating = slot;
		else if (slot >= 0) yard.stands[slot] = null;
		slot = -1;
		const from = truck.sample;
		const hold = from + ahead(from, exit);
		take(
			drive(
				axleAt(TRUCK.axle),
				hold - from > 20
					? [
							[from, truck.across],
							[from + 10, -RING],
							[hold, -RING]
						]
					: [
							[from, truck.across],
							[hold, -RING]
						]
			),
			false
		);
		stage = 'out';
	}

	/** Whether the truck, held at the end of the lane, may come out: nobody about to arrive, nobody just gone by. */
	function open() {
		return cars.every(
			(car) =>
				car.retired ||
				// a car in the pits is not coming
				car.lane >= LANE.in ||
				(ahead(car.sample, gate) >= Math.max(14, car.speed * 2.5) && ahead(gate, car.sample) >= 12)
		);
	}

	/** Whether the other truck is coming by on the track, or has just gone by, where this one comes out: with a wreck behind it, as like as not. */
	function passing() {
		return yard.trucks.some(
			(other) =>
				other !== truck &&
				other.across > -HALF_CORRIDOR &&
				(ahead(other.sample, gate) < 60 || ahead(gate, other.sample) < 25)
		);
	}

	/**
	 * Out the way out of the pits and along the track, across to the side of
	 * the wreck with more room, and past it far enough to back up to it. A
	 * wreck too near the way out to line up on is gone round the lap for.
	 */
	function approach() {
		const from = truck.sample;
		const lying = from + REACH + ahead(from + REACH, wreck!.sample);
		const side = clamp(
			wreck!.across >= PASS - EDGE ? wreck!.across - PASS : wreck!.across + PASS,
			-EDGE,
			EDGE
		);
		const on = from + HOLD + RAMP;
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
		const along = Math.atan2(track.ty[car.sample], track.tx[car.sample]);
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
			const sample = nearest(track, cx, cy, car.sample);
			const across = lateral(track, cx, cy, sample);
			const room = clamp(across, -EDGE, EDGE) - across;
			cx += track.nx[sample] * room;
			cy += track.ny[sample] * room;
			// the back axle leads, from where it is to where that puts it
			const to = { x: cx - dx * TRUCK.axle, y: cy - dy * TRUCK.axle, angle: facing + Math.PI };
			const points = curve({ ...from, angle: from.angle + Math.PI }, to);
			// how tightly that bends, by the circle through each point and the ones a metre either side
			let tightest = Infinity;
			for (let k = 4; k + 4 < points.length; k++) {
				const [cross, sides] = triangle(...points[k - 4], ...points[k], ...points[k + 4]);
				tightest = Math.min(tightest, sides / Math.abs(2 * cross || 1e-9));
			}
			const behind =
				(from.x - to.x) * Math.cos(from.angle) + (from.y - to.y) * Math.sin(from.angle);
			if (!best || tightest > best.tightest) best = { points, tightest, behind };
			if (tightest >= LOCK) break;
		}
		// A wreck knocked on down the track since the truck set out is not
		// behind it any more, or not far enough to back up to: drive on past
		// it again first.
		// Nor is one it could only reach by wrenching the wheel over.
		if (best!.behind < ROOM || (best!.tightest < LOCK - 1.5 && tries++ < 2)) return pass();
		tries = 0;
		take(trace(best!.points, truck.sample), false, true);
		stage = 'back';
		timer = 0;
	}

	/** On down the track, as it is, until the wreck is far enough behind to back up to. */
	function pass() {
		const front = axleAt(TRUCK.axle);
		const from = nearest(track, front.x, front.y, truck.sample);
		const n = track.n;
		const lying = from + ((wreck!.sample - from + n * 1.5) % n) - n / 2;
		const across = lateral(track, front.x, front.y, from);
		take(
			drive(front, [
				[from, across],
				[Math.max(from + ROOM, lying + PAST), across]
			]),
			false
		);
		stage = 'approach';
	}

	/**
	 * Off with the wreck: on round the lap to the way into the pits, down the
	 * lane, and into the wreck's own box, far enough through it to leave the
	 * wreck in it.
	 */
	function tow() {
		const front = axleAt(TRUCK.axle);
		const from = nearest(track, front.x, front.y, truck.sample);
		const across = lateral(track, front.x, front.y, from);
		// far enough to be back at the kerb without swinging the wreck about
		const run = Math.ceil(Math.max(10, Math.sqrt(42 * Math.abs(across - NEARSIDE))));
		const into = from + run + ahead(from + run, lane.entry);
		// how long the way in is, from the track to the lane
		const slip = lane.in1 - lane.in0;
		// the box, counted as this way counts its samples
		const box = lane.boxes[cars.indexOf(wreck!)].sample - lane.in0 + into;
		const keys: [number, number][] = [
			[from, across],
			[from + run, NEARSIDE],
			[into, NEARSIDE]
		];
		// down the lane first, unless the box is so near the way in that the one runs into the other
		if (box - STRAIGHT - SWING > into + slip + 1) {
			keys.push([into + slip, -RING], [box - STRAIGHT - SWING, -RING]);
		}
		keys.push([box - STRAIGHT, -BOX_ACROSS], [box + TRAIL, -BOX_ACROSS]);
		// it may be standing well askew, with a wreck to bring round behind it
		take(drive(front, keys, 14), true);
		// the track is clear once the wreck is behind the wall
		door = { to: reach(into + slip + THROUGH) };
		stage = 'tow';
	}

	/**
	 * Back to a stand: the front one if nobody has it, and if not the one
	 * behind, which is reached without passing the truck in front. Out into
	 * the lane and along it, or straight on if the stand is just ahead.
	 */
	function goHome() {
		if (slot >= 0) yard.stands[slot] = null;
		slot = yard.stands.findIndex((holder) => holder === null);
		yard.stands[slot] = index;
		const { sample, across } = truck;
		const to = sample + ahead(sample, homeOf(slot));
		if (to - sample < 1) {
			stage = 'parked';
			return;
		}
		take(
			drive(
				axleAt(TRUCK.axle),
				to - sample > 24
					? [
							[sample, across],
							[sample + 9, -RING],
							[to - 11, -RING],
							[to - 1, stand.across],
							[to, stand.across]
						]
					: [
							[sample, across],
							[to, stand.across]
						]
			),
			false
		);
		stage = 'home';
	}

	/**
	 * On the track, the truck does not drive into the back of a car that is in
	 * its way: it goes no faster than one that is moving, and waits for one
	 * that is all but stopped, though not for ever, or one that is stuck
	 * there would hold it up for good.
	 */
	function traffic(dt: number) {
		if (truck.across < -HALF_CORRIDOR) return Infinity;
		let limit = Infinity;
		let stopped = false;
		for (const car of cars) {
			const before = ahead(truck.sample, car.sample);
			if (car.retired || car.lane >= LANE.in || before === 0 || before > 8 + pace) continue;
			if (Math.abs(car.across - truck.across) >= 3) continue;
			if (car.speed < 2) {
				// all but stopped: waited for, until it has been waited for long enough
				stopped = true;
				if (waited > FORBEARANCE) continue;
			}
			limit = Math.min(limit, Math.max(0, car.speed - 1));
		}
		waited = stopped ? waited + dt : 0;
		// Nor into the other truck, if it comes up behind it: no faster than
		// it is going, from as far back as it takes to slow to that.
		const { x, y, angle } = axleAt(TRUCK.axle);
		for (const other of yard.trucks) {
			if (other === truck) continue;
			const fore = (other.x - x) * Math.cos(angle) + (other.y - y) * Math.sin(angle);
			const side = (other.y - y) * Math.cos(angle) - (other.x - x) * Math.sin(angle);
			const stopping = pace ** 2 / (2 * BRAKE);
			if (other.fetching && other.across > -HALF_CORRIDOR) {
				// One that is at a wreck, or about to be, is not gone by at all,
				// wherever across the road it is: it will be backing up across
				// it. This one stands well off until the wreck is on its hook.
				if (fore > -6 && fore < STAND_OFF + stopping && Math.abs(side) < 9) limit = 0;
			} else if (fore > 0 && fore < 12 + stopping && Math.abs(side) < 3.4) {
				limit = Math.min(limit, Math.max(0, other.speed - 1));
			}
		}
		return limit;
	}

	/**
	 * Off the track, the truck does not drive into a car that is in the pits:
	 * one stopped in the lane ahead of it, or standing in a box it has to go
	 * through. It waits for it.
	 */
	function pitTraffic() {
		if (truck.across > -HALF_CORRIDOR) return Infinity;
		const { x, y, angle } = axleAt(TRUCK.axle);
		// as far ahead as it would take to stop, and a little more
		const stopping = pace ** 2 / (3 * BRAKE);
		const probe = (far: number) => [x + Math.cos(angle) * far, y + Math.sin(angle) * far];
		for (let far = 2.5; far <= 5 + stopping; far += 2.5) {
			const [px, py] = probe(far);
			for (const car of cars) {
				if (car.lane < LANE.in) continue;
				const at = car.body.getPosition();
				if (Math.hypot(at.x - px, at.y - py) < SHY) return 0;
			}
		}
		// Nor into the other truck, which may be held at the end of the lane
		// ahead of it. (No further ahead than it must look for this: the
		// other may be on the stand in front of the one it is pulling up on.)
		for (let far = 2.5; far <= 2.5 + stopping; far += 2.5) {
			const [px, py] = probe(far);
			for (const other of yard.trucks) {
				if (other !== truck && Math.hypot(other.x - px, other.y - py) < SHY_TRUCK) return 0;
			}
		}
		return Infinity;
	}

	return {
		truck,

		/** How many wrecks the truck has still to see to. */
		get jobs() {
			return waiting.length + (wreck ? 1 : 0);
		},

		/** Which stand it has, the front one being 0; more than any, while it has none. */
		get stand() {
			return slot < 0 ? yard.stands.length : slot;
		},

		/** Whether this truck leaves the track clear: no wreck waiting, and none on the hook still on it. */
		get clear() {
			return (
				waiting.length === 0 &&
				(stage === 'parked' ||
					stage === 'home' ||
					stage === 'drop' ||
					// with a wreck in tow, once it is behind the wall
					(stage === 'tow' && gone >= door!.to))
			);
		},

		/** Whether this truck has every wreck of its own on its way off: none waiting, and none it has yet to pick up. */
		get away() {
			return (
				waiting.length === 0 &&
				(stage === 'parked' || stage === 'home' || stage === 'drop' || stage === 'tow')
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
			// One truck at a time goes for a wreck: the next sets off once the
			// one before has its wreck on the hook and is on its way in, so two
			// are never at work on the same piece of track, where wrecks often
			// lie together. Nor does the truck behind set off until the one in
			// front has gone; with nothing to fetch, it moves up when it has.
			alone = yard.trucks.every((other) => other === truck || !other.fetching);
			const front = yard.stands[0];
			const freed = slot === 0 || front === null;
			if (stage === 'parked' && waiting.length && time >= ready && freed && alone) fetch();
			else if (stage === 'parked' && slot > 0 && front === null) {
				goHome();
				shuffling = true;
			}
			// a call on the way home is answered from where the truck is
			if (stage === 'home' && waiting.length && alone) fetch();

			if (stage === 'parked') {
				rest(body);
			} else if (stage === 'out') {
				if (advance(dt, pitTraffic())) {
					stage = 'held';
					timer = 0;
					// out of the way of its stand, which is anybody's now
					if (vacating >= 0) yard.stands[vacating] = null;
					vacating = -1;
				}
			} else if (stage === 'held') {
				rest(body);
				timer += dt;
				const rolling = wreck!.body.getLinearVelocity();
				const still = Math.hypot(rolling.x, rolling.y) < 0.5;
				if (still && timer > 0.3 && !passing() && (open() || timer > PATIENCE)) approach();
			} else if (stage === 'approach') {
				if (advance(dt, traffic(dt))) back();
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
				if (advance(dt, Math.min(traffic(dt), pitTraffic()), HAUL)) {
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
					if (waiting.length && alone) fetch();
					else goHome();
				}
			} else if (stage === 'home') {
				if (advance(dt, pitTraffic())) stage = 'parked';
			}

			// moving up a stand is not being out on a job
			if (stage !== 'home') shuffling = false;
			truck.busy = stage !== 'parked' && !shuffling;

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
