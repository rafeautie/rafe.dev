import { describe, expect, it } from 'vitest';
import { BOX, BOX_ACROSS, LANE, STAND, pitsFor } from './pits';
import { createReplay, pack, record, unpack } from './recording';
import { ROSTER, type Entry } from './roster';
import { TRUCK } from './service';
import { HULL } from './sim';
import { checkSettings, complete, DEFAULT_SETTINGS, rulesOf } from './settings';
import {
	CLASSIC,
	createRace,
	DT,
	drawGrid,
	LIGHTS,
	RULES,
	timeCap,
	type Flag,
	type RaceEvent,
	type Rules
} from './sim';
import { getTrack, HALF_CORRIDOR, lateral, nearest, TRACK_IDS, type TrackId } from './track';

/** A stop as the test saw it: who, when it pulled up and when it left, what was done, and what it did to the car. */
type Stopped = {
	car: number;
	in: number;
	out: number;
	service: string;
	flag: Flag;
	fuel: [number, number];
	wear: [number, number];
};

/**
 * Runs a race on a track to its end, watching the pits as it goes: every
 * stop, how fast anything went down the lane, and how near two cars off the
 * track ever came to each other.
 */
function run(
	seed: number,
	id: TrackId,
	rules: Rules = RULES,
	{ flags = [] as number[], field = ROSTER, count = 6 } = {}
) {
	const track = getTrack(id);
	const race = createRace(seed, drawGrid(seed, field, count), track, flags, rules);
	const events: RaceEvent[] = [];
	const stops: Stopped[] = [];
	const open = new Map<number, Stopped>();
	let fastest = 0;
	// how fast each car was going as it left the track for the pits under green, and as it rejoined it, as a share of the speed the track is taken at there
	const entered: number[] = [];
	const joined: number[] = [];
	let nearest2 = Infinity;
	let least = Infinity;
	for (let step = 0; step < (LIGHTS + timeCap(rules.laps) + 1) / DT && !race.done; step++) {
		const before = race.cars.map((car) => ({ fuel: car.fuel, wear: car.wear, lane: car.lane }));
		race.step();
		race.cars.forEach((car, index) => {
			const was = before[index].lane;
			if (race.flag !== 'green') return;
			if (was === LANE.called && car.lane === LANE.in)
				entered.push(car.speed / car.pace[car.sample]);
			if (was === LANE.out && car.lane === LANE.racing)
				joined.push(car.speed / car.pace[car.sample]);
		});
		for (const event of race.events) {
			const car = race.cars[event.car];
			if (event.kind === 'pit') {
				open.set(event.car, {
					car: event.car,
					in: event.time,
					out: 0,
					service: event.service,
					flag: race.flag,
					fuel: [before[event.car].fuel, 0],
					wear: [before[event.car].wear, 0]
				});
			} else if (event.kind === 'away') {
				const stop = open.get(event.car)!;
				open.delete(event.car);
				stops.push({
					...stop,
					out: event.time,
					fuel: [stop.fuel[0], car.fuel],
					wear: [stop.wear[0], car.wear]
				});
			}
		}
		events.push(...race.events);
		race.events.length = 0;
		// on the move off the track, and in the lane itself, past the way in and short of the way out
		const off = race.cars.filter((car) => car.lane === LANE.in || car.lane === LANE.out);
		const lane = pitsFor(track);
		for (const car of off) {
			const far = (car.sample - lane.in1 + 2 * track.n) % track.n;
			if (far < lane.out0 - lane.in1) fastest = Math.max(fastest, car.speed);
			for (const other of off) {
				if (other !== car)
					nearest2 = Math.min(nearest2, Math.hypot(car.x - other.x, car.y - other.y));
			}
		}
		for (const car of race.cars) least = Math.min(least, car.fuel);
	}
	return Object.assign(race, {
		all: events,
		stops,
		unfinished: open.size,
		fastest,
		entered,
		joined,
		nearest: nearest2,
		least
	});
}

const SEEDS = [1, 2, 3, 4];

