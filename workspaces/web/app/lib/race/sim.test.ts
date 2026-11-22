import { describe, expect, it } from 'vitest';
import { ROSTER } from './roster';
import { LIMITS } from './settings';
import { LANE, pitsFor } from './pits';
import { KERBSIDE, RING, TIGHTEST, TRUCK, TRUCK_HALF, serviceFor } from './service';
import {
	CLASSIC,
	createRace,
	DT,
	drawGrid,
	flown,
	LIGHTS,
	neutral,
	rank,
	timeCap,
	type Flag,
	type RaceEvent
} from './sim';
import {
	getTrack,
	HALF_CAR,
	HALF_CORRIDOR,
	HALF_ROAD,
	lateral,
	nearest,
	TRACK_IDS,
	triangle,
	type Track,
	type TrackId
} from './track';

// These races are run as they were before there were pits (CLASSIC): three
// laps, with no fuel or tyres to think of. The pits have their own tests
// (pits.test.ts).
const LAPS = CLASSIC.laps;
const TIME_CAP = timeCap(LAPS);

/**
 * The six cars that raced every time before the field could change size. The
 * seeds below were picked for races between them, so they race here.
 */
const SIX = ROSTER.slice(0, 6);

/**
 * Runs a race between the cars of `field` on a track to its end, with a
 * caution thrown by hand at each of `flags`, and returns it with all that
 * happened.
 */
function run(seed: number, track: Track, flags: number[] = [], field = SIX) {
	const race = createRace(seed, drawGrid(seed, field), track, flags, CLASSIC);
	const events: RaceEvent[] = [];
	// as many steps as the longest race is allowed to last
	for (let step = 0; step < (LIGHTS + TIME_CAP + 1) / DT && !race.done; step++) {
		race.step();
		events.push(...race.events);
		race.events.length = 0;
	}
	return Object.assign(race, { all: events });
}

/** The cars still running, first to last, by id. */
const running = (race: ReturnType<typeof createRace>) =>
	rank(race.cars.filter((car) => !car.retired)).map((car) => car.entry.id);

describe.each(TRACK_IDS)('the %s', (id) => {
	const track = getTrack(id);
	const { n, x, y } = track;

	it('keeps its stretches far enough apart that each has its own walls', () => {
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				// neighbours along the lap are close by nature
				if (Math.min(j - i, n - j + i) * track.step < 4 * HALF_CORRIDOR) continue;
				expect(Math.hypot(x[i] - x[j], y[i] - y[j])).toBeGreaterThan(2 * HALF_CORRIDOR);
			}
		}
	});

	it('bends gently enough that the inside wall does not fold over itself', () => {
		for (let i = 0; i < n; i++) {
			const a = (i + n - 3) % n;
			const b = (i + 3) % n;
			const cross = (x[i] - x[a]) * (y[b] - y[a]) - (y[i] - y[a]) * (x[b] - x[a]);
			const sides =
				Math.hypot(x[i] - x[a], y[i] - y[a]) *
				Math.hypot(x[b] - x[i], y[b] - y[i]) *
				Math.hypot(x[b] - x[a], y[b] - y[a]);
			expect(sides / Math.abs(2 * cross)).toBeGreaterThan(HALF_CORRIDOR);
		}
	});
});

