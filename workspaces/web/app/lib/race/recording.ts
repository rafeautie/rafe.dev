import { planStop, type Plan } from './crew';
import { LANE, pitsFor, type Stop } from './pits';
import { LOAD, STOWED, type Crane } from './recovery';
import type { Entry } from './roster';
import { TRUCK as TOW_TRUCK } from './service';
import {
	CLASSIC,
	createRace,
	DT,
	flown,
	HULL,
	LIGHTS,
	RULES,
	timeCap,
	type Flag,
	type RaceEvent,
	type Rules
} from './sim';
import { clamp, getTrack, type Track, type TrackId } from './track';

// A whole race, run ahead of time and written down so it can be played back
// anywhere: where every car and tow truck was thirty times a second, and what
// happened. Whoever runs the race keeps the result; everyone watching gets the
// recording and sees exactly the same thing, without running any physics.

/** Positions are written down every other step of the race. */
const EVERY = 2;
/** Bytes for one car at one moment: x, y, angle and progress as 16 bits each, speed and slip as 8. */
const POSE = 10;
/** And three more in a race with pits: fuel, tyre wear, and where the car is with the pits. */
const PITS = 3;
/** Progress is written down in whole numbers of this many to the metre: fewer in a longer race, so it still fits. */
const FINE = 20;
const COARSE = 10;
/**
 * Bytes for one truck at one moment: x, y and angle as 16 bits each, what it
 * is doing, the car on each place on its bed (counted from 1, 0 for none),
 * and its crane: which way it points, how far out, and how high it has lifted
 * what is on it; and how far its front wheels are turned. A recording from
 * before the trucks steered has all but the last, and one from before they
 * had beds and cranes only the first and a byte that said which gate it had
 * open, when there were gates.
 */
const TRUCK = 7 + LOAD + 4;
const UNSTEERED_TRUCK = TRUCK - 1;
const OLD_TRUCK = 8;
/** What a truck is doing: the car on its crane (its hook, in an old recording), counted from 1, in the low bits, and this one set while it is out. */
const BUSY = 128;
/** The crane's boom is written down in whole numbers of this many to the metre. */
const BOOM = 24;
/** Recorded dents are whole numbers of this many metres. */
const DENT = 0.005;

/** An event as recorded: a hit also carries the car's outline after it. */
export type RecordedEvent = RaceEvent & { hull?: number[] };

export type Recording = {
	/** Which track the race was run on. */
	track: TrackId;
	/** Moments recorded per second. */
	rate: number;
	/** How many moments, the first at time 0. */
	frames: number;
	/** The cars' ids in starting order, which is the order of everything else here. */
	grid: string[];
	/** How many laps the race set out to be. One recorded before that could change was three. */
	laps?: number;
	/** In a race with pits, what a full tank holds; each car's moments are then PITS bytes longer. */
	tank?: number;
	/** How many to the metre progress is recorded in, where it is not FINE. */
	per?: number;
	events: RecordedEvent[];
	/** How many tow trucks are recorded. A recording from before there were any has none. */
	trucks?: number;
	/** Whether the trucks are recorded with their beds and cranes, as they all are now. */
	cranes?: true;
	/** Whether they are recorded with how far their front wheels are turned, as they all are now. */
	steering?: true;
	/** `frames` moments, each `grid.length` cars of POSE bytes and then the trucks, of TRUCK bytes (UNSTEERED_TRUCK without `steering`, OLD_TRUCK without `cranes` either). */
	poses: Uint8Array;
};

/** A tow truck as it is at the moment the replay is showing. */
export type ReplayTruck = {
	x: number;
	y: number;
	angle: number;
	/** Out on a job, rather than on its stand at the end of the pit lane. */
	busy: boolean;
	/** The car on its crane, as an index into the cars, or -1. */
	towing: number;
	/** The cars on its bed, by their places on it, as indices into the cars: -1 where there is room. */
	load: number[];
	crane: Crane;
	/** How far its front wheels are turned, towards its left positive. */
	steer: number;
};