describe.each(TRACK_IDS)('the pit lane on the %s', (id) => {
	const track = getTrack(id);
	const { n } = track;
	const lane = pitsFor(track);

	it('has a box for every car, each clear of the next', () => {
		expect(lane.boxes).toHaveLength(ROSTER.length);
		lane.boxes.forEach((box, index) => {
			// (found from where it is meant to be: on the circuit a box is as near another stretch of the track as its own)
			const sample = nearest(track, box.x, box.y, Math.round(box.sample) % n);
			expect(Math.abs(lateral(track, box.x, box.y, sample) + BOX_ACROSS)).toBeLessThan(1);
			if (index) {
				const last = lane.boxes[index - 1];
				expect(Math.hypot(box.x - last.x, box.y - last.y)).toBeGreaterThan(BOX.long);
			}
		});
	});

	it('has boxes bigger than the cars, and stands bigger than the tow trucks past the last of them', () => {
		// a car with its wheels, which stand a little proud of the bodywork, and a truck with its own
		const long = Math.max(...HULL.filter((_, k) => k % 2 === 0)) * 2;
		const wide = Math.max(...HULL.filter((_, k) => k % 2 === 1)) * 2 + 0.3;
		expect(BOX.long).toBeGreaterThan(long + 1);
		expect(BOX.wide).toBeGreaterThan(wide + 0.7);
		expect(BOX.pitch).toBeGreaterThan(BOX.long);
		expect(STAND.long).toBeGreaterThan(TRUCK.long * 2 + 1);
		expect(STAND.wide).toBeGreaterThan(TRUCK.wide * 2 + 0.44 + 0.7);
		expect(lane.stands).toHaveLength(2);
		// one behind the other, the front one first, in line with the boxes
		const [front, rear] = lane.stands;
		const last = lane.boxes[lane.boxes.length - 1];
		expect(Math.hypot(front.x - rear.x, front.y - rear.y)).toBeGreaterThan(STAND.long);
		expect(front.sample).toBeGreaterThan(rear.sample);
		// clear of the last box, and short of the end of the lane
		expect(rear.sample - STAND.long / 2).toBeGreaterThan(last.sample + BOX.long / 2);
		expect(front.sample + STAND.long / 2).toBeLessThan(lane.out0);
		for (const stand of lane.stands) expect(stand.across).toBe(last.across);
		// and all of it on the straight the start line is on, or all but: on
		// the oval the front stand runs on a little way into the first turn
		const bend = (sample: number) => track.bend[((Math.round(sample) % n) + n) % n];
		for (const box of lane.boxes) expect(bend(box.sample)).toBeLessThan(1 / 50);
		for (const stand of lane.stands) expect(bend(stand.sample)).toBeLessThan(1 / 45);
	});

	it('leads from the track through every box and back to the track', () => {
		lane.boxes.forEach((box, index) => {
			const { way, stop, end } = lane.path(index);
			const across = (k: number) => lateral(track, way.x[k], way.y[k], way.sample[k]);
			// on the tarmac at both ends, off it in between, and always going forwards
			expect(Math.abs(across(0))).toBeLessThan(HALF_CORRIDOR - 2);
			expect(Math.abs(across(way.count - 1))).toBeLessThan(HALF_CORRIDOR - 2);
			expect(stop).toBeGreaterThan(0);
			expect(end).toBeGreaterThan(stop);
			expect(end).toBeLessThan(way.length);
			let at = 0;
			while (way.along[at] < stop) at++;
			expect(Math.hypot(way.x[at] - box.x, way.y[at] - box.y)).toBeLessThan(0.6);
			for (let k = 1; k < way.count; k++) {
				expect((way.sample[k] - way.sample[k - 1] + n) % n).toBeLessThanOrEqual(1);
				// and nowhere bends tighter than a car can turn
				if (k < 4 || k + 4 >= way.count) continue;
				const [ax, ay, bx, by, cx, cy] = [-4, 0, 4].flatMap((d) => [way.x[k + d], way.y[k + d]]);
				const cross = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
				const sides =
					Math.hypot(bx - ax, by - ay) *
					Math.hypot(cx - bx, cy - by) *
					Math.hypot(cx - ax, cy - ay);
				expect(sides / (2 * cross || 1e-9)).toBeGreaterThan(3);
			}
		});
	});
});