describe.each(TRACK_IDS)('a race on the %s', (id) => {
	const track = getTrack(id);

	it('runs the same way from the same seed', () => {
		const [first, second] = [run(7, track), run(7, track)];
		expect(second.time).toBe(first.time);
		expect(second.order().map((car) => [car.entry.id, car.finishTime, car.progress])).toEqual(
			first.order().map((car) => [car.entry.id, car.finishTime, car.progress])
		);
	});

	it(
		'reaches a result every time over 100 seeds, and every car wins some',
		{ timeout: 120_000 },
		() => {
			const wins = new Map<string, number>();
			for (let seed = 1; seed <= 100; seed++) {
				const race = run(seed, track);
				expect(race.done).toBe(true);
				// ended by the cars finishing, not by the clock running out, cautions and all
				expect(race.time).toBeLessThan(LIGHTS + TIME_CAP - 10);
				const [winner] = race.order();
				expect(winner.finishTime).toBeGreaterThan(0);
				// every lap of it, and one more for each that was ended under caution
				expect(winner.laps).toBe(race.laps);
				expect(race.flag).toBe('checkered');
				expect(race.laps - LAPS).toBe(race.all.filter((event) => event.kind === 'again').length);
				for (const car of race.cars) {
					// nothing blew up, and nothing got through a wall but on a truck's hook
					expect(Number.isFinite(car.x + car.y + car.angle)).toBe(true);
					const across = lateral(track, car.x, car.y, nearest(track, car.x, car.y));
					if (!car.towed) expect(Math.abs(across)).toBeLessThan(HALF_CORRIDOR + 0.5);
				}
				wins.set(winner.entry.id, (wins.get(winner.entry.id) ?? 0) + 1);
			}
			for (const entry of SIX) expect(wins.get(entry.id) ?? 0).toBeGreaterThan(0);
		}
	);

	it('lines the largest field up two by two, each on the road and clear of the rest', () => {
		const { cars } = createRace(1, drawGrid(1, ROSTER), track, [], CLASSIC);
		for (const [index, car] of cars.entries()) {
			const across = lateral(track, car.x, car.y, nearest(track, car.x, car.y));
			expect(Math.abs(across)).toBeLessThan(HALF_ROAD);
			for (const other of cars.slice(index + 1)) {
				expect(Math.hypot(car.x - other.x, car.y - other.y)).toBeGreaterThan(3);
			}
		}
	});

	// Every car on the roster, the most /admin/race allows. More cars crash
	// more, and each caution ends with a lap or so going green, so a race of
	// them may run long and now and then out of time (a few in a hundred, on
	// the circuit, and some runs of seeds more than that, so it takes sixty to
	// tell), but never so badly that the whole field is wrecked.
	it('reaches a result with the largest field, cautions and all', { timeout: 240_000 }, () => {
		let won = 0;
		for (let seed = 1; seed <= 60; seed++) {
			const race = run(seed, track, [LIGHTS + 25], ROSTER);
			expect(race.cars).toHaveLength(LIMITS.count[1]);
			expect(race.done).toBe(true);
			// won, or called off at the time cap with somebody still running
			expect(
				race.cars.some((car) => !car.retired),
				`seed ${seed}`
			).toBe(true);
			if (race.flag === 'checkered') won++;
			else expect(race.time).toBeGreaterThan(LIGHTS + TIME_CAP);
			for (const car of race.cars) {
				expect(Number.isFinite(car.x + car.y + car.angle)).toBe(true);
				const across = lateral(track, car.x, car.y, nearest(track, car.x, car.y));
				if (!car.towed) expect(Math.abs(across)).toBeLessThan(HALF_CORRIDOR + 0.5);
			}
		}
		expect(won).toBeGreaterThanOrEqual(54);
	});

	it('reaches a result with the smallest field, cautions and all', { timeout: 60_000 }, () => {
		const [fewest] = LIMITS.count;
		for (let seed = 1; seed <= 20; seed++) {
			const race = run(seed, track, [LIGHTS + 25], ROSTER.slice(0, fewest));
			expect(race.cars).toHaveLength(fewest);
			expect(race.done).toBe(true);
			expect(race.flag).toBe('checkered');
			expect(race.order()[0].finishTime).toBeGreaterThan(0);
		}
	});
});

// The racing line through the circuit's hairpin runs along its outside edge,
// so a car that went out there is lying where the field comes past. Under the
// caution the leader came up on it from outside, held on that side with no
// road left to get by, and nosed it along at a crawl, which kept it moving
// and so waited behind rather than gone round, while the cars behind piled
// into the stopped queue one by one until the whole field was out.
it('goes round a wreck on the outside of the circuit hairpin under caution', () => {
	const race = run(15, getTrack('circuit'), [LIGHTS + 25], ROSTER);
	let flag: Flag = 'green';
	const retired: number[] = [];
	for (const event of race.all) {
		if (event.kind === 'retire' && neutral(flag)) retired.push(event.car);
		flag = flown(flag, event.kind);
	}
	expect(retired).toEqual([]);
	expect(race.flag).toBe('checkered');
	expect(race.cars.filter((car) => car.retired).length).toBeLessThanOrEqual(1);
});

/**
 * How far the furthest of a body's corners, `corners` (x forward, y to the
 * left, from its middle), is from the centre line of the track.
 */
function reach(
	track: Track,
	body: { x: number; y: number; angle: number; sample: number },
	corners: [number, number][]
) {
	const [cos, sin] = [Math.cos(body.angle), Math.sin(body.angle)];
	let most = 0;
	for (const [fore, side] of corners) {
		const x = body.x + fore * cos - side * sin;
		const y = body.y + fore * sin + side * cos;
		most = Math.max(most, Math.abs(lateral(track, x, y, nearest(track, x, y, body.sample))));
	}
	return most;
}