/** A car as it is at the moment the replay is showing. */
export type ReplayCar = {
	entry: Entry;
	x: number;
	y: number;
	angle: number;
	speed: number;
	slip: number;
	hull: Float32Array;
	damage: number;
	retired: boolean;
	progress: number;
	laps: number;
	bestLap: number;
	/** Its last lap's time, or 0 before it has ended one. */
	lastLap: number;
	finishTime: number;
	/** Fuel as a share of a full tank and tyre wear, 0 to 1 (a race with no pits has a full tank and new tyres throughout), and where the car is with the pits (LANE in pits.ts). */
	fuel: number;
	wear: number;
	lane: number;
	/**
	 * The stop the car is making or last made: what for, the seconds it has
	 * stood, whether the crew fumbled it, whether it is over, and the jobs it
	 * is made of (crew.ts).
	 */
	stop: {
		service: Stop;
		since: number;
		seconds: number;
		slow: boolean;
		over: boolean;
		plan: Plan;
	} | null;
	/** On its way in to its box: the stop it is coming in to make, which its crew get ready for. */
	coming: Plan | null;
};

/**
 * The jobs of a recorded stop. One recorded before they were has the
 * service only, and is taken to be a middling stop for it.
 */
export function planOf(event: Extract<RaceEvent, { kind: 'pit' }>): Plan {
	const { service } = event;
	if (event.fuel === undefined) {
		const [fuel, tyres] = [service === 'tyres' ? 0 : 3, service === 'fuel' ? 0 : 3.6];
		return planStop(service, fuel, tyres, 0, Math.max(fuel, tyres) + (fuel && tyres ? 0.8 : 0));
	}
	const seconds = Math.max(event.fuel, event.tyres) + event.fumble;
	return planStop(service, event.fuel, event.tyres, event.fumble, seconds);
}

export type Replay = ReturnType<typeof createReplay>;

/** The trucks as they stand when none is out: each on its stand at the end of the pit lane, with nothing on. */
export function standing(track: Track): ReplayTruck[] {
	return pitsFor(track).stands.map(({ x, y, angle }) => ({
		x,
		y,
		angle,
		busy: false,
		towing: -1,
		load: Array.from({ length: LOAD }, () => -1),
		crane: { ...STOWED },
		steer: 0
	}));
}

// adding 0 turns the -0 that rounding can give into 0, which JSON would do anyway
const round = (value: number, places = 0) => Math.round(value * 10 ** places) / 10 ** places + 0;

/**
 * Runs the race for a seed and starting order on a track to its end, and
 * returns it recorded. `flags` are the race times at which a caution is
 * thrown by hand, and `rules` what the race is run to.
 */
