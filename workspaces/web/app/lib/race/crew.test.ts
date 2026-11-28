import { describe, expect, it } from 'vitest';
import {
	crewAt,
	fuelled,
	fumbled,
	HOMEWARD,
	planStop,
	unlucky,
	type Plan,
	type Scene
} from './crew';
import { LANE, type Stop } from './pits';
import { createReplay, planOf, record } from './recording';
import { ROSTER } from './roster';
import { drawGrid, RULES } from './sim';
import { getTrack, TRACK_IDS } from './track';

/** Moments through a stop, a hundredth of a second apart, from before it to well after. */
function moments(plan: Plan) {
	const out: number[] = [];
	for (let t = 0; t <= plan.seconds + HOMEWARD + 1; t += 0.01) out.push(Math.round(t * 100) / 100);
	return out;
}

/** The crew as they wait between stops, to tell when everyone is back. */
const waiting = crewAt(null, 0);
const home = (scene: Scene) =>
	scene.people.every(
		(one, k) =>
			Math.abs(one.x - waiting.people[k].x) < 1e-9 && Math.abs(one.y - waiting.people[k].y) < 1e-9
	);
const away = (scene: Scene, k: number) =>
	Math.hypot(scene.people[k].x - waiting.people[k].x, scene.people[k].y - waiting.people[k].y) >
	0.01;
const roles = (scene: Scene, role: string) =>
	scene.people.flatMap((one, k) => (one.role === role ? [k] : []));

/** Stops as a crew might make them: each service, quick and slow, clean and fumbled. */
const STOPS: Plan[] = (['fuel', 'tyres', 'both'] as Stop[]).flatMap((service) =>
	[0.8, 1.25].flatMap((pace) =>
		[0, 3.1].map((fumble) => {
			const fuel = service === 'tyres' ? 0 : (1.2 + 1.6 * 1.4) * pace;
			const tyres = service === 'fuel' ? 0 : 4 * pace;
			const seconds = (service === 'both' ? Math.max(fuel, tyres) + pace : fuel || tyres) + fumble;
			return planStop(service, fuel, tyres, fumble, seconds);
		})
	)
);

describe('a pit crew', () => {
	it('makes up a stop of its jobs, the longer of which takes all of it but the fumble', () => {
		for (const plan of STOPS) {
			expect(Math.max(plan.fuel, plan.tyres) + plan.fumble).toBeCloseTo(plan.seconds, 9);
			if (plan.service === 'fuel') expect(plan.tyres).toBe(0);
			if (plan.service === 'tyres') expect(plan.fuel).toBe(0);
			if (plan.service === 'both') expect(Math.min(plan.fuel, plan.tyres)).toBeGreaterThan(0);
			expect(fumbled(plan)).toBe(plan.fumble ? (plan.fuel > plan.tyres ? 'fuel' : 'tyres') : null);
		}
	});

	it.each(
		STOPS.map((plan) => [
			plan.service,
			plan.seconds.toFixed(2),
			plan.fumble ? 'fumbled' : 'clean',
			plan
		])
	)(
		'works a %s stop of %s s (%s) for as long as it takes, and only those whose job it is',
		(_service, _seconds, _how, plan) => {
			const tyreCrew = [...roles(waiting, 'tyres'), ...roles(waiting, 'jack')];
			const fueller = roles(waiting, 'fueller');
			let lastBusy = -1;
			let fumbling = 0;
			const out = new Set<number>();
			for (const t of moments(plan)) {
				const scene = crewAt(plan, t);
				scene.people.forEach((one, k) => {
					if (away(scene, k)) out.add(k);
					if (one.working || one.fumbling) lastBusy = t;
				});
				if (scene.people.some((one) => one.fumbling)) fumbling += 0.01;
				// the car is up on its jacks for a tyre change, and down again by the end
				if (plan.tyres && t > plan.seconds / 2 && t < plan.seconds - 0.4) {
					expect(scene.lifted).toBe(1);
				}
				if (t >= plan.seconds) expect(scene.lifted).toBe(0);
				// the nozzle is on the car as long as fuel is going in
				const share = fuelled(plan, t);
				if (share > 0 && share < 1 && !scene.people.some((one) => one.fumbling)) {
					expect(scene.nozzle).toMatchObject({ x: -0.2, y: -1.07 });
				}
			}
			// whoever works, works right up to the end of the stop and no further
			expect(lastBusy).toBeLessThan(plan.seconds);
			expect(lastBusy).toBeGreaterThan(plan.seconds - 0.5);
			// a fumble is someone in trouble for as long as it costs
			expect(fumbling).toBeCloseTo(plan.fumble, 1);
			// fuel only: the fueller; tyres only: the tyre changers and the jacks; both: everyone
			for (const k of fueller) expect(out.has(k)).toBe(plan.fuel > 0);
			for (const k of tyreCrew) expect(out.has(k)).toBe(plan.tyres > 0);
			// and once it is over they are all back where they wait, the kit put away
			const after = crewAt(plan, plan.seconds + HOMEWARD + 0.01);
			expect(home(after)).toBe(true);
			expect(after.tyres).toHaveLength(4);
			expect(after.lifted).toBe(0);
		}
	);

	it('puts the fuel in while the nozzle is on, and none while it is off after a fumble', () => {
		for (const plan of STOPS.filter((stop) => stop.fuel)) {
			expect(fuelled(plan, 0)).toBe(0);
			const lost = fumbled(plan) === 'fuel' ? plan.fumble : 0;
			expect(fuelled(plan, plan.fuel + lost - 0.4)).toBe(1);
			expect(fuelled(plan, plan.fuel + lost - 0.5)).toBeLessThan(1);
			let previous = 0;
			let still = 0;
			for (const t of moments(plan)) {
				const share = fuelled(plan, t);
				expect(share).toBeGreaterThanOrEqual(previous - 1e-12);
				if (Math.abs(share - previous) < 1e-12 && share > 0 && share < 1) still += 0.01;
				previous = share;
			}
			expect(still).toBeCloseTo(fumbled(plan) === 'fuel' ? plan.fumble : 0, 1);
		}
	});

	it('loses a tyre on a fumbled change, and chases it', () => {
		const plan = STOPS.find((stop) => stop.service === 'tyres' && stop.fumble)!;
		const wheel = unlucky(plan);
		const loose = moments(plan).map((t) => crewAt(plan, t));
		const chasing = loose.filter((scene) => scene.people.some((one) => one.fumbling));
		expect(chasing.length).toBeGreaterThan(0);
		// the one in trouble is the changer at that wheel, and the tyre gets well away from the car
		for (const scene of chasing) {
			expect(scene.people.filter((one) => one.fumbling)).toHaveLength(1);
			expect(roles(scene, 'tyres')[wheel]).toBe(scene.people.findIndex((one) => one.fumbling));
		}
		expect(
			Math.max(...chasing.flatMap((scene) => scene.tyres.map((at) => Math.abs(at.x))))
		).toBeGreaterThan(3);
	});

	it('gets ready as the car comes in, only those who will work on it', () => {
		for (const plan of STOPS) {
			const far = crewAt(plan, -1, 0);
			expect(home(far)).toBe(true);
			const near = crewAt(plan, -1, 1);
			near.people.forEach((one, k) => {
				const needed = one.role === 'fueller' ? plan.fuel > 0 : plan.tyres > 0;
				expect(away(near, k)).toBe(needed);
			});
		}
	});
});