/** The outside corners of a car's tyres, and a truck's: one axle under its cab, and the last of the two under the back of its bed. */
const TYRES = [1.8, -1.8].flatMap((fore) =>
	[HALF_CAR, -HALF_CAR].map((side): [number, number] => [fore, side])
);
const TRUCK_TYRES = [TRUCK.long - 0.5, -TRUCK.long + 1.5].flatMap((fore) =>
	[TRUCK_HALF, -TRUCK_HALF].map((side): [number, number] => [fore, side])
);

describe.each(TRACK_IDS)('the wheels on the %s', (id) => {
	const track = getTrack(id);

	// Each car, on its own and making no mistakes, follows the racing line
	// round the corners, and every one of its tyres stays on the tarmac.
	it('stay on the tarmac all the way round, for every car on its own', () => {
		for (const entry of ROSTER) {
			const race = createRace(1, [entry], track, [], CLASSIC);
			const [car] = race.cars;
			car.errorAt = Infinity;
			let most = 0;
			while (!race.done) {
				race.step();
				if (race.time > LIGHTS) most = Math.max(most, reach(track, car, TYRES));
			}
			expect(car.finishTime, entry.id).toBeGreaterThan(0);
			expect(most, entry.id).toBeLessThan(HALF_ROAD - 0.15);
		}
	});

	// In a race, they go off now and then: a mistake, a slide, a knock from
	// another car, or a squeeze when two go into a corner side by side.
	it('go off only now and then in a race, for a car in the pack', { timeout: 120_000 }, () => {
		let racing = 0;
		let off = 0;
		for (let seed = 1; seed <= 12; seed++) {
			const race = createRace(seed, drawGrid(seed, ROSTER), track);
			while (!race.done) {
				race.step();
				if (race.flag !== 'green' || race.time < LIGHTS + 1) continue;
				for (const car of race.cars) {
					// a car in the pits is off the track on purpose
					if (car.retired || car.finishTime || car.lane >= LANE.in) continue;
					racing++;
					if (reach(track, car, TYRES) > HALF_ROAD) off++;
				}
			}
		}
		expect(off / racing).toBeLessThan(0.07);
	});

	// A tow truck going down the track runs on the infield side of it, all of
	// it on the tarmac, and only goes onto the verge to pull up beside a wreck
	// lying there, which it starts across for a good way short of it, or to
	// go off and on at the pits.
	it('of a tow truck driving down the track stay on the tarmac', { timeout: 120_000 }, () => {
		expect(KERBSIDE + TRUCK_HALF).toBeLessThan(HALF_ROAD);
		let driving = 0;
		for (let seed = 1; seed <= 12; seed++) {
			const race = createRace(seed, drawGrid(seed, ROSTER), track, [], CLASSIC);
			while (!race.done) {
				race.step();
				for (const truck of race.trucks) {
					if (!truck.busy || truck.towed) continue;
					const { x, y, sample } = truck;
					// on the track, and not still on the way on to it
					if (Math.abs(lateral(track, x, y, nearest(track, x, y, sample))) > KERBSIDE + 0.05)
						continue;
					const wreck = race.cars.some(
						(car) => car.retired && !car.towed && Math.hypot(car.x - x, car.y - y) < 32
					);
					if (wreck) continue;
					driving++;
					expect(reach(track, truck, TRUCK_TYRES)).toBeLessThan(HALF_ROAD);
				}
			}
		}
		// (enough of it to go by: most of the way a truck drives it has a wreck on board)
		expect(driving).toBeGreaterThan(300);
	});
});

describe.each(TRACK_IDS)('the line the pit lane is on, on the %s', (id) => {
	const track = getTrack(id);
	const { n, x, y } = track;
	const { place } = serviceFor(track);
	/** How far a point is from the middle of the track. */
	const clear = ([px, py]: [number, number]) => {
		let least = Infinity;
		for (let i = 0; i < n; i++) least = Math.min(least, Math.hypot(px - x[i], py - y[i]));
		return least;
	};

	it('stays inside the wall all the way round', () => {
		for (let sample = 0; sample < n; sample++) {
			expect(clear(place(sample, -RING))).toBeGreaterThan(RING - 0.5);
		}
	});

	it('bends no tighter than a truck can steer', () => {
		for (let sample = 0; sample < n; sample++) {
			const [a, b, c] = [-3, 0, 3].map((d) => place(sample + d, -RING));
			const [cross, sides] = triangle(...a, ...b, ...c);
			expect(sides / Math.abs(2 * cross || 1e-9)).toBeGreaterThan(TIGHTEST - 0.5);
		}
	});
});