describe.each(TRACK_IDS)('pit stops on the %s', (id) => {
	const races = SEEDS.map((seed) => run(seed, id));

	it('are made by every car that gets to the end, since a tank will not last the race', () => {
		expect(RULES.tank).toBeLessThan(RULES.laps);
		for (const race of races) {
			const stopped = new Set(race.stops.map((stop) => stop.car));
			race.cars.forEach((car, index) => {
				if (car.finishTime) expect(stopped.has(index)).toBe(true);
			});
		}
	});

	it('leave nobody out of fuel', () => {
		for (const race of races) {
			expect(race.all.filter((event) => event.kind === 'dry')).toHaveLength(0);
			expect(race.least).toBeGreaterThanOrEqual(0);
		}
	});

	it('put in fuel, or change the tyres, or both, as the crew says', () => {
		const services = new Set<string>();
		for (const race of races) {
			expect(race.stops.length).toBeGreaterThan(0);
			for (const stop of race.stops) {
				services.add(stop.service);
				if (stop.service !== 'tyres') expect(stop.fuel[1]).toBeGreaterThan(stop.fuel[0] + 0.09);
				else expect(stop.fuel[1]).toBeCloseTo(stop.fuel[0], 5);
				if (stop.service !== 'fuel') expect(stop.wear[1]).toBe(0);
				else expect(stop.wear[1]).toBe(stop.wear[0]);
				expect(stop.fuel[1]).toBeLessThanOrEqual(RULES.tank);
				// a stop takes a few seconds, more if it is fumbled, never an age
				expect(stop.out - stop.in).toBeGreaterThan(1);
				expect(stop.out - stop.in).toBeLessThan(16);
			}
		}
		expect(services).toContain('fuel');
		expect(services).toContain('both');
	});

	it('end with the car back in the race', () => {
		for (const race of races) {
			// (the race may be over, though, before the last of them has been let go, or is back out)
			expect(race.unfinished).toBeLessThanOrEqual(1);
			expect(race.cars.filter((car) => car.lane >= LANE.in).length).toBeLessThanOrEqual(1);
			// and the race is still won, with time to spare
			expect(race.cars.some((car) => car.finishTime)).toBe(true);
			expect(race.time).toBeLessThan(LIGHTS + timeCap(RULES.laps) - 10);
		}
	});

	it('are driven to no faster than the lane allows, and never one car through another', () => {
		for (const race of races) {
			expect(race.fastest).toBeLessThanOrEqual(RULES.limit + 0.01);
			expect(race.nearest).toBeGreaterThan(3.5);
		}
	});

	it('are come in for and gone out from without slowing on the track: the braking is done on the way in', () => {
		const entered = races.flatMap((race) => race.entered).sort((a, b) => a - b);
		const joined = races.flatMap((race) => race.joined).sort((a, b) => a - b);
		expect(entered.length).toBeGreaterThan(10);
		expect(joined.length).toBeGreaterThan(10);
		// Off the track, and back on it, at something like the speed the track
		// is taken at there. (Now and then one is slow for a reason of its
		// own: held up, or damaged, or behind another on its way in.)
		expect(entered[entered.length >> 1]).toBeGreaterThan(0.85);
		expect(joined[joined.length >> 1]).toBeGreaterThan(0.85);
		expect(entered[Math.floor(entered.length * 0.15)]).toBeGreaterThan(0.75);
		expect(joined[Math.floor(joined.length * 0.15)]).toBeGreaterThan(0.75);
	});

	it('are made under caution too, but not once the field is lining up to go green', () => {
		let under = 0;
		for (let seed = 1; seed <= 18; seed++) {
			// a wreck is rare enough that some of them have a caution thrown by
			// hand, at about the time the cars are getting low on fuel
			const race =
				seed <= SEEDS.length
					? races[seed - 1]
					: run(seed, id, RULES, { flags: seed % 2 ? [] : [LIGHTS + 45] });
			under += race.stops.filter((stop) => stop.flag === 'yellow').length;
			// The pits shut as the field lines up: whoever was already on the
			// way in is in its box soon after, and nobody follows. (The time
			// cap may end a race with the field still lined up.)
			let restart = 0;
			for (const event of [...race.all, { kind: 'green', time: Infinity }]) {
				if (event.kind === 'restart') restart = event.time;
				if (event.kind !== 'green' && event.kind !== 'caution') continue;
				if (restart) {
					const late = race.stops.filter(
						(stop) => stop.in > restart + 15 && stop.in < event.time && stop.fuel[0] > 1.2
					);
					expect(late, `seed ${seed}`).toEqual([]);
				}
				restart = 0;
			}
			expect(race.all.filter((event) => event.kind === 'dry')).toHaveLength(0);
		}
		expect(under).toBeGreaterThan(1);
	});
});

