import { PolygonShape, type World } from 'planck';
import { LANE, pitsFor } from './pits';
import { NEARSIDE, RING, TRUCK, TRUCK_HALF, serviceFor, type Pose, type Route } from './service';
import type { Car } from './sim';
import { HALF_CORRIDOR, clamp, lateral, nearest, triangle, type Track } from './track';

// The tow trucks and the job they do. Each is a flatbed with room on its bed
// for two cars, one behind the other, and a crane between the cab and the
// bed to lift them on and off. They stand at the end of the pit lane, past
// the last box (pits.ts), one behind the other, and the pit lane is their way
// onto the track and off it. The one in front goes first, and the one behind
// moves up; one coming back takes the stand in front if it is empty and the
// one behind if it is not, so neither ever has to get past the other.
//
// Called for a wreck, a truck pulls out to the end of the lane and holds
// there until the cars have gone by. Then it goes out onto the track and
// round to the wreck, and pulls up alongside it with its crane level with
// the middle of it. The crane swings out over the wreck, the crew put the
// slings on, and it lifts the wreck, swings it in over the bed and lets it
// down there. With room for another and another to fetch, the truck goes on
// for that one; with a full bed, or nothing more to fetch, it goes on round
// the lap, in at the way into the pits, and down the lane. It stops beside
// each wreck's own box, and the crane lifts the wreck off the bed and into
// the box. Then it goes back to its stand, or straight out for the next.
//
// The truck is not driven like a car. It follows a way worked out for each
// part of the job (service.ts), with one axle on the way and the other
// following it, so it turns only as it moves and no tighter than the way
// bends. What is on the crane or the bed goes where the truck takes it, off
// the ground, where no car can touch it. The cars can run into the truck,
// but it cannot be pushed about.

/** Seconds from the call to the truck leaving its stand. */
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
/** From the middle of a car to either end of it, and to either side. */
const NOSE = 2.1;
const FLANK = 0.95;
/** How far forward of the axle it is steered by the crane is: the truck stops with that axle this far past what it is to lift. */
const LEAD = TRUCK.axle - TRUCK.pivot;
/** The furthest the crane reaches. */
const REACH = 8;
/** The crane folded away: across the truck, just behind the cab. */
const STOWED = { swing: Math.PI / 2, reach: 1 };
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
/** How fast it squares itself up on its stand, m/s at its ends. */
const SQUARE = 1.2;
/** How fast it goes down the pit lane, m/s. */
const LANE_PACE = 11;
/** On the track, a truck stops this far short of another that is going for a wreck or at work on one (m). */
const STAND_OFF = 40;
/** On the track, it waits this long behind a car that is all but stopped in its way before it goes on regardless. */
const FORBEARANCE = 6;
/** After this long held at the end of the lane, the truck goes whoever is coming. */
const PATIENCE = 8;

/** How many cars a truck's bed holds. */
export const LOAD = TRUCK.bed.length;

/** An angle as the short way round, -π to π. */
const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Moves a value towards another, no more than `step`; says whether it got there. */
function toward(value: number, to: number, step: number): [number, boolean] {
	return Math.abs(to - value) <= step ? [to, true] : [value + Math.sign(to - value) * step, false];
}

export type Truck = ReturnType<typeof createTruck>['truck'];

/** The crane: which way it points from straight ahead (radians, towards the truck's left positive), how far out its hook is from where it turns, and how high it has lifted what is on it, 0 to 1. */
export type Crane = { swing: number; reach: number; raise: number };

/**
 * Something on the road, as the drivers see the trucks: a truck is one at
 * each end of it, so a car coming up behind one sees the back of it as well
 * as the front.
 */