export function record(
	seed: number,
	grid: Entry[],
	track: Track,
	flags: number[] = [],
	rules: Rules = RULES
): Recording {
	const race = createRace(seed, grid, track, flags, rules);
	const longest = Math.ceil((LIGHTS + timeCap(rules.laps)) / DT / EVERY) + 2;
	const pose = POSE + (rules.pits ? PITS : 0);
	// fine, unless the race is long or the track is, and the distance it could
	// run to (the laps, and one more after the flag) would not fit
	const far = (rules.laps + 1) * track.length + 100;
	const per = rules.laps > CLASSIC.laps || far * FINE > 65535 ? COARSE : FINE;
	const moment = grid.length * pose + race.trucks.length * TRUCK;
	const view = new DataView(new ArrayBuffer(longest * moment));
	const heading = (angle: number) => {
		const turn = angle / (2 * Math.PI);
		return (turn - Math.floor(turn)) * 65536;
	};
	const events: RecordedEvent[] = [];
	let frames = 0;
	/** Whether any truck has been off its stand. */
	let called = false;

	const write = () => {
		race.cars.forEach((car, index) => {
			const at = frames * moment + index * pose;
			view.setUint16(at, car.x * 256, true);
			view.setUint16(at + 2, car.y * 256, true);
			view.setUint16(at + 4, heading(car.angle), true);
			view.setUint16(at + 6, Math.min(65535, (car.progress + 100) * per), true);
			view.setInt8(at + 8, Math.max(-127, Math.min(127, car.speed * 2)));
			view.setUint8(at + 9, Math.min(255, car.slip * 10));
			if (!rules.pits) return;
			view.setUint8(at + 10, Math.round((car.fuel / rules.tank) * 255));
			view.setUint8(at + 11, Math.round(car.wear * 255));
			view.setUint8(at + 12, car.lane);
		});
		race.trucks.forEach((truck, index) => {
			const at = frames * moment + grid.length * pose + index * TRUCK;
			view.setUint16(at, truck.x * 256, true);
			view.setUint16(at + 2, truck.y * 256, true);
			view.setUint16(at + 4, heading(truck.angle), true);
			view.setUint8(at + 6, (truck.busy ? BUSY : 0) | (truck.towing + 1));
			truck.load.forEach((car, place) => view.setUint8(at + 7 + place, car + 1));
			const { swing, reach, raise } = truck.crane;
			view.setUint8(at + 7 + LOAD, Math.round(heading(swing) / 256) & 255);
			view.setUint8(at + 8 + LOAD, Math.min(255, Math.round(reach * BOOM)));
			view.setUint8(at + 9 + LOAD, Math.round(raise * 255));
			view.setInt8(at + 10 + LOAD, Math.round((truck.steer / TOW_TRUCK.lock) * 127));
			called ||= truck.busy;
		});
		frames++;
	};

	for (let tick = 0; !race.done; tick++) {
		if (tick % EVERY === 0) write();
		race.step();
		for (const event of race.events) {
			const recorded: RecordedEvent = { ...event, time: round(event.time, 3) };
			if (recorded.kind === 'hit') {
				recorded.x = round(recorded.x, 2);
				recorded.y = round(recorded.y, 2);
				recorded.force = round(recorded.force, 1);
				recorded.damage = round(recorded.damage, 3);
				recorded.hull = HULL.map((corner, k) =>
					round((race.cars[event.car].hull[k] - corner) / DENT)
				);
			} else if (recorded.kind === 'lap') {
				recorded.lap = round(recorded.lap, 3);
			} else if (recorded.kind === 'away') {
				recorded.seconds = round(recorded.seconds, 2);
			} else if (recorded.kind === 'pit') {
				recorded.fuel = round(recorded.fuel, 2);
				recorded.tyres = round(recorded.tyres, 2);
				recorded.fumble = round(recorded.fumble, 2);
			}
			events.push(recorded);
		}
		race.events.length = 0;
	}
	write();

	// Most races no truck goes out in, and they have no need of the trucks'
	// share of every moment: it is left out, and they are shown parked.
	const kept = called ? moment : grid.length * pose;
	const poses = new Uint8Array(frames * kept);
	for (let frame = 0; frame < frames; frame++) {
		poses.set(new Uint8Array(view.buffer, frame * moment, kept), frame * kept);
	}

	return {
		track: track.id,
		rate: 1 / (DT * EVERY),
		frames,
		grid: grid.map((entry) => entry.id),
		// what a recording from before there were pits could not say, and so need not
		...(rules.laps !== CLASSIC.laps && { laps: rules.laps }),
		...(rules.pits && { tank: rules.tank }),
		...(per !== FINE && { per }),
		events,
		trucks: called ? race.trucks.length : 0,
		...(called ? { cranes: true as const, steering: true as const } : {}),
		poses
	};
}

/** A recording as one run of bytes, to store or send: a JSON header, then the poses. */
export function pack(recording: Recording): Uint8Array {
	const { poses, ...rest } = recording;
	const header = new TextEncoder().encode(JSON.stringify(rest));
	const bytes = new Uint8Array(4 + header.length + poses.length);
	new DataView(bytes.buffer).setUint32(0, header.length, true);
	bytes.set(header, 4);
	bytes.set(poses, 4 + header.length);
	return bytes;
}

export function unpack(bytes: Uint8Array): Recording {
	const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
	const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
	// recorded before there was a choice of track, when there was only the circuit
	return { track: 'circuit', ...header, poses: bytes.subarray(4 + length) };
}

/**
 * Plays a recording back. `seek` moves the cars and the trucks to how they
 * were at a race time and returns what happened since the time it was last
 * at, so stepping forward a little each frame yields every event once.
 * Seeking backwards returns nothing. `gap` is the time between two cars as it
 * now stands, `flag` the flag that is flying, `extra` how many laps have been
 * ended under caution, `laps` how many it set out to be, `lap` and `raced`
 * how far through the race a car is without them, and `time` the race time
 * it is at.
 */