describe('the pits', () => {
	it('are not there at all when the rules say so', () => {
		const race = run(3, 'oval', { ...RULES, pits: false });
		expect(race.stops).toHaveLength(0);
		for (const car of race.cars) {
			expect(car.fuel).toBe(RULES.tank);
			expect(car.wear).toBe(0);
			expect(car.lane).toBe(LANE.racing);
		}
	});

	it('are left alone by a field with fuel for the whole race and tyres that do not wear', () => {
		const race = run(1, 'oval', { ...RULES, tank: 8, wear: 0 });
		expect(race.stops).toHaveLength(0);
		expect(race.cars.some((car) => car.finishTime)).toBe(true);
	});

	it('are visited more often on a smaller tank', () => {
		const small = run(1, 'oval', { ...RULES, tank: 1.5 });
		const usual = run(1, 'oval');
		expect(small.stops.length).toBeGreaterThan(usual.stops.length);
		expect(small.all.filter((event) => event.kind === 'dry')).toHaveLength(0);
	});

	it('cannot save a car that has not the fuel to reach them: it stops on the track, out of the race', () => {
		const race = run(1, 'circuit', { ...RULES, tank: 0.3 });
		const dry = race.all.filter((event) => event.kind === 'dry');
		expect(dry.length).toBeGreaterThan(0);
		for (const event of dry) {
			expect(race.cars[event.car].retired).toBe(true);
			expect(race.all.some((other) => other.kind === 'retire' && other.car === event.car)).toBe(
				true
			);
		}
		// which brings out the caution, like any other car stopped on the track
		expect(race.all.some((event) => event.kind === 'caution' && event.by === 'wreck')).toBe(true);
	});

	it('are quicker with a better crew', () => {
		// the same few cars with the worst crews there are, and then with the best, so no stop waits on another
		const taken = [0, 1].map((crew) => {
			const field: Entry[] = ROSTER.map((entry) => ({ ...entry, crew }));
			return SEEDS.flatMap((seed) =>
				run(seed, 'oval', RULES, { field, count: 3 }).stops.map((stop) => stop.out - stop.in)
			);
		});
		const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
		expect(taken[0].length).toBeGreaterThan(3);
		expect(taken[1].length).toBeGreaterThan(3);
		expect(mean(taken[1])).toBeLessThan(mean(taken[0]) - 0.5);
	});

	it('work for a full field as well as a small one', () => {
		for (const count of [3, ROSTER.length]) {
			for (const id of TRACK_IDS) {
				const race = run(5, id, RULES, { count });
				expect(race.stops.length).toBeGreaterThan(0);
				expect(race.unfinished).toBe(0);
				expect(race.nearest).toBeGreaterThan(3.5);
				expect(race.cars.some((car) => car.finishTime)).toBe(true);
			}
		}
	});
});

