import { describe, expect, it } from 'vitest';
import { ROSTER } from './roster';
import {
	BAY_IN,
	BAY_OUT,
	LAYBY,
	LAYBY_IN,
	LAYBY_OUT,
	RING,
	SLIP,
	TIGHTEST,
	serviceFor
} from './service';
import { createRace, DT, drawGrid, LAPS, LIGHTS, rank, TIME_CAP, type RaceEvent } from './sim';
import {
	getTrack,
	HALF_CORRIDOR,
	lateral,
	nearest,
	TRACK_IDS,
	triangle,
	type Track,
	type TrackId
} from './track';

/**
 * Runs a race on a track to its end, with a caution thrown by hand at each
 * of `flags`, and returns it with all that happened.
 */
function run(seed: number, track: Track, flags: number[] = []) {
	const race = createRace(seed, drawGrid(seed, ROSTER), track, flags);
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
			for (const entry of ROSTER) expect(wins.get(entry.id) ?? 0).toBeGreaterThan(0);
		}
	);
});

describe.each(TRACK_IDS)('the service road on the %s', (id) => {
	const track = getTrack(id);
	const { n, x, y } = track;
	const { homes, gates, bays, ahead, place } = serviceFor(track);
	/** How far a point is from the middle of the track. */
	const clear = ([px, py]: [number, number]) => {
		let least = Infinity;
		for (let i = 0; i < n; i++) least = Math.min(least, Math.hypot(px - x[i], py - y[i]));
		return least;
	};

	it('stays inside the wall all the way round, lay-bys and bays and all', () => {
		for (let sample = 0; sample < n; sample++) {
			expect(clear(place(sample, -RING))).toBeGreaterThan(RING - 0.5);
		}
		for (const home of homes) {
			for (let sample = home - LAYBY_IN; sample <= home + LAYBY_OUT; sample++) {
				expect(clear(place(sample, -RING - LAYBY))).toBeGreaterThan(RING);
			}
		}
		for (const bay of bays) expect(clear(place(bay, -RING - 6))).toBeGreaterThan(RING);
	});

	it('bends no tighter than a truck can steer', () => {
		for (let sample = 0; sample < n; sample++) {
			const [a, b, c] = [-3, 0, 3].map((d) => place(sample + d, -RING));
			const [cross, sides] = triangle(...a, ...b, ...c);
			expect(sides / Math.abs(2 * cross || 1e-9)).toBeGreaterThan(TIGHTEST - 0.5);
		}
	});

	it('has a gate close after each garage, and no bay in a lay-by', () => {
		for (const home of homes) {
			// near enough to be the first the truck comes to, far enough to be back on the road first
			const first = Math.min(...gates.map((gate) => ahead(home + LAYBY_OUT, gate - SLIP - 2)));
			expect(first).toBeLessThan(10);
			// A truck is off the road for a bay from a little before it to a little
			// after. The last few metres of that, and of a lay-by, are all but on
			// the road, and may be the same few metres.
			for (const bay of bays) {
				expect(ahead(home - LAYBY_IN - BAY_OUT + 6, bay)).toBeGreaterThan(
					LAYBY_IN + LAYBY_OUT + BAY_OUT + BAY_IN - 12
				);
			}
		}
	});
});

/**
 * Seeds that make the races the caution tests need, on each track: one that
 * loses a single car early on, and a clean one, where nobody is in trouble
 * when a caution is thrown by hand twenty seconds in.
 */
const SEEDS: Record<TrackId, { wreck: number; clean: number }> = {
	circuit: { wreck: 7, clean: 2 },
	oval: { wreck: 33, clean: 2 }
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
		expect(green.time - restart.time).toBeGreaterThan(6);
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

	it('leaves every wreck to coast to a stop where it went out, not roll on round the lap', () => {
		for (let seed = 1; seed <= 40; seed++) {
			const race = createRace(seed, drawGrid(seed, ROSTER), track);
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
	});

	it('is cleared by a truck that steers like one, and a wreck drawn in on a cable', () => {
		const race = createRace(wrecking, drawGrid(wrecking, ROSTER), track);
		const turned = (from: number, to: number) =>
			Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));
		let trucks = race.trucks.map((truck) => ({ ...truck }));
		let cars = race.cars.map(({ x, y, angle, towed }) => ({ x, y, angle, towed }));
		let winched = 0;
		while (!race.done) {
			race.step();
			race.events.length = 0;
			race.trucks.forEach((truck, index) => {
				const was = trucks[index];
				const moved = Math.hypot(truck.x - was.x, truck.y - was.y);
				// it turns only as it moves: never on the spot, never tighter than its own length
				expect(turned(was.angle, truck.angle)).toBeLessThan(moved / 3.5 + 1e-4);
				expect(moved).toBeLessThan(25 * DT);
			});
			race.cars.forEach((car, index) => {
				const was = cars[index];
				if (!car.towed) return;
				const moved = Math.hypot(car.x - was.x, car.y - was.y);
				// taking up the cable does not move it, and nothing after that jerks it
				if (!was.towed) expect(moved).toBeLessThan(1 * DT);
				expect(moved).toBeLessThan(13 * DT);
				expect(turned(was.angle, car.angle)).toBeLessThan(2 * DT);
				// with the truck stopped it comes in at the winch's pace, and it does come in
				const hauling = race.trucks.findIndex((truck) => truck.towing === index);
				const stopped = race.trucks[hauling]?.speed === 0 && trucks[hauling].speed === 0;
				if (stopped && trucks[hauling].towing === index && moved > 0) {
					expect(moved).toBeLessThan(1 * DT);
					winched += moved;
				}
			});
			trucks = race.trucks.map((truck) => ({ ...truck }));
			cars = race.cars.map(({ x, y, angle, towed }) => ({ x, y, angle, towed }));
		}
		expect(winched).toBeGreaterThan(0.3);
		expect(winched).toBeLessThan(3);
	});

	it('ends as the leader crosses the line, and the laps ended under it are run again', () => {
		const race = createRace(wrecking, drawGrid(wrecking, ROSTER), track);
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
		const race = createRace(clean, drawGrid(clean, ROSTER), track, [at]);
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
			createRace(clean, drawGrid(clean, ROSTER), track),
			createRace(clean, drawGrid(clean, ROSTER), track, [at])
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

	it('goes green after every caution, by way of the restart', { timeout: 120_000 }, () => {
		for (let seed = 1; seed <= 40; seed++) {
			const race = run(seed, track, seed % 2 ? [LIGHTS + 20] : []);
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
			if (flown.length) expect(flown.at(-1), `seed ${seed}`).toBe('green');
		}
	});

	it('lines the field up two by two behind the leader before the green', () => {
		const race = createRace(clean, drawGrid(clean, ROSTER), track, [LIGHTS + 20]);
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
	});

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
