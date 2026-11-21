import type { Entry } from './roster';
import { createRace, DT, HULL, LIGHTS, TIME_CAP, type RaceEvent } from './sim';
import { TRACK } from './track';

// A whole race, run ahead of time and written down so it can be played back
// anywhere: where every car was thirty times a second, and what happened to
// it. Whoever runs the race keeps the result; everyone watching gets the
// recording and sees exactly the same thing, without running any physics.

/** Positions are written down every other step of the race. */
const EVERY = 2;
/** Bytes for one car at one moment: x, y, angle and progress as 16 bits each, speed and slip as 8. */
const POSE = 10;
/** Recorded dents are whole numbers of this many metres. */
const DENT = 0.005;

/** An event as recorded: a hit also carries the car's outline after it. */
export type RecordedEvent = RaceEvent & { hull?: number[] };

export type Recording = {
	/** Moments recorded per second. */
	rate: number;
	/** How many moments, the first at time 0. */
	frames: number;
	/** The cars' ids in starting order, which is the order of everything else here. */
	grid: string[];
	events: RecordedEvent[];
	/** `frames` moments of `grid.length` cars, each car POSE bytes. */
	poses: Uint8Array;
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
	finishTime: number;
};

export type Replay = ReturnType<typeof createReplay>;

// adding 0 turns the -0 that rounding can give into 0, which JSON would do anyway
const round = (value: number, places = 0) => Math.round(value * 10 ** places) / 10 ** places + 0;

/** Runs the race for a seed and starting order to its end, and returns it recorded. */
export function record(seed: number, grid: Entry[]): Recording {
	const race = createRace(seed, grid);
	const longest = Math.ceil((LIGHTS + TIME_CAP) / DT / EVERY) + 2;
	const view = new DataView(new ArrayBuffer(longest * grid.length * POSE));
	const events: RecordedEvent[] = [];
	let frames = 0;

	const write = () => {
		race.cars.forEach((car, index) => {
			const at = (frames * grid.length + index) * POSE;
			const turn = car.angle / (2 * Math.PI);
			view.setUint16(at, car.x * 256, true);
			view.setUint16(at + 2, car.y * 256, true);
			view.setUint16(at + 4, (turn - Math.floor(turn)) * 65536, true);
			view.setUint16(at + 6, (car.progress + 100) * 20, true);
			view.setInt8(at + 8, Math.max(-127, Math.min(127, car.speed * 2)));
			view.setUint8(at + 9, Math.min(255, car.slip * 10));
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
			}
			events.push(recorded);
		}
		race.events.length = 0;
	}
	write();

	return {
		rate: 1 / (DT * EVERY),
		frames,
		grid: grid.map((entry) => entry.id),
		events,
		poses: new Uint8Array(view.buffer, 0, frames * grid.length * POSE)
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
	return { ...header, poses: bytes.subarray(4 + length) };
}

/**
 * Plays a recording back. `seek` moves the cars to how they were at a race
 * time and returns what happened since the time it was last at, so stepping
 * forward a little each frame yields every event once. Seeking backwards
 * returns nothing. `gap` is the time between two cars as it now stands.
 */
export function createReplay(recording: Recording, roster: Entry[]) {
	const { rate, frames, grid, events, poses } = recording;
	const view = new DataView(poses.buffer, poses.byteOffset, poses.byteLength);
	const cars = grid.map(
		(id): ReplayCar => ({
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
			finishTime: 0
		})
	);
	const duration = (frames - 1) / rate;
	let last = -1;
	let next = 0;

	function seek(time: number): RecordedEvent[] {
		time = Math.max(0, Math.min(duration, time));
		if (time < last) {
			// start over, and say nothing of what is passed on the way back
			for (const car of cars) {
				car.hull.set(HULL);
				car.damage = car.bestLap = car.finishTime = 0;
				car.retired = false;
			}
			next = 0;
		}
		const from = next;
		// event times are rounded to the millisecond, so allow them that much
		for (; next < events.length && events[next].time <= time + 0.001; next++) {
			const event = events[next];
			const car = cars[event.car];
			if (event.kind === 'hit') {
				car.damage = event.damage;
				event.hull?.forEach((moved, k) => (car.hull[k] = HULL[k] + moved * DENT));
			} else if (event.kind === 'lap') {
				if (!car.bestLap || event.lap < car.bestLap) car.bestLap = event.lap;
			} else if (event.kind === 'finish') {
				car.finishTime = event.time;
			} else {
				car.retired = true;
			}
		}
		const passed = time < last ? [] : events.slice(from, next);
		last = time;

		// between the two recorded moments either side of this time
		const frame = Math.min(frames - 2, Math.floor(time * rate));
		const t = time * rate - frame;
		cars.forEach((car, index) => {
			const a = (frame * grid.length + index) * POSE;
			const b = a + grid.length * POSE;
			const between = (at: number) =>
				view.getUint16(a + at, true) * (1 - t) + view.getUint16(b + at, true) * t;
			car.x = between(0) / 256;
			car.y = between(2) / 256;
			// the short way round from one heading to the next
			const heading = view.getUint16(a + 4, true);
			const turned = ((view.getUint16(b + 4, true) - heading + 98304) % 65536) - 32768;
			car.angle = ((heading + turned * t) / 65536) * 2 * Math.PI;
			car.progress = between(6) / 20 - 100;
			car.laps = Math.floor(car.progress / TRACK.length);
			car.speed = (view.getInt8(a + 8) * (1 - t) + view.getInt8(b + 8) * t) / 2;
			car.slip = (view.getUint8(a + 9) * (1 - t) + view.getUint8(b + 9) * t) / 10;
		});
		return passed;
	}

	/**
	 * How many seconds ago car `ahead` was where car `behind` is now: the gap
	 * between them by the clock. Null while the car ahead has not been seen
	 * there, as on the grid, where it started further up the road.
	 */
	function gap(behind: number, ahead: number): number | null {
		const stored = (frame: number) =>
			view.getUint16((frame * grid.length + ahead) * POSE + 6, true);
		const target = (cars[behind].progress + 100) * 20;
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

	seek(0);
	return { duration, cars, seek, gap };
}