/**
 * Seeds that make the races the caution tests need, on each track: one that
 * loses a single car early on, and a clean one, where nobody is in trouble
 * when a caution is thrown by hand twenty seconds in.
 */
const SEEDS: Record<TrackId, { wreck: number; clean: number }> = {
	circuit: { wreck: 28, clean: 8 },
	oval: { wreck: 3, clean: 5 }
};

describe.each(TRACK_IDS)('a caution on the %s', (id) => {
	const track = getTrack(id);
	const { wreck: wrecking, clean } = SEEDS[id];

	it('comes out for a wreck, which a truck takes off the track before the green', () => {
		const race = run(wrecking, track);
		const flags = race.all.filter((event) =>
			['retire', 'caution', 'restart', 'green'].includes(event.kind)
		);
		expect(flags.map((event) => event.kind)).toEqual(['retire', 'caution', 'restart', 'green']);
		const [retired, caution, restart, green] = flags;
		expect(caution).toMatchObject({ time: retired.time, car: retired.car, by: 'wreck' });
		expect(restart.time - caution.time).toBeGreaterThan(8);
		expect(green.time - restart.time).toBeGreaterThan(3);
		expect(green.time - caution.time).toBeLessThan(90);
		// the wreck is in the infield, and scored where it stopped, not where it was left
		const wreck = race.cars[retired.car];
		expect(wreck.towed).toBe(true);
		expect(lateral(track, wreck.x, wreck.y, nearest(track, wreck.x, wreck.y))).toBeLessThan(-RING);
		expect(wreck.progress).toBeLessThan(track.length * LAPS);
		expect(race.order().at(-1)).toBe(wreck);
		// and the trucks are home again
		for (const truck of race.trucks) expect(truck).toMatchObject({ busy: false, towing: -1 });
	});

	it(
		'leaves every wreck to coast to a stop where it went out, not roll on round the lap',
		{ timeout: 30_000 },
		() => {
			for (let seed = 1; seed <= 40; seed++) {
				const race = createRace(seed, drawGrid(seed, SIX), track, [], CLASSIC);
				// when each wreck went out, until it has stopped or been hooked
				const rolling = new Map<number, number>();
				while (!race.done) {
					race.step();
					for (const event of race.events) {
						if (event.kind === 'retire') rolling.set(event.car, event.time);
					}
					race.events.length = 0;
					for (const [index, out] of rolling) {
						const wreck = race.cars[index];
						const { x, y } = wreck.body.getLinearVelocity();
						if (wreck.towed || Math.hypot(x, y) < 0.1) rolling.delete(index);
						else expect(race.time - out, `seed ${seed}`).toBeLessThan(8);
					}
				}
			}
		}
	);

	it('is cleared by a truck that steers like one, with a crane that lifts the wreck onto its bed', () => {
		const race = createRace(wrecking, drawGrid(wrecking, SIX), track, [], CLASSIC);
		const { stands } = pitsFor(track);
		const turned = (from: number, to: number) =>
			Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
		const snap = () =>
			race.trucks.map((truck) => ({ ...truck, crane: { ...truck.crane }, load: [...truck.load] }));
		let trucks = snap();
		let cars = race.cars.map(({ x, y, angle, towed }) => ({ x, y, angle, towed }));
		let lifted = 0;
		let carried = 0;
		while (!race.done) {
			race.step();
			race.events.length = 0;
			race.trucks.forEach((truck, index) => {
				const was = trucks[index];
				const moved = Math.hypot(truck.x - was.x, truck.y - was.y);
				// It turns only as it moves: never on the spot, never tighter than
				// it can steer. Squaring up on its stand as it parks is a last turn
				// of the wheel at a crawl, and never much of one: it turns in off
				// the lane early enough to be all but straight on the stand.
				if (truck.doing !== 'park' && was.doing !== 'park') {
					expect(turned(was.angle, truck.angle)).toBeLessThan(moved / 6 + 1e-4);
				} else if (truck.doing === 'park') {
					const square = Math.min(...stands.map((stand) => turned(stand.angle, truck.angle)));
					expect(square).toBeLessThan(0.2);
				}
				expect(moved).toBeLessThan(29 * DT);
				// and its crane swings, reaches and lifts no faster than a crane does
				expect(turned(was.crane.swing, truck.crane.swing)).toBeLessThan(1.5 * DT);
				expect(Math.abs(truck.crane.reach - was.crane.reach)).toBeLessThan(3.1 * DT);
				expect(Math.abs(truck.crane.raise - was.crane.raise)).toBeLessThan(0.81 * DT);
			});
			race.cars.forEach((car, index) => {
				const was = cars[index];
				if (!car.towed) return;
				const moved = Math.hypot(car.x - was.x, car.y - was.y);
				// putting the slings on does not move it, and nothing after that jerks it
				if (!was.towed) expect(moved).toBeLessThan(1 * DT);
				expect(moved).toBeLessThan(19 * DT);
				expect(turned(was.angle, car.angle)).toBeLessThan(2 * DT);
				const truck = race.trucks.find(
					(truck) => truck.towing === index || truck.load.includes(index)
				);
				if (!truck) return;
				const [cos, sin] = [Math.cos(truck.angle), Math.sin(truck.angle)];
				if (truck.towing === index) {
					// on the crane, it hangs under the hook
					const swing = truck.angle + truck.crane.swing;
					const hx = truck.x + cos * TRUCK.pivot + Math.cos(swing) * truck.crane.reach;
					const hy = truck.y + sin * TRUCK.pivot + Math.sin(swing) * truck.crane.reach;
					expect(Math.hypot(car.x - hx, car.y - hy)).toBeLessThan(0.01);
					lifted++;
				} else {
					// on the bed, it stays where it was put on it, lying along it
					const fore = TRUCK.bed[truck.load.indexOf(index)];
					expect(
						Math.hypot(car.x - truck.x - cos * fore, car.y - truck.y - sin * fore)
					).toBeLessThan(0.01);
					expect(Math.abs(Math.sin(car.angle - truck.angle))).toBeLessThan(0.01);
					carried++;
				}
			});
			trucks = snap();
			cars = race.cars.map(({ x, y, angle, towed }) => ({ x, y, angle, towed }));
		}
		expect(lifted).toBeGreaterThan(0);
		expect(carried).toBeGreaterThan(0);
	});

	it('ends as the leader crosses the line, and the laps ended under it are run again', () => {
		const race = createRace(wrecking, drawGrid(wrecking, SIX), track, [], CLASSIC);
		let again = 0;
		let greens = 0;
		while (!race.done) {
			const before = rank(race.cars.filter((car) => !car.retired))[0].laps;
			race.step();
			for (const event of race.events) {
				if (event.kind === 'again') {
					// only the leader's laps, and only under caution
					expect(race.cars[event.car]).toBe(rank(race.cars.filter((car) => !car.retired))[0]);
					again++;
				}
				if (event.kind === 'green') {
					// given in the step the leader came round to the line
					const leader = rank(race.cars.filter((car) => !car.retired))[0];
					expect(leader.laps).toBe(before + 1);
					expect(leader.progress % track.length).toBeLessThan(1);
					greens++;
				}
				// and nobody takes the flag under caution
				if (event.kind === 'finish') expect(race.flag).toBe('checkered');
			}
			race.events.length = 0;
		}
		expect(greens).toBe(1);
		expect(again).toBeGreaterThan(0);
		expect(race.laps).toBe(LAPS + again);
		expect(race.order()[0].laps).toBe(race.laps);
	});

	it('thrown by hand, slows the field and closes it up in the order it was in', () => {
		const at = LIGHTS + 20;
		const race = createRace(clean, drawGrid(clean, SIX), track, [at], CLASSIC);
		let order: string[] = [];
		let out = 0;
		let back = 0;
		while (!back) {
			race.step();
			for (const event of race.events) {
				if (event.kind === 'caution') {
					expect(event).toMatchObject({ by: 'control', car: -1 });
					out = event.time;
					order = running(race);
				}
				if (event.kind === 'green') back = event.time;
			}
			race.events.length = 0;
			// once they have had time to slow, nobody is quicker than the catching-up speed
			// until the field starts lining up to go green
			if (out && race.flag === 'yellow' && race.time > out + 5) {
				for (const car of race.cars) expect(car.speed).toBeLessThan(18);
			}
		}
		expect(Math.abs(out - at)).toBeLessThan(DT);
		expect(race.flag).toBe('green');
		expect(running(race)).toEqual(order);
		// nose to tail: the whole field in the length of a few cars each
		const field = rank(race.cars);
		expect(field[0].progress - field.at(-1)!.progress).toBeLessThan(12 * (field.length - 1));
	});

	it('leaves the race as it was up to the moment it is thrown', () => {
		const at = LIGHTS + 20;
		const [plain, flagged] = [
			createRace(clean, drawGrid(clean, SIX), track, [], CLASSIC),
			createRace(clean, drawGrid(clean, SIX), track, [at], CLASSIC)
		];
		while (plain.time < at - 2 * DT) {
			plain.step();
			flagged.step();
		}
		expect(flagged.cars.map((car) => [car.x, car.y, car.angle, car.progress])).toEqual(
			plain.cars.map((car) => [car.x, car.y, car.angle, car.progress])
		);
		// and is not thrown at all before the start, or once the race has been won
		expect(run(clean, track, [1]).all.some((event) => event.kind === 'caution')).toBe(false);
		const won = run(clean, track).order()[0].finishTime;
		expect(run(clean, track, [won + 1]).all.some((event) => event.kind === 'caution')).toBe(false);
	});

	/** The fields a restart is checked with: the fewest cars /admin/race allows, the six, and the most. */
	const FIELDS = [LIMITS.count[0], 6, LIMITS.count[1]].map((count) => ROSTER.slice(0, count));

	it.each(FIELDS.map((field) => [field.length, field] as const))(
		'goes green after every caution, by way of the restart, with %i cars',
		{ timeout: 120_000 },
		(_, field) => {
			for (let seed = 1; seed <= 30; seed++) {
				const race = run(seed, track, seed % 2 ? [LIGHTS + 20] : [], field);
				// what flew, in order, from the first caution on
				const flown = race.all
					.filter((event) => ['caution', 'restart', 'green'].includes(event.kind))
					.map((event) => event.kind);
				// a yellow can come back while the field is going green, but every
				// green comes straight after a restart, and no caution ends without one
				flown.forEach((kind, k) => {
					if (kind === 'green') expect(flown[k - 1], `seed ${seed}`).toBe('restart');
					if (kind === 'restart') expect(flown[k - 1], `seed ${seed}`).toBe('caution');
				});
				// unless the race was called off at the time cap with a caution out
				if (flown.length && race.time <= LIGHTS + TIME_CAP) {
					expect(flown.at(-1), `seed ${seed}`).toBe('green');
				}
			}
		}
	);

	it.each(FIELDS.map((field) => [field.length, field] as const))(
		'lines %i cars up two by two behind the leader before the green',
		(_, cars) => {
			const race = createRace(clean, drawGrid(clean, cars), track, [LIGHTS + 20], CLASSIC);
			while (!race.done && race.flag !== 'restart') {
				race.step();
				race.events.length = 0;
			}
			// the order it is in as it starts going green is the order it restarts in
			const order = running(race);
			let field: typeof race.cars = [];
			while (!race.done && race.flag === 'restart') {
				field = rank(race.cars.filter((car) => !car.retired));
				race.step();
				race.events.length = 0;
			}
			expect(race.flag).toBe('green');
			expect(field.map((car) => car.entry.id)).toEqual(order);
			const [leader] = field;
			field.forEach((car, place) => {
				// one line down each side of the road, alternately
				expect(Math.sign(car.across), car.entry.id).toBe(place % 2 ? -1 : 1);
				expect(Math.abs(car.across)).toBeGreaterThan(1);
				// and each row a car's length or two behind the one in front
				const behind = leader.progress - car.progress;
				expect(behind).toBeGreaterThan(Math.floor(place / 2) * 8 + (place % 2) * 2 - 3);
				expect(behind).toBeLessThan(Math.floor(place / 2) * 8 + (place % 2) * 2 + 3);
			});
		}
	);

	it('is held under yellow again if there is trouble while the field is going green', () => {
		const going = run(clean, track, [LIGHTS + 20]).all.find((event) => event.kind === 'restart')!;
		const race = run(clean, track, [LIGHTS + 20, going.time + 1]);
		const flown = race.all
			.filter((event) => ['caution', 'restart', 'green'].includes(event.kind))
			.map((event) => event.kind);
		// (and whatever comes after, which is another race from there on)
		expect(flown.slice(0, 5)).toEqual(['caution', 'restart', 'caution', 'restart', 'green']);
		expect(race.flag).toBe('checkered');
	});
});