describe.each(TRACK_IDS)('the tow trucks on the %s', (id) => {
	const track = getTrack(id);
	const { n } = track;
	const lane = pitsFor(track);
	/** Whether a sample is beside the pits: between where the way in leaves the track and where the way out joins it. */
	const beside = (sample: number) => (sample - lane.in0 + 2 * n) % n <= lane.out1 - lane.in0;

	/**
	 * A race, watched for where the trucks go while they are out, which cars
	 * they are out for, whether they are ever both out, and how near each
	 * other they ever come.
	 */
	function watched(seed: number, count: number) {
		const race = createRace(seed, drawGrid(seed, ROSTER, count), track);
		const seen = { race, out: 0, onTrack: 0, elsewhere: 0, both: 0, nearest: Infinity };
		const retired: number[] = [];
		while (!race.done) {
			race.step();
			for (const event of race.events) if (event.kind === 'retire') retired.push(event.car);
			race.events.length = 0;
			const [one, other] = race.trucks;
			seen.nearest = Math.min(seen.nearest, Math.hypot(one.x - other.x, one.y - other.y));
			if (one.busy && other.busy) seen.both++;
			for (const truck of race.trucks) {
				if (!truck.busy) continue;
				seen.out++;
				// where it is by its own count, since the boxes are as near another stretch of the circuit as their own
				if (truck.across > -HALF_CORRIDOR) seen.onTrack++;
				// off the track it is in the pits, and nowhere else
				else if (!beside(truck.sample)) seen.elsewhere++;
			}
		}
		return { ...seen, retired };
	}

	/** The first race of those seeds that is what is wanted. */
	function find(count: number, wanted: (seen: ReturnType<typeof watched>) => boolean) {
		let seen = watched(1, count);
		for (let seed = 2; !wanted(seen) && seed <= 60; seed++) seen = watched(seed, count);
		expect(wanted(seen)).toBe(true);
		return seen;
	}

	/** Both trucks on a stand, and not the same one. */
	function home({ race }: ReturnType<typeof watched>) {
		const on = race.trucks.map((truck) => {
			expect(truck).toMatchObject({ busy: false, towing: -1 });
			return lane.stands.findIndex(
				(stand) => Math.hypot(truck.x - stand.x, truck.y - stand.y) < 0.6
			);
		});
		expect([...on].sort()).toEqual([0, 1]);
	}

	/** Every wreck the trucks went for, in its own box. */
	function boxed({ race, retired }: ReturnType<typeof watched>) {
		for (const index of retired) {
			const wreck = race.cars[index];
			const box = lane.boxes[index];
			expect(wreck.towed).toBe(true);
			expect(Math.hypot(wreck.x - box.x, wreck.y - box.y)).toBeLessThan(1);
			// straight in it, one way round or the other
			expect(Math.abs(Math.sin(wreck.angle - box.angle))).toBeLessThan(0.2);
		}
	}

	// a race that loses one car, out on the track, while it is still being raced
	const single = find(6, (seen) => seen.retired.length === 1 && seen.out > 0);
	// and one that loses several at once, in a full field, and is raced to the end all the same:
	// the second truck sets off as soon as the first has its wreck on the hook
	const several = find(
		ROSTER.length,
		(seen) => seen.both > 0 && seen.race.cars.some((car) => car.finishTime > 0)
	);

	it('stand at the end of the pit lane, and are back there when the job is done', () => {
		expect(single.race.trucks).toHaveLength(2);
		expect(single.out).toBeGreaterThan(0);
		home(single);
	});

	it('go out to a wreck by the way out of the pits and bring it back by the way in', () => {
		expect(single.onTrack).toBeGreaterThan(0);
		expect(single.elsewhere).toBe(0);
		expect(several.elsewhere).toBe(0);
	});

	it('leave the wreck in its own pit box', () => {
		expect(single.retired).toHaveLength(1);
		boxed(single);
	});

	it("both go out when there is more than one wreck, and keep out of each other's way", () => {
		expect(several.retired.length).toBeGreaterThan(1);
		expect(several.both).toBeGreaterThan(0);
		// Never one through the other. The nearest they come is one going
		// down the lane past the other on its stand, with a truck's width
		// and more between their middles.
		expect(several.nearest).toBeGreaterThan(3.3);
		boxed(several);
		home(several);
	});
});