describe.each(TRACK_IDS)('pit stops on the %s, as recorded', (id) => {
	const track = getTrack(id);
	const stops: { plan: Plan; seconds: number; fuel: number[] }[] = [];
	for (let seed = 1; seed <= 4; seed++) {
		const recording = record(seed, drawGrid(seed, ROSTER, 6), track, [], RULES);
		const replay = createReplay(recording, ROSTER);
		for (const pit of recording.events) {
			if (pit.kind !== 'pit') continue;
			const left = recording.events.find(
				(event) => event.kind === 'away' && event.car === pit.car && event.time > pit.time
			);
			if (left?.kind !== 'away') continue;
			const plan = planOf(pit);
			// the fuel in the car through the stop
			const fuel = [0, 0.25, 0.5, 0.75, 1].map((share) => {
				replay.seek(pit.time + share * plan.seconds);
				return replay.cars[pit.car].fuel;
			});
			stops.push({ plan, seconds: left.seconds, fuel });
		}
		replay.seek(0);
	}

	it('has stops of every kind', () => {
		expect(stops.length).toBeGreaterThan(5);
	});

	it('never lets a car go before its crew are done, and lets it go then unless the lane is busy', () => {
		for (const { plan, seconds } of stops) {
			// rounded to the hundredth, as recorded, and to the step the race runs at
			expect(seconds).toBeGreaterThanOrEqual(plan.seconds - 0.05);
		}
		const prompt = stops.filter(({ plan, seconds }) => seconds - plan.seconds < 0.1);
		// (cars that come in together are often held for one another in the lane)
		expect(prompt.length).toBeGreaterThan(stops.length / 3);
	});

	it('fills a car with fuel as the fueller puts it in', () => {
		for (const { plan, fuel } of stops) {
			if (!plan.fuel) {
				expect(fuel[4]).toBeCloseTo(fuel[0], 1);
				continue;
			}
			// (fuel is recorded to a 255th of a tank)
			for (let k = 1; k < fuel.length; k++)
				expect(fuel[k]).toBeGreaterThanOrEqual(fuel[k - 1] - 0.005);
			expect(fuel[4]).toBeGreaterThan(fuel[0]);
		}
	});

	it('tells the replay of the stop a car is coming in to make, before it makes it', () => {
		const recording = record(1, drawGrid(1, ROSTER, 6), track, [], RULES);
		const replay = createReplay(recording, ROSTER);
		const pit = recording.events.find((event) => event.kind === 'pit');
		expect(pit).toBeDefined();
		if (pit?.kind !== 'pit') return;
		// a moment before it stops it is on its way in, and the stop it is coming for is known
		// (up to the last frame before it stops, which may show it stopped already)
		let seen = false;
		for (let t = pit.time - 3; t < pit.time - 0.05; t += 0.1) {
			replay.seek(t);
			const car = replay.cars[pit.car];
			if (car.lane === LANE.in) {
				expect(car.coming).toEqual(planOf(pit));
				seen = true;
			}
		}
		expect(seen).toBe(true);
		replay.seek(pit.time + 0.05);
		expect(replay.cars[pit.car].stop?.plan).toEqual(planOf(pit));
		expect(replay.cars[pit.car].coming).toBeNull();
	});
});