export function createReplay(recording: Recording, roster: Entry[]) {
	const { rate, frames, grid, events, poses } = recording;
	const track = getTrack(recording.track);
	const view = new DataView(poses.buffer, poses.byteOffset, poses.byteLength);
	const cars = grid.map((id): ReplayCar => ({
		entry: roster.find((entry) => entry.id === id)!,
		x: 0,
		y: 0,
		angle: 0,
		speed: 0,
		slip: 0,
		hull: Float32Array.from(HULL),
		damage: 0,
		retired: false,
		progress: 0,
		laps: -1,
		bestLap: 0,
		lastLap: 0,
		finishTime: 0,
		fuel: 1,
		wear: 0,
		lane: 0,
		stop: null,
		coming: null
	}));
	const laps = recording.laps ?? CLASSIC.laps;
	const pits = recording.tank !== undefined;
	const pose = POSE + (pits ? PITS : 0);
	const per = recording.per ?? FINE;
	// One that was never called out stays parked. A recording from when there
	// were more trucks than there are now has them all in its moments, but
	// only as many as there are now are shown.
	const trucks = standing(track);
	const recorded = recording.trucks ?? 0;
	const cranes = recording.cranes ?? false;
	const steering = recording.steering ?? false;
	const size = steering ? TRUCK : cranes ? UNSTEERED_TRUCK : OLD_TRUCK;
	const moment = grid.length * pose + recorded * size;
	const duration = (frames - 1) / rate;
	let flag: Flag = 'green';
	/** Laps ended under caution so far, which the race is longer by. */
	let extra = 0;
	let last = -1;
	let next = 0;

	function seek(time: number): RecordedEvent[] {
		time = Math.max(0, Math.min(duration, time));
		if (time < last) {
			// start over, and say nothing of what is passed on the way back
			for (const car of cars) {
				car.hull.set(HULL);
				car.damage = car.bestLap = car.lastLap = car.finishTime = 0;
				car.retired = false;
				car.stop = car.coming = null;
			}
			flag = 'green';
			extra = 0;
			next = 0;
		}
		const from = next;
		// event times are rounded to the millisecond, so allow them that much
		for (; next < events.length && events[next].time <= time + 0.001; next++) {
			const event = events[next];
			const car = cars[event.car];
			flag = flown(flag, event.kind);
			if (event.kind === 'again') {
				extra++;
			} else if (event.kind === 'hit') {
				car.damage = event.damage;
				event.hull?.forEach((moved, k) => (car.hull[k] = HULL[k] + moved * DENT));
			} else if (event.kind === 'lap') {
				if (!car.bestLap || event.lap < car.bestLap) car.bestLap = event.lap;
				car.lastLap = event.lap;
			} else if (event.kind === 'finish') {
				car.finishTime = event.time;
			} else if (event.kind === 'retire') {
				car.retired = true;
			} else if (event.kind === 'pit') {
				car.stop = {
					service: event.service,
					since: event.time,
					seconds: 0,
					slow: false,
					over: false,
					plan: planOf(event)
				};
				car.coming = null;
			} else if (event.kind === 'away' && car.stop) {
				car.stop = { ...car.stop, seconds: event.seconds, slow: event.slow, over: true };
			}
		}
		const passed = time < last ? [] : events.slice(from, next);
		last = time;

		// between the two recorded moments either side of this time
		const frame = Math.min(frames - 2, Math.floor(time * rate));
		const t = time * rate - frame;
		/** The 16 bits at byte `a` of this moment, on their way to those of the next. */
		const between = (a: number) =>
			view.getUint16(a, true) * (1 - t) + view.getUint16(a + moment, true) * t;
		/** The 8 bits at byte `a`, the same way. */
		const byte = (a: number) => view.getUint8(a) * (1 - t) + view.getUint8(a + moment) * t;
		/** A heading, 16 bits or 8, the short way round from the one moment to the next. */
		const facing = (a: number, bits = 16) => {
			const read = (at: number) => (bits === 16 ? view.getUint16(at, true) : view.getUint8(at));
			const full = 2 ** bits;
			const heading = read(a);
			const turned = ((read(a + moment) - heading + full * 1.5) % full) - full / 2;
			return ((heading + turned * t) / full) * 2 * Math.PI;
		};
		cars.forEach((car, index) => {
			const a = frame * moment + index * pose;
			const b = a + moment;
			car.x = between(a) / 256;
			car.y = between(a + 2) / 256;
			car.angle = facing(a + 4);
			car.progress = between(a + 6) / per - 100;
			car.laps = Math.floor(car.progress / track.length);
			car.speed = (view.getInt8(a + 8) * (1 - t) + view.getInt8(b + 8) * t) / 2;
			car.slip = (view.getUint8(a + 9) * (1 - t) + view.getUint8(b + 9) * t) / 10;
			if (car.stop && !car.stop.over) car.stop.seconds = Math.max(0, time - car.stop.since);
			if (!pits) return;
			car.fuel = (view.getUint8(a + 10) * (1 - t) + view.getUint8(b + 10) * t) / 255;
			car.wear = (view.getUint8(a + 11) * (1 - t) + view.getUint8(b + 11) * t) / 255;
			// which is one thing or another, never between: as at the nearer of the two moments
			car.lane = view.getUint8((t > 0.5 ? b : a) + 12);
			// on its way in: the stop it is coming in for is the next it makes
			if (car.lane !== LANE.called && car.lane !== LANE.in) car.coming = null;
			else if (!car.coming) {
				const stop = events.find(
					(event, at) => at >= next && event.kind === 'pit' && event.car === index
				);
				if (stop?.kind === 'pit') car.coming = planOf(stop);
			}
		});
		for (let index = 0; index < Math.min(recorded, trucks.length); index++) {
			const truck = trucks[index];
			const a = frame * moment + grid.length * pose + index * size;
			truck.x = between(a) / 256;
			truck.y = between(a + 2) / 256;
			truck.angle = facing(a + 4);
			// what it is doing is one thing or another, never between: as at the nearer of the two moments
			const nearer = t > 0.5 ? a + moment : a;
			const doing = view.getUint8(nearer + 6);
			truck.busy = doing >= BUSY;
			truck.towing = (doing & (BUSY - 1)) - 1;
			// one recorded before there were cranes is shown with its folded, and nothing on its bed
			if (!cranes) continue;
			for (let place = 0; place < LOAD; place++) {
				truck.load[place] = view.getUint8(nearer + 7 + place) - 1;
			}
			truck.crane.swing = facing(a + 7 + LOAD, 8);
			truck.crane.reach = byte(a + 8 + LOAD) / BOOM;
			truck.crane.raise = byte(a + 9 + LOAD) / 255;
			// (one recorded before the trucks steered is shown with its wheels straight)
			if (!steering) continue;
			const turned =
				view.getInt8(a + 10 + LOAD) * (1 - t) + view.getInt8(a + 10 + LOAD + moment) * t;
			truck.steer = (turned / 127) * TOW_TRUCK.lock;
		}
		return passed;
	}

	/**
	 * How many seconds ago car `ahead` was where car `behind` is now: the gap
	 * between them by the clock. Null while the car ahead has not been seen
	 * there, as on the grid, where it started further up the road.
	 */
	function gap(behind: number, ahead: number): number | null {
		const stored = (frame: number) => view.getUint16(frame * moment + ahead * pose + 6, true);
		const target = (cars[behind].progress + 100) * per;
		// the first moment recorded at which the car ahead had come this far
		let from = 0;
		let to = Math.min(frames - 1, Math.ceil(last * rate));
		while (from < to) {
			const middle = (from + to) >> 1;
			if (stored(middle) < target) from = middle + 1;
			else to = middle;
		}
		if (from === 0) return null;
		const [before, after] = [stored(from - 1), stored(from)];
		const frame = after > before ? from - 1 + (target - before) / (after - before) : from;
		return Math.max(0, last - frame / rate);
	}

	/** How fast car `index` was going at race time `time`, in m/s, as recorded. */
	function speedAt(index: number, time: number) {
		const at = Math.max(0, Math.min(duration, time)) * rate;
		const frame = Math.min(frames - 2, Math.floor(at));
		const a = frame * moment + index * pose + 8;
		return (view.getInt8(a) * (1 - (at - frame)) + view.getInt8(a + moment) * (at - frame)) / 2;
	}

	seek(0);
	return {
		track,
		duration,
		cars,
		trucks,
		seek,
		gap,
		speedAt,
		get flag() {
			return flag;
		},
		get time() {
			return last;
		},
		get extra() {
			return extra;
		},
		/** The lap of the race a car is on: one ended under caution is run again, so it is not counted. */
		/** How many laps the race set out to be, and whether its cars pit. */
		laps,
		pits,
		lap: (car: ReplayCar) => clamp(car.laps + 1 - extra, 1, laps),
		/** How much of the race a car has run, 0 to 1, counted the same way. */
		raced: (car: ReplayCar) => clamp(car.progress / track.length / laps - extra / laps, 0, 1)
	};
}