describe('a recording of a race with pits', () => {
	const track = getTrack('oval');
	const grid = drawGrid(1, ROSTER, 6);
	const recording = record(1, grid, track);
	const stop = recording.events.find((event) => event.kind === 'pit')!;
	const away = recording.events.find((event) => event.kind === 'away' && event.car === stop.car)!;

	it('says how long the race is and shows each car fuel, tyres and where it is with the pits', () => {
		const replay = createReplay(unpack(pack(recording)), ROSTER);
		expect(replay.laps).toBe(RULES.laps);
		expect(replay.pits).toBe(true);
		replay.seek(LIGHTS);
		for (const car of replay.cars) {
			expect(car.fuel).toBeGreaterThan(0.95);
			expect(car.wear).toBeLessThan(0.05);
			expect(car.lane).toBe(LANE.racing);
			expect(car.stop).toBeNull();
		}
		// in the box: standing there, the clock running
		const middle = (stop.time + away.time) / 2;
		replay.seek(middle);
		const car = replay.cars[stop.car];
		expect(car.lane).toBe(LANE.box);
		expect(Math.abs(car.speed)).toBeLessThan(0.5);
		expect(car.stop).toMatchObject({ service: stop.kind === 'pit' && stop.service, over: false });
		expect(car.stop!.seconds).toBeCloseTo(middle - stop.time, 1);
		// and gone: the stop is over, and took what the recording says
		replay.seek(away.time + 0.2);
		expect(car.lane).toBe(LANE.out);
		expect(car.stop).toMatchObject({ over: true, seconds: away.kind === 'away' && away.seconds });
		// wound back, it is as it was
		replay.seek(LIGHTS);
		expect(car.stop).toBeNull();
	});

	it('is the same race as the one run', () => {
		const race = createRace(1, grid, track);
		while (!race.done) race.step();
		const replay = createReplay(recording, ROSTER);
		replay.seek(replay.duration);
		replay.cars.forEach((car, index) => {
			expect(car.progress).toBeCloseTo(race.cars[index].progress, 0);
			expect(car.fuel).toBeCloseTo(race.cars[index].fuel / RULES.tank, 1);
			expect(car.wear).toBeCloseTo(race.cars[index].wear, 1);
		});
	});

	it('has none of it when the race had no pits', () => {
		const classic = record(1, grid, track, [], CLASSIC);
		expect(classic.tank).toBeUndefined();
		expect(classic.laps).toBeUndefined();
		const replay = createReplay(classic, ROSTER);
		expect(replay.laps).toBe(CLASSIC.laps);
		expect(replay.pits).toBe(false);
		replay.seek(replay.duration);
		for (const car of replay.cars) expect([car.fuel, car.wear, car.lane]).toEqual([1, 0, 0]);
	});
});

describe('the settings for the pits', () => {
	it('are the rules a race is run to', () => {
		expect(rulesOf(DEFAULT_SETTINGS)).toEqual(RULES);
		expect(checkSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
	});

	it('are checked', () => {
		expect(checkSettings({ ...DEFAULT_SETTINGS, laps: 9 })).toMatch(/Laps/);
		expect(checkSettings({ ...DEFAULT_SETTINGS, pitSpeed: 2 })).toMatch(/Pit lane/);
		expect(checkSettings({ ...DEFAULT_SETTINGS, pits: 'yes' })).toMatch(/Pits/);
		const { crew: _, ...old } = DEFAULT_SETTINGS.cars.vixen;
		expect(
			checkSettings({ ...DEFAULT_SETTINGS, cars: { ...DEFAULT_SETTINGS.cars, vixen: old } })
		).toMatch(/crew/);
	});

	it('are filled in for settings saved before there were any', () => {
		const { laps: _l, pits: _p, tank: _t, tyreWear: _w, pitSpeed: _s, ...old } = DEFAULT_SETTINGS;
		const cars = Object.fromEntries(
			Object.entries(old.cars).map(([car, { crew: _, ...stats }]) => [
				car,
				{ ...stats, speed: 0.1 }
			])
		);
		const filled = complete({ ...old, cars } as unknown as Partial<typeof DEFAULT_SETTINGS>);
		expect(rulesOf(filled)).toEqual(RULES);
		expect(filled.cars.vixen).toEqual({ ...DEFAULT_SETTINGS.cars.vixen, speed: 0.1 });
		expect(checkSettings(filled)).toEqual(filled);
	});
});
