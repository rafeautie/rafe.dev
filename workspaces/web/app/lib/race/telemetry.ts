import { LANE } from './pits';
import type { ReplayCar } from './recording';
import { neutral, rank, type Flag } from './sim';
import { clamp } from './track';

// The numbers for one car, live, as a race engineer would want them: how fast
// it is going and whether it is on the throttle or the brake, where it is
// running and how far the cars either side are, its laps, what it has left in
// the tank and the tyres, and any stop it is making.
//
// The recording has where each car is and how fast it is going, not what its
// driver is doing with the pedals. Those are told from how the speed changed
// over the last moment, read back from the recording:
// gaining speed is the throttle, losing it faster than the car would just
// rolling is the brake. They are an estimate, and good enough to watch.

/** How far back, in seconds, the speed is looked at to tell what the pedals are doing. */
const PEDAL_WINDOW = 0.25;
/** Metres a second, as miles an hour. */
const MPH = 3600 / 1609.344;
/** About what full throttle and full braking do to a car, in m/s². */
const FULL_THROTTLE = 6;
const FULL_BRAKE = 12;
/** A car losing less than this (m/s²) is only rolling, not braking. */
const ROLLING = 1.5;
/** A car holding its speed has this much throttle on, to keep it there. */
const HOLDING = 0.3;
/** How often, in seconds, the gaps are read again, so the figures can be read: here and in the timing tower. */
export const GAPS_EVERY = 0.5;

/** What of the replay the numbers come from. A replay is one. */
export type Source = {
	cars: ReplayCar[];
	flag: Flag;
	laps: number;
	pits: boolean;
	time: number;
	lap: (car: ReplayCar) => number;
	gap: (behind: number, ahead: number) => number | null;
	speedAt: (index: number, time: number) => number;
};

export type Readout = {
	id: string;
	/** Place in the race, of how many. */
	place: number;
	of: number;
	/** Miles an hour. */
	speed: number;
	/** 0 to 1 each, estimated. */
	throttle: number;
	brake: number;
	/** The cars either side in the running order, and how many seconds there are to each. */
	ahead: { id: string; gap: number | null } | null;
	behind: { id: string; gap: number | null } | null;
	lap: number;
	laps: number;
	/** Lap times in seconds: its last, its best, and the best of the field; 0 for none yet. */
	last: number;
	best: number;
	fastest: number;
	/** Shares of a full tank and of new tyres left, or null in a race without pits. */
	fuel: number | null;
	tyres: number | null;
	/** Where it is with the pits: out on the track, on its way in or out of the pit lane, or standing in its box. */
	pit: 'track' | 'lane' | 'box';
	/** The stop it is making or last made. */
	stop: ReplayCar['stop'];
	caution: boolean;
	retired: boolean;
	finished: boolean;
};

/** What the pedals are doing, from how fast the car is going and how that has changed in the last moment (m/s²). */
export function pedals(speed: number, change: number) {
	if (change < -ROLLING) {
		return { throttle: 0, brake: Math.min(1, (-change - ROLLING) / (FULL_BRAKE - ROLLING) + 0.15) };
	}
	if (Math.abs(speed) < 0.5 && change <= 0) return { throttle: 0, brake: 0 };
	return { throttle: clamp(HOLDING + change / FULL_THROTTLE, 0, 1), brake: 0 };
}

/** Where a car is with the pits, from its lane (LANE in pits.ts). */
export function pitOf(lane: number): Readout['pit'] {
	if (lane === LANE.box) return 'box';
	if (lane === LANE.in || lane === LANE.out) return 'lane';
	return 'track';
}

/** Follows one car at a time and reads its numbers each frame, the gaps only every so often. */
export function createTelemetry() {
	let gaps: { ahead: number | null; behind: number | null } = { ahead: null, behind: null };
	let neighbours = '';
	let readAt = -Infinity;

	return {
		/**
		 * The numbers for car `index` of `source` at the time it is showing,
		 * placed by `order` (car ids, first first) where one is given, such as
		 * the order the timing tower is showing, so the two agree.
		 */
		read(source: Source, index: number, order?: string[]): Readout {
			const car = source.cars[index];
			const time = source.time;
			const before = time >= PEDAL_WINDOW ? source.speedAt(index, time - PEDAL_WINDOW) : car.speed;
			const { throttle, brake } = pedals(car.speed, (car.speed - before) / PEDAL_WINDOW);

			const byId = (id: string) => source.cars.find((other) => other.entry.id === id);
			const given = order?.map(byId);
			const placed =
				given?.length === source.cars.length && given.every((other) => other !== undefined)
					? (given as ReplayCar[])
					: rank(source.cars);
			const place = placed.indexOf(car);
			const above = placed[place - 1] ?? null;
			const below = placed[place + 1] ?? null;
			// read again for new neighbours, every so often, and after a seek back
			const around = `${car.entry.id}:${above?.entry.id}/${below?.entry.id}`;
			if (around !== neighbours || time - readAt >= GAPS_EVERY || time < readAt) {
				neighbours = around;
				readAt = time;
				const at = (other: ReplayCar) => source.cars.indexOf(other);
				gaps = {
					ahead: above ? source.gap(index, at(above)) : null,
					behind: below ? source.gap(at(below), index) : null
				};
			}
			const bests = source.cars.map((other) => other.bestLap).filter((lap) => lap > 0);

			return {
				id: car.entry.id,
				place: place + 1,
				of: source.cars.length,
				speed: Math.abs(car.speed) * MPH,
				throttle: car.retired ? 0 : throttle,
				brake: car.retired ? 0 : brake,
				ahead: above && { id: above.entry.id, gap: gaps.ahead },
				behind: below && { id: below.entry.id, gap: gaps.behind },
				lap: source.lap(car),
				laps: source.laps,
				last: car.lastLap,
				best: car.bestLap,
				fastest: bests.length ? Math.min(...bests) : 0,
				fuel: source.pits ? car.fuel : null,
				tyres: source.pits ? 1 - car.wear : null,
				pit: car.retired ? 'track' : pitOf(car.lane),
				stop: car.stop,
				caution: neutral(source.flag),
				retired: car.retired,
				finished: car.finishTime > 0
			};
		}
	};
}