export type Marker = Pick<Truck, 'sample' | 'across' | 'speed' | 'retired' | 'towed'>;

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
		/** Whether the track is clear: no wreck waiting, and none on a truck still on it. */
		get clear() {
			return crews.every((crew) => crew.clear);
		},
		/** Whether every wreck is on its way off: none waiting, and none still lying where it stopped. The last may be on a truck still on the track. */
		get away() {
			return crews.every((crew) => crew.away);
		},
		/** The trucks out on the track, each as a marker at either end of it, for the cars to go round. */
		get onTrack(): Marker[] {
			return crews.flatMap((crew) => crew.markers);
		},
		/**
		 * Sends a truck for a wreck: one already out for wrecks with room on
		 * its bed for this one too, or failing that one on its stand, the
		 * front one first; and if neither truck has room, the one with the
		 * fewest to fetch, which comes back out for it.
		 */
		call(car: Car, time: number) {
			const taking = crews
				.filter((crew) => crew.room > 0)
				.sort((a, b) => Number(b.out) - Number(a.out) || a.stand - b.stand);
			const crew =
				taking[0] ??
				crews.reduce((best, crew) =>
					(crew.jobs - best.jobs || crew.stand - best.stand) < 0 ? crew : best
				);
			crew.call(car, time);
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
	const { ahead, drive } = serviceFor(track);
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
	const homeOf = (which: number) => ((lane.stands[which].front % n) + n) % n;
	const exit = (((lane.leave - HOLD) % n) + n) % n;
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
		/** Forward speed, m/s. */
		speed: 0,
		/** Out on a job, lights going, rather than on its stand. */
		busy: false,
		/** The car on the crane, as an index into the race's cars, or -1. */
		towing: -1,
		/** The cars on the bed, by their places on it (TRUCK.bed), as indices into the race's cars: -1 where there is room. */
		load: TRUCK.bed.map(() => -1),
		crane: { ...STOWED, raise: 0 } as Crane,
		/** Where on the lap the axle it is steered by is, as a car's place is kept. */
		sample: homeOf(slot),
		across: stand.across,
		// To a driver it is one more wreck to go round.
		retired: true as const,
		/** Whether it has a car on board, on the bed or on the crane. */
		get towed(): boolean {
			return this.towing >= 0 || this.load.some((car) => car >= 0);
		},
		/** What it is doing: on its stand, going out, held at the end of the lane, on its way to a wreck, lifting one, taking them in, putting one in its box, or going back. */
		get doing() {
			return stage;
		},
		/** On its way to a wreck or at work on one. */
		get fetching(): boolean {
			return stage === 'out' || stage === 'held' || stage === 'approach' || stage === 'lift';
		}
	};
	/**
	 * The front of the truck, as the drivers see it: where the truck is, but
	 * for one stopped beside a wreck to lift it, which is the two of them
	 * together, to be gone round as one, the same side all the way by.
	 */
	const nose = {
		sample: homeOf(slot),
		across: stand.across,
		speed: 0,
		retired: true as const,
		towed: false
	};
	/** The back of the truck, as the drivers see it. */
	const tail = {
		sample: (homeOf(slot) - Math.round(TRUCK.axle + TRUCK.long) + n) % n,
		across: stand.across,
		speed: 0,
		retired: true as const,
		towed: false
	};

	/** Wrecks called in and not yet gone for. */
	const waiting: Car[] = [];
	let stage: 'parked' | 'out' | 'held' | 'approach' | 'lift' | 'haul' | 'drop' | 'home' | 'park' =
		'parked';
	/** The wreck being gone for, until it is off the ground. */
	let wreck: Car | null = null;
	/** Where the truck comes out onto the track, which is where it looks for a gap. */
	const gate = (((lane.leave + lane.ramp / 2) % n) + n) % n;
	/** When the truck may leave its stand. */
	let ready = 0;
	/**
	 * The way being driven, how fast each point of it may be passed, how far
	 * along it the front axle is and how fast it is going. The back axle is on
	 * the way too, behind it.
	 */
	let way: Route | null = null;
	let caps = new Float64Array(0);
	let gone = 0;
	let at = 0;
	let pace = 0;
	/** The way the front axle faces as the way begins, which is the way to the back one, reversed. */
	let setOff = 0;
	/** Seconds in the crane's step, for the ones that are waits. */
	let timer = 0;
	/** Seconds it has been waiting behind a car on the track. */
	let waited = 0;
	/** Hauling: how far along the way the truck and all it carries are through the wall. */
	let door = 0;
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
		setOff = body.getAngle();
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

	/** How far along the way its front axle first comes to a sample. */
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
		truck.speed = pace;
		const reached = arrived ? count - 1 : at;
		truck.sample = way!.sample[reached];
		truck.across = way!.across[reached];
		// one axle is on the way here and the other on it a wheelbase behind:
		// the truck is between them, facing from its back axle to its front
		const [lx, ly] = point(gone);
		const [fx, fy] = point(gone - 2 * TRUCK.axle);
		move(body, (lx + fx) / 2, (ly + fy) / 2, Math.atan2(ly - fy, lx - fx), dt);
		return arrived;
	}

	/** How many cars the truck has on, or is going for. */
	const aboard = () =>
		truck.load.filter((car) => car >= 0).length + (stage === 'lift' && truck.towing >= 0 ? 1 : 0);

	/** Sets off for the wrecks waiting, from wherever the truck is: to the end of the lane, to hold there. */
	function fetch() {
		// The stand it is leaving is kept until it is out of the way; one it
		// was only on its way to is given up at once.
		if (slot >= 0 && stage === 'parked') vacating = slot;
		else if (slot >= 0) yard.stands[slot] = null;
		slot = -1;
		const from = truck.sample;
		const hold = from + ahead(from, exit);
		take(
			drive(
				on(TRUCK.axle),
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
	 * Where across the track the truck pulls up beside a wreck: far enough to
	 * one side of it to clear it, the way it is lying, and on the tarmac if
	 * there is room for that either side of it. If there is not, it goes the
	 * side that takes it least far onto the verge, and as far as it has to.
	 */
	function beside(car: Car) {
		const skew = car.body.getAngle() - Math.atan2(track.ty[car.sample], track.tx[car.sample]);
		const wide = Math.abs(Math.sin(skew)) * NOSE + Math.abs(Math.cos(skew)) * FLANK;
		const clear = Math.min(PASS, wide + TRUCK_HALF + GAP);
		const sides = [car.across - clear, car.across + clear].sort(
			(a, b) => Math.abs(a) - Math.abs(b)
		);
		return clamp(sides[0], -EDGE, EDGE);
	}

	/**
	 * Where the truck can start for a wreck from: held at the end of the lane,
	 * where it comes onto the track, at the infield side of it; out on the
	 * track, where it is. And the way there, as far as that.
	 */
	function start(): { from: number; across: number; keys: [number, number][] } {
		if (stage === 'held') {
			const from = truck.sample;
			const on = from + HOLD + lane.ramp;
			return {
				from: on,
				across: NEARSIDE,
				keys: [
					[from, -RING],
					[from + HOLD, -RING],
					[on, NEARSIDE]
				]
			};
		}
		const front = on(TRUCK.axle);
		const from = nearest(track, front.x, front.y, truck.sample);
		const across = lateral(track, front.x, front.y, from);
		return { from, across, keys: [[from, across]] };
	}

	/**
	 * How far on round the lap from a start a wreck is, as the truck goes to
	 * it, and how far along it takes to get across to the side it pulls up on.
	 * That is gently, if there is room, and if not as sharply as a truck can,
	 * slowly; one nearer than that is gone round the lap for. One that has
	 * been knocked on a little way up the road from a truck that pulled up
	 * for it is only crept up to.
	 */
	function lying(car: Car, from: number, across: number, creep = false) {
		const over = Math.abs(beside(car) - across);
		const gentle = clamp(over * 4, 2, DRIFT);
		const sharp = clamp(over * 2, 2, DRIFT);
		const least = from + (creep ? 2 : sharp + STRAIGHT_ON);
		const at = least + ahead(least, car.sample);
		return { at, drift: creep ? 0 : Math.min(gentle, at - from - STRAIGHT_ON) };
	}

	/** Of the wrecks waiting, the one the truck comes to first from a start. */
	function next(from: number, across: number) {
		let best: Car | null = null;
		let nearest = Infinity;
		for (const car of waiting) {
			const far = lying(car, from, across).at;
			if (far < nearest) [best, nearest] = [car, far];
		}
		return best;
	}

	/** Where the wreck the truck is on its way to was when it set out for it. */
	let sighted = { x: 0, y: 0 };

	/**
	 * Off to the next wreck: out the way out of the pits, or on down the
	 * track, across to the side of it it pulls up on, and alongside it. Or
	 * with `creep`, just on up the road to the one it was lifting, which has
	 * been knocked out of its reach.
	 */
	function approach(creep = false) {
		const { from, across, keys } = start();
		if (!creep) wreck = next(from, across)!;
		waiting.splice(waiting.indexOf(wreck!), 1);
		const side = beside(wreck!);
		const { at, drift } = lying(wreck!, from, across, creep);
		const stop = at + LEAD;
		if (creep) keys.push([stop, side]);
		else {
			keys.push(
				[Math.max(from, stop - STRAIGHT_ON - drift), across],
				[Math.max(from, stop - STRAIGHT_ON), side],
				[stop, side]
			);
		}
		take(drive(on(TRUCK.axle), keys), truck.towed);
		sighted = wreck!.body.getPosition().clone();
		stage = 'approach';
	}

	/**
	 * Whether the wreck the truck is on its way to has been knocked well away
	 * from where it was when it set out, with room yet to set out for it
	 * again from here, and lying far enough on up the road that doing so does
	 * not take it round the lap. (One knocked nearer than that it goes on to
	 * where it was for, and creeps up to it from there.)
	 */
	function moved() {
		const { x, y } = wreck!.body.getPosition();
		const room = DRIFT + STRAIGHT_ON + 4 + pace ** 2 / (2 * BRAKE);
		return (
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

	/** The crane at work on a wreck from where the truck has stopped. */
	function lift() {
		stage = 'lift';
		job = 'reach';
		timer = 0;
		truck.speed = pace = 0;
	}

	/** With a wreck on the bed: on for the next, if there is room for it, and if not, off with them. */
	function onward() {
		const room = truck.load.includes(-1);
		const near = waiting.find(reachable);
		if (room && near) {
			waiting.splice(waiting.indexOf(near), 1);
			wreck = near;
			lift();
		} else if (room && waiting.length) approach();
		else haul();
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
		const front = on(TRUCK.axle);
		const from = nearest(track, front.x, front.y, truck.sample);
		const across = lateral(track, front.x, front.y, from);
		// far enough to be back at the kerb without throwing what is on about
		const run = Math.ceil(Math.max(10, Math.sqrt(42 * Math.abs(across - NEARSIDE))));
		const into = from + run + ahead(from + run, lane.entry);
		// how long the way in is, from the track to the lane
		const slip = lane.in1 - lane.in0;
		const box = besideBox(truck.load[drops()[0]], into);
		const keys: [number, number][] = [
			[from, across],
			[from + run, NEARSIDE],
			[into, NEARSIDE]
		];
		if (box > into + slip + 1) keys.push([into + slip, -RING]);
		keys.push([box, -RING]);
		// it may be standing well askew, having pulled up beside a wreck lying across the road
		take(drive(front, keys, 14), true);
		// the track is clear once the truck is behind the wall
		door = reach(into + slip + THROUGH);
		stage = 'haul';
	}

	/** Down the lane, from one box to the next. */
	function onDown() {
		const from = truck.sample;
		const box = besideBox(truck.load[drops()[0]], lane.in0) % n;
		const to = from + ahead(from, box);
		// (one it is already level with, or a whisker past, it puts in from here)
		if (to - from < 1 || to - from > n / 2) return drop();
		take(
			drive(on(TRUCK.axle), [
				[from, truck.across],
				[to, -RING]
			]),
			true
		);
		stage = 'haul';
	}

	/** The crane at work putting a car from the bed into its box. */
	function drop() {
		stage = 'drop';
		job = 'reach';
		timer = 0;
		truck.speed = pace = 0;
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
		// in line with the stand by the time its back axle is on it, if there is room for that
		const { front, back } = lane.stands[slot];
		const straight = Math.ceil(front - back) + 1;
		const keys: [number, number][] = [[sample, across]];
		if (to - sample > straight + 20) {
			keys.push([sample + 9, -RING], [to - straight - 10, -RING], [to - straight, stand.across]);
		} else if (to - sample > straight + 6) keys.push([to - straight, stand.across]);
		keys.push([to, stand.across]);
		take(drive(on(TRUCK.axle), keys), false);
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
			if (Math.abs(car.across - truck.across) >= 3.2) continue;
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
		const { x, y, angle } = on(TRUCK.axle);
		for (const other of yard.trucks) {
			if (other === truck) continue;
			const fore = (other.x - x) * Math.cos(angle) + (other.y - y) * Math.sin(angle);
			const side = (other.y - y) * Math.cos(angle) - (other.x - x) * Math.sin(angle);
			const stopping = pace ** 2 / (2 * BRAKE);
			if (other.fetching && other.across > -HALF_CORRIDOR) {
				// One that is at a wreck, or about to be, is not gone by at all,
				// wherever across the road it is: it will be swinging its crane
				// across it. This one stands well off until it is done.
				if (fore > -6 && fore < STAND_OFF + stopping && Math.abs(side) < 9) limit = 0;
			} else if (fore > 0 && fore < 18 + stopping && Math.abs(side) < 3.4) {
				limit = Math.min(limit, Math.max(0, other.speed - 1));
			}
		}
		return limit;
	}

	/** Whether a place is on another truck, or within `margin` of it. */
	function onTruck(other: Truck, px: number, py: number, margin: number) {
		const [cos, sin] = [Math.cos(other.angle), Math.sin(other.angle)];
		const [dx, dy] = [px - other.x, py - other.y];
		return (
			Math.abs(dx * cos + dy * sin) < TRUCK.long + margin &&
			Math.abs(dy * cos - dx * sin) < TRUCK.wide + margin
		);
	}

	/**
	 * Off the track, the truck does not drive into a car that is in the pits:
	 * one stopped in the lane ahead of it, or standing in a box it has to go
	 * through. It waits for it.
	 */
	function pitTraffic() {
		if (truck.across > -HALF_CORRIDOR) return Infinity;
		const { x, y, angle } = on(TRUCK.axle);
		// as far ahead as it would take to stop, and a little more
		const stopping = pace ** 2 / (3 * BRAKE);
		const probe = (far: number) => [x + Math.cos(angle) * far, y + Math.sin(angle) * far];
		for (let far = BUMPER + 0.5; far <= BUMPER + 3 + stopping; far += 2.5) {
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
		for (let far = BUMPER + 0.6; far <= BUMPER + 0.6 + stopping; far += 2.5) {
			const [px, py] = probe(far);
			for (const other of yard.trucks) {
				if (other !== truck && onTruck(other, px, py, SHY_TRUCK)) return 0;
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
				// A wreck knocked out of reach since the truck pulled up is gone
				// after again: crept up to, if it is a little way up the road.
				if (!reachable(wreck!)) {
					const creep = ahead(truck.sample, wreck!.sample) < 40;
					waiting.unshift(wreck!);
					if (!creep) wreck = null;
					return approach(creep);
				}
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
			const { car, place } = carried!;
			let to: { swing: number; reach: number };
			let lie: number;
			if (loading) {
				to = overBed(place);
				const facing = turn(carried!.lie + truck.crane.swing);
				lie = Math.abs(facing) < Math.PI / 2 ? 0 : Math.PI;
				lies[place] = lie;
			} else {
				const box = lane.boxes[cars.indexOf(car)];
				to = aim(box.x, box.y);
				const facing = turn(carried!.lie + truck.crane.swing + body.getAngle() - box.angle);
				lie = box.angle - body.getAngle() + (Math.abs(facing) < Math.PI / 2 ? 0 : Math.PI);
			}
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
			const { car, place } = carried!;
			truck.towing = -1;
			carried = null;
			if (loading) {
				truck.load[place] = cars.indexOf(car);
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
			if (drops().length) onDown();
			else if (waiting.length && alone) fetch();
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
			const { swing, reach } = truck.crane;
			const [px, py] = [cx + cos * TRUCK.pivot, cy + sin * TRUCK.pivot];
			const toward = facing + swing;
			move(
				carried.car.body,
				px + Math.cos(toward) * reach,
				py + Math.sin(toward) * reach,
				toward + carried.lie,
				dt
			);
		}
	}

	return {
		truck,

		/** Where the drivers see the truck, while it is out on the track: one marker at the front of it, and one at the back. */
		get markers(): Marker[] {
			if (!truck.busy) return [];
			return [nose, tail].filter((end) => end.across > -HALF_CORRIDOR - 1);
		},

		/** How many wrecks the truck has still to see to. */
		get jobs() {
			return waiting.length + (wreck ? 1 : 0) + truck.load.filter((car) => car >= 0).length;
		},

		/** How many more wrecks this truck can take on, on its way out for them or at work on the track; none once it is on its way in with them. */
		get room() {
			const taking =
				stage === 'parked' ||
				stage === 'home' ||
				stage === 'park' ||
				stage === 'out' ||
				stage === 'held' ||
				stage === 'approach' ||
				stage === 'lift';
			return taking ? LOAD - aboard() - waiting.length - (wreck ? 1 : 0) : 0;
		},

		/** Whether it is out for wrecks already. */
		get out() {
			return truck.fetching;
		},

		/** Which stand it has, the front one being 0; more than any, while it has none. */
		get stand() {
			return slot < 0 ? yard.stands.length : slot;
		},

		/** Whether this truck leaves the track clear: no wreck waiting, and none on board still on it. */
		get clear() {
			return (
				waiting.length === 0 &&
				!wreck &&
				(stage === 'parked' ||
					stage === 'home' ||
					stage === 'park' ||
					stage === 'drop' ||
					// on its way in, once it is behind the wall
					(stage === 'haul' && gone >= door))
			);
		},

		/** Whether this truck has every wreck of its own on its way off: none waiting, and none it has yet to lift. */
		get away() {
			return waiting.length === 0 && !wreck;
		},

		/** Sends the truck for a wreck, after any it is already going for. */
		call(car: Car, time: number) {
			if (stage === 'parked' && waiting.length === 0) ready = time + SCRAMBLE;
			waiting.push(car);
		},

		/** One step of the job. Call before the world is stepped. */
		step(time: number, dt: number) {
			// One truck at a time goes for wrecks: the next sets off once the
			// one before has all it is going for on its bed and is on its way
			// in, so two are never at work on the same piece of track, where
			// wrecks often lie together. Nor does the truck behind set off
			// until the one in front has gone; with nothing to fetch, it moves
			// up when it has.
			alone = yard.trucks.every((other) => other === truck || !other.fetching);
			const front = yard.stands[0];
			const freed = slot === 0 || front === null;
			if (stage === 'parked' && waiting.length && time >= ready && freed && alone) fetch();
			else if (stage === 'parked' && slot > 0 && front === null) {
				goHome();
				shuffling = true;
			}
			// a call on the way home is answered from where the truck is
			if ((stage === 'home' || stage === 'park') && waiting.length && alone) fetch();

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
				const { from, across } = start();
				const rolling = next(from, across)!.body.getLinearVelocity();
				const still = Math.hypot(rolling.x, rolling.y) < 0.5;
				if (still && timer > 0.3 && !passing() && (open() || timer > PATIENCE)) approach();
			} else if (stage === 'approach') {
				// one knocked on since the truck set out for it is set out for again
				if (moved()) {
					waiting.unshift(wreck!);
					wreck = null;
					approach();
				}
				if (advance(dt, traffic(dt), truck.towed ? HAUL : PULL)) lift();
				else if (way!.length - gone < READY) {
					// the crane swung round to the wreck as the truck comes up to it
					const { x, y } = wreck!.body.getPosition();
					const { swing } = aim(x, y);
					slew({ swing, reach: STOWED.reach + 1 }, dt);
				} else slew(STOWED, dt);
			} else if (stage === 'lift' || stage === 'drop') {
				rest(body);
				work(dt);
			} else if (stage === 'haul') {
				if (advance(dt, Math.min(traffic(dt), pitTraffic()), HAUL)) drop();
			} else if (stage === 'home') {
				if (advance(dt, pitTraffic())) stage = 'park';
			} else if (stage === 'park') {
				// The way home ends with its front axle where it should be, but
				// one that turned in off the lane short of the stand has its back
				// still out towards the lane: it is brought round square.
				const { x, y, angle } = lane.stands[slot];
				const at = body.getPosition();
				const [dx, dy] = [x - at.x, y - at.y];
				const off = turn(angle - body.getAngle());
				const far = Math.hypot(dx, dy);
				const step = Math.min(1, (SQUARE * dt) / Math.max(far, Math.abs(off) * TRUCK.axle, 1e-9));
				move(body, at.x + dx * step, at.y + dy * step, body.getAngle() + off * step, dt);
				if (step === 1) stage = 'parked';
			}
			// with nothing to do, the crane is folded away
			if (stage !== 'lift' && stage !== 'drop' && stage !== 'approach') slew(STOWED, dt);

			// moving up a stand is not being out on a job
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
			const lifting = stage === 'lift' ? (wreck ?? carried?.car) : null;
			nose.sample = truck.sample;
			nose.across = lifting ? (truck.across + lifting.across) / 2 : truck.across;
			nose.speed = truck.speed;
			nose.towed = truck.towed;
			const back = on(-TRUCK.long);
			tail.sample = nearest(track, back.x, back.y, tail.sample);
			// (and the back of it too: the way by is the way by the two of them)
			tail.across = lifting ? nose.across : lateral(track, back.x, back.y, tail.sample);
			tail.speed = truck.speed;
			tail.towed = truck.towed;
		}
	};
}
