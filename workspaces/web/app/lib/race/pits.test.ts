import { describe, expect, it } from 'vitest';
import { BOX, BOX_ACROSS, createPits, LANE, STAND, pitsFor } from './pits';
import { LOAD } from './recovery';
import { createReplay, pack, record, unpack } from './recording';
import { offRoadAt } from './render';
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
	type Car,
	type Flag,
	type RaceEvent,
	type Rules
} from './sim';
import {
	getTrack,
	HALF_CORRIDOR,
	HALF_ROAD,
	lateral,
	MAX_OFFSET,
	nearest,
	TRACK_IDS,
	type TrackId
} from './track';

/** A stop as the test saw it: who, when it pulled up and when it left, what was done, and what it did to the car. */
type Stopped = {
	car: number;
	/** When it left the track for the pits. */
	left: number;
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
	/** When each car last left the track for the pits. */
	const offAt = race.cars.map(() => 0);
	let nearest2 = Infinity;
	let least = Infinity;
	// the most any car off the track slid, and how often one of its rear tyres was off the road
	let slid = 0;
	let rough = 0;
	for (
		let step = 0;
		step < (LIGHTS + timeCap(rules.laps, track.length) + 1) / DT && !race.done;
		step++
	) {
		const before = race.cars.map((car) => ({ fuel: car.fuel, wear: car.wear, lane: car.lane }));
		race.step();
		race.cars.forEach((car, index) => {
			const was = before[index].lane;
			if (was !== LANE.in && car.lane === LANE.in) offAt[index] = race.time;
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
					left: offAt[event.car],
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
		for (const car of race.cars) {
			if (car.retired || car.lane < LANE.in) continue;
			slid = Math.max(slid, car.slip);
			const [cos, sin] = [Math.cos(car.angle), Math.sin(car.angle)];
			for (const side of [-0.85, 0.85]) {
				// where the renderer has a rear tyre (render.ts)
				const x = car.x - 1.3 * cos - side * sin;
				const y = car.y - 1.3 * sin + side * cos;
				if (offRoadAt(track, x, y)) rough++;
			}
		}
	}
	return Object.assign(race, {
		all: events,
		stops,
		unfinished: open.size,
		fastest,
		entered,
		joined,
		nearest: nearest2,
		least,
		slid,
		rough
	});
}

const SEEDS = [1, 2, 3, 4];

describe.each(TRACK_IDS)('the pit lane on the %s', (id) => {
	const track = getTrack(id);
	const { n } = track;
	const lane = pitsFor(track);

	it('is paved, as the track is, while the verge and the grass are not', () => {
		/** How many points the given distance either side of the centre line are off the road, as a share of them. */
		const rough = (across: number) => {
			let off = 0;
			for (let i = 0; i < n; i++) {
				for (const side of [-1, 1]) {
					const x = track.x[i] - track.ty[i] * across * side;
					const y = track.y[i] + track.tx[i] * across * side;
					if (offRoadAt(track, x, y)) off++;
				}
			}
			return off / (2 * n);
		};
		expect(rough(0)).toBe(0);
		expect(rough(HALF_ROAD - 0.6)).toBe(0);
		// (less where the ways to and from the pits are paved through it)
		expect(rough(HALF_ROAD + 0.4)).toBeGreaterThan(0.9);
		// (and the grass inside, along the pit lane)
		expect(rough(HALF_CORRIDOR + 3)).toBeGreaterThan(0.6);
		for (const box of lane.boxes) expect(offRoadAt(track, box.x, box.y)).toBe(false);
	});

	// The ways in and out come out from under the edge of the track, rather
	// than ending in a round tip that sticks out onto the verge beside it.
	it('leaves the track and joins it again from under its edge, with nothing paved on the verge there', () => {
		const verge = (sample: number) => {
			const i = Math.round(sample) % n;
			const across = -(HALF_ROAD + 0.3);
			return offRoadAt(track, track.x[i] + track.nx[i] * across, track.y[i] + track.ny[i] * across);
		};
		for (let d = 1; d <= 4; d += 0.5) {
			expect(verge(lane.in0 + n - d), `${d} m before the way in`).toBe(true);
			expect(verge(lane.out1 + d), `${d} m past the way out`).toBe(true);
		}
	});

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
			expect(race.time).toBeLessThan(LIGHTS + timeCap(RULES.laps, getTrack(id).length) - 10);
		}
	});

	it('are driven to no faster than the lane allows, and never one car through another', () => {
		for (const race of races) {
			expect(race.fastest).toBeLessThanOrEqual(RULES.limit + 0.01);
			expect(race.nearest).toBeGreaterThan(3.5);
		}
	});

	it('throw up nothing on the way: no sliding, and never a tyre off the paving', () => {
		for (const race of races) {
			expect(race.stops.length).toBeGreaterThan(0);
			expect(race.slid).toBe(0);
			expect(race.rough).toBe(0);
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
		expect(entered[entered.length >> 1]).toBeGreaterThan(0.84);
		expect(joined[joined.length >> 1]).toBeGreaterThan(0.85);
		expect(entered[Math.floor(entered.length * 0.15)]).toBeGreaterThan(0.75);
		expect(joined[Math.floor(joined.length * 0.15)]).toBeGreaterThan(0.75);
	});

	it('are made under caution too, but not once the field is lining up to go green', { timeout: 30_000 }, () => {
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
			// way in goes on to its box, however long the lane holds it up, and
			// nobody follows. (The time cap may end a race with the field still
			// lined up.)
			let restart = 0;
			for (const event of [...race.all, { kind: 'green', time: Infinity }]) {
				if (event.kind === 'restart') restart = event.time;
				if (event.kind !== 'green' && event.kind !== 'caution') continue;
				if (restart) {
					const late = race.stops.filter(
						(stop) => stop.left > restart + 1 && stop.in < event.time && stop.fuel[0] > 1.2
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
	 * they are out for, whether they are ever both out, how near each other
	 * they ever come, how many times they go out, and whether one ever has a
	 * full bed. And the wrecks each truck took off the track on each trip,
	 * and where each lay on the track when it was lifted.
	 */
	function watched(seed: number, count: number) {
		const race = createRace(seed, drawGrid(seed, ROSTER, count), track);
		const seen = {
			race,
			out: 0,
			onTrack: 0,
			elsewhere: 0,
			both: 0,
			nearest: Infinity,
			trips: 0,
			full: 0,
			loads: [] as number[][]
		};
		const retired: number[] = [];
		const doing = race.trucks.map((truck) => truck.doing);
		const trip = race.trucks.map(() => [] as number[]);
		while (!race.done) {
			race.step();
			for (const event of race.events) if (event.kind === 'retire') retired.push(event.car);
			race.events.length = 0;
			const [one, other] = race.trucks;
			seen.nearest = Math.min(seen.nearest, Math.hypot(one.x - other.x, one.y - other.y));
			if (one.busy && other.busy) seen.both++;
			race.trucks.forEach((truck, index) => {
				if (truck.doing === 'out' && doing[index] !== 'out') seen.trips++;
				if (truck.load.every((car) => car >= 0)) seen.full++;
				// a car on the crane on the track is one being lifted off it
				if (
					truck.towing >= 0 &&
					truck.across > -HALF_CORRIDOR &&
					!trip[index].includes(truck.towing)
				) {
					trip[index].push(truck.towing);
				}
				if (truck.doing === 'haul' && doing[index] !== 'haul' && trip[index].length) {
					seen.loads.push(trip[index]);
					trip[index] = [];
				}
				doing[index] = truck.doing;
			});
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
		for (let seed = 2; !wanted(seen) && seed <= 120; seed++) seen = watched(seed, count);
		expect(wanted(seen)).toBe(true);
		return seen;
	}

	/** Both trucks on a stand, and not the same one. */
	function home({ race }: ReturnType<typeof watched>) {
		const on = race.trucks.map((truck) => {
			expect(truck).toMatchObject({ busy: false, towing: -1, load: [-1, -1] });
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
	// the second truck sets off as soon as the first has all it can take on its bed
	const several = find(
		ROSTER.length,
		(seen) => seen.both > 0 && seen.race.cars.some((car) => car.finishTime > 0)
	);
	// one in which a truck takes two wrecks off the track in one trip
	const pair = find(ROSTER.length, (seen) => seen.full > 0);

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

	it('lift a wreck onto the bed with the crane, and take two in one trip where there are two to take', () => {
		expect(pair.full).toBeGreaterThan(0);
		expect(pair.loads.some((load) => load.length === LOAD)).toBe(true);
		// never more than the bed holds, and no wreck lifted twice
		for (const load of pair.loads) expect(load.length).toBeLessThanOrEqual(LOAD);
		expect(new Set(pair.loads.flat()).size).toBe(pair.loads.flat().length);
		// fewer trips than wrecks, and each of them put in its own box
		expect(pair.trips).toBeLessThan(pair.retired.length);
		boxed(pair);
		home(pair);
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
		expect(checkSettings({ ...DEFAULT_SETTINGS, pitMph: 5 })).toMatch(/Pit lane/);
		expect(checkSettings({ ...DEFAULT_SETTINGS, pits: 'yes' })).toMatch(/Pits/);
		const { crew: _, ...old } = DEFAULT_SETTINGS.cars.vixen;
		expect(
			checkSettings({ ...DEFAULT_SETTINGS, cars: { ...DEFAULT_SETTINGS.cars, vixen: old } })
		).toMatch(/crew/);
	});

	it('are filled in for settings saved before there were any', () => {
		const { laps: _l, pits: _p, tank: _t, tyreWear: _w, pitMph: _s, ...old } = DEFAULT_SETTINGS;
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

	it('take a pit lane limit kept in metres a second as miles an hour', () => {
		const { pitMph: _, ...old } = DEFAULT_SETTINGS;
		const filled = complete({ ...old, pitSpeed: 12 } as Partial<typeof DEFAULT_SETTINGS>);
		expect(filled.pitMph).toBe(27);
		expect(rulesOf(filled).limit).toBe(12);
		for (let mps = 6; mps <= 25; mps++) {
			expect(
				rulesOf(complete({ ...old, pitSpeed: mps } as Partial<typeof DEFAULT_SETTINGS>)).limit
			).toBe(mps);
		}
		expect(filled).not.toHaveProperty('pitSpeed');
		expect(checkSettings(filled)).toEqual(filled);
	});
});

/**
 * Two cars through the lane with nothing else about: the first in for box
 * `first`, the second `delay` seconds behind it for box `second`. Each is
 * put down called in where the way in leaves the track, on the inside, at
 * about the speed it would be doing there. The cars are only places in the
 * world, which is all the pits ask of them.
 *
 * What comes back: the slowest the second went down the lane before it had
 * its own box to slow for; how near the two came anywhere off the track, and
 * in the lane while the first was still in it; whether the second ever got
 * ahead of the first there; and how many of them pulled up in their boxes.
 */
function twoIn(id: TrackId, first: number, second: number, delay: number) {
	const track = getTrack(id);
	const lane = pitsFor(track);
	const { n } = track;
	const across = -MAX_OFFSET;
	const stand = (sample: number) => {
		const car = {
			entry: { crew: 0.5 },
			x: track.x[sample] + track.nx[sample] * across,
			y: track.y[sample] + track.ny[sample] * across,
			angle: Math.atan2(track.ty[sample], track.tx[sample]),
			speed: 15,
			sample,
			across,
			retired: true,
			finishTime: 0,
			progress: 0,
			fuel: 1.2,
			wear: 0.3,
			lane: LANE.racing as number,
			pace: new Float32Array(n).fill(30),
			offset: 0,
			steer: 0,
			stuck: 0,
			slip: 0,
			body: {
				setActive() {},
				setAngularVelocity() {},
				setTransform({ x, y }: { x: number; y: number }, angle: number) {
					car.x = x;
					car.y = y;
					car.angle = angle;
					car.sample = nearest(track, x, y, car.sample);
				},
				setLinearVelocity({ x, y }: { x: number; y: number }) {
					car.speed = Math.hypot(x, y);
				}
			}
		};
		return car;
	};
	// the rest of the field is out of the race, and never comes near
	const cars = ROSTER.map(() => stand(lane.entry));
	let seed = 7;
	const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
	const pits = createPits(cars as unknown as Car[], track, RULES, rand, {
		flag: () => 'green',
		laps: () => RULES.laps,
		note: () => {},
		retire: () => {},
		trucks: []
	});
	const call = (car: (typeof cars)[number]) => {
		const { body: _, ...there } = stand(lane.entry);
		Object.assign(car, there, { retired: false, lane: LANE.called });
	};
	const [a, b] = [cars[first], cars[second]];
	/** How far down the lane a car is, in samples past the line where it begins. */
	const down = (car: typeof a) => (((car.sample - lane.in1) % n) + n) % n;
	const off = (car: typeof a) => car.lane === LANE.in || car.lane === LANE.out;
	// the first is still in the lane until it is this far from its box, where it turns in
	const turns = lane.boxes[first].sample - lane.in1 - 10;
	const own = lane.boxes[second].sample - lane.in1 - 14;
	let [slowest, closest, behind] = [Infinity, Infinity, Infinity];
	let order = true;
	const stops = new Set<number>();
	call(a);
	for (let time = 0, called = false; time < 40; time += DT) {
		if (!called && time >= delay) [called] = [true, call(b)];
		pits.step(time, true, DT);
		if (a.lane === LANE.box) stops.add(first);
		if (b.lane === LANE.box) stops.add(second);
		if (off(a) && off(b)) closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
		if (b.lane === LANE.in && down(b) > 3 && down(b) < own) slowest = Math.min(slowest, b.speed);
		if (a.lane === LANE.in && b.lane === LANE.in && down(b) < turns && down(a) < turns) {
			behind = Math.min(behind, Math.hypot(a.x - b.x, a.y - b.y));
			if (down(b) >= down(a)) order = false;
		}
		if (called && time > delay + 1 && !off(a) && !off(b) && a.lane !== LANE.box) break;
	}
	return { slowest, closest, behind, order, stops: stops.size };
}

describe.each(TRACK_IDS)('two cars in the pit lane on the %s', (id) => {
	it('keep to the limit going by a box where the other is turning in, stopped or pulling out', () => {
		// From a car's length or so behind the first as it turns into its box,
		// to well after it has stopped there and is getting away again: the
		// second has its own box further on, and nothing else to slow for.
		// (Any closer behind than that, it has to brake for the first before
		// it is out of the way.)
		for (let delay = 0.9; delay < 12; delay += 0.3) {
			const { slowest, closest, stops } = twoIn(id, 1, 6, delay);
			expect(stops).toBe(2);
			expect(slowest, `${delay.toFixed(1)} s behind`).toBeGreaterThan(RULES.limit * 0.97);
			expect(slowest).toBeLessThanOrEqual(RULES.limit + 0.01);
			expect(closest).toBeGreaterThan(3.5);
		}
		for (const delay of [0.3, 0.6]) expect(twoIn(id, 1, 6, delay).closest).toBeGreaterThan(3.5);
	});

	it('queue behind one that is ahead of them in the lane, and never go through it', () => {
		for (let delay = 0.3; delay < 2; delay += 0.2) {
			const { closest, behind, order, stops } = twoIn(id, 5, 6, delay);
			expect(stops).toBe(2);
			expect(order).toBe(true);
			expect(behind, `${delay.toFixed(1)} s behind`).toBeGreaterThan(5.5);
			expect(closest).toBeGreaterThan(3.5);
		}
	});
});
