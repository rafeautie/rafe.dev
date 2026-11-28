import { World } from 'planck';
import { describe, expect, it } from 'vitest';
import { LANE } from './pits';
import { drawConditions, inCondition, ROSTER } from './roster';
import { TRUCK } from './service';
import { createRace, DT, drawGrid, random, RULES } from './sim';
import { HALF_CAR, HALF_ROAD, lateral, nearest, NOSE, getTrack, type TrackId } from './track';

/**
 * The tow trucks among the cars, checked over whole races: each race has
 * two cars sent at the wall as well as whatever wrecks it makes itself, so
 * the trucks have plenty to do. What is checked, goal by goal:
 * 1. no car on its wheels is ever more than a little way inside a truck;
 * 2. no car gets by a truck that is stopped at work with no room by it;
 * 3. trucks and running cars hardly ever touch;
 * 4. a car with room by a stopped truck does not sit behind it;
 * 5. a truck at the end of the pit lane is let out soon, and nobody closes
 *    on it fast as it pulls on.
 */
type Tally = {
	wrecks: number;
	deep: number;
	pastBlocked: number;
	touches: number;
	stuck: number;
	onTrack: number;
	held: number[];
	close: number;
};

let listen: ((car: number, truck: unknown) => void) | null = null;
const hooked = new WeakSet<object>();
const step = World.prototype.step;
World.prototype.step = function (this: World, ...args: Parameters<World['step']>) {
	if (listen && !hooked.has(this)) {
		hooked.add(this);
		const heard = listen;
		this.on('begin-contact', (contact) => {
			const a = contact.getFixtureA().getBody();
			const b = contact.getFixtureB().getBody();
			if (a.getUserData() === 'truck' && typeof b.getUserData() === 'number')
				heard(b.getUserData() as number, a);
			if (b.getUserData() === 'truck' && typeof a.getUserData() === 'number')
				heard(a.getUserData() as number, b);
		});
	}
	return step.apply(this, args);
};

function races(id: TrackId, count: number, seeds: number[]): Tally {
	const track = getTrack(id);
	const { n, step: spacing } = track;
	const along = (from: number, to: number) => (((to - from + n * 1.5) % n) - n / 2) * spacing;
	const tally: Tally = {
		wrecks: 0,
		deep: 0,
		pastBlocked: 0,
		touches: 0,
		stuck: 0,
		onTrack: 0,
		held: [],
		close: 0
	};
	for (const s of seeds) {
		const conditions = drawConditions(random(s + 1), count);
		const grid = drawGrid(s, ROSTER, count).map((entry, k) => inCondition(entry, conditions[k]));
		const race = createRace(s + 2, grid, track, [], RULES);
		const rand = random(s + 3);
		const kicks = [40 + rand() * 80, 140 + rand() * 120];
		const touched = new Map<unknown, Map<number, number>>();
		listen = (index, body) => {
			const car = race.cars[index];
			if (car.retired || car.towed) return;
			// one bump, not every part of the car that touches, nor the next step's
			if (!touched.has(body)) touched.set(body, new Map());
			const bumps = touched.get(body)!;
			const last = bumps.get(index) ?? -9;
			bumps.set(index, race.time);
			if (race.time - last >= 1.5) tally.touches++;
		};
		const inside = new Set<string>();
		const before = new Map<string, number>();
		const was = race.trucks.map(() => 'parked');
		const since = race.trucks.map(() => 0);
		const out = race.trucks.map(() => -Infinity);
		while (!race.done) {
			for (const at of kicks) {
				if (at <= race.time || at > race.time + DT) continue;
				const runners = race.cars.filter((c) => !c.retired && c.lane < LANE.in && c.speed > 15);
				if (!runners.length) continue;
				const car = runners[Math.floor(rand() * runners.length)];
				const v = car.body.getLinearVelocity();
				const a = Math.atan2(v.y, v.x) + 0.5 * (car.across > 0 ? 1 : -1) * track.hand;
				const speed = Math.hypot(v.x, v.y);
				car.body.setLinearVelocity({ x: Math.cos(a) * speed, y: Math.sin(a) * speed });
			}
			race.step();
			for (const e of race.events) if (e.kind === 'retire') tally.wrecks++;
			race.events.length = 0;
			race.trucks.forEach((truck, t) => {
				const [cos, sin] = [Math.cos(truck.angle), Math.sin(truck.angle)];
				const at = nearest(track, truck.x, truck.y, truck.sample);
				const across = lateral(track, truck.x, truck.y, at);
				const onRoad = truck.doing !== 'parked' && Math.abs(across) < HALF_ROAD + TRUCK.wide;
				if (onRoad) tally.onTrack += DT;
				// what of the road it and the wreck it is at take up, and the most room left by them
				const skew = truck.angle - Math.atan2(track.ty[at], track.tx[at]);
				const half = TRUCK.wide * Math.abs(Math.cos(skew)) + TRUCK.long * Math.abs(Math.sin(skew));
				const spans: [number, number][] = [[across - half, across + half]];
				for (const c of race.cars) {
					if (!c.retired || c.towed || Math.hypot(c.x - truck.x, c.y - truck.y) >= 12) continue;
					const k = nearest(track, c.x, c.y, c.sample);
					const a = lateral(track, c.x, c.y, k);
					const lie = c.angle - Math.atan2(track.ty[k], track.tx[k]);
					const w = Math.abs(Math.sin(lie)) * NOSE + Math.abs(Math.cos(lie)) * 0.95;
					spans.push([a - w, a + w]);
				}
				spans.sort((p, q) => p[0] - q[0]);
				let [edge, room] = [-HALF_ROAD, 0];
				for (const [lo, hi] of spans) {
					room = Math.max(room, lo - edge);
					edge = Math.max(edge, hi);
				}
				room = Math.max(room, HALF_ROAD - edge);
				const working =
					onRoad &&
					Math.abs(truck.speed) < 0.3 &&
					['lift', 'approach', 'reverse'].includes(truck.doing);
				const fits = room >= 2 * HALF_CAR + 0.5;
				if (truck.doing === 'held' && was[t] !== 'held') since[t] = race.time;
				if (was[t] === 'held' && truck.doing !== 'held') {
					tally.held.push(race.time - since[t]);
					out[t] = race.time;
				}
				was[t] = truck.doing;
				race.cars.forEach((car, c) => {
					if (car.retired || car.towed) return;
					const key = `${t}:${c}`;
					const [dx, dy] = [car.x - truck.x, car.y - truck.y];
					const [fore, side] = [dx * cos + dy * sin, dy * cos - dx * sin];
					if (Math.abs(fore) < TRUCK.long + 3 && Math.abs(side) < TRUCK.wide + 3) {
						const [cc, cs] = [Math.cos(car.angle), Math.sin(car.angle)];
						let depth = 0;
						for (let k = 0; k < 16; k += 2) {
							const [hx, hy] = [car.hull[k], car.hull[k + 1]];
							const [px, py] = [dx + hx * cc - hy * cs, dy + hx * cs + hy * cc];
							const [lx, ly] = [px * cos + py * sin, py * cos - px * sin];
							depth = Math.max(
								depth,
								Math.min(TRUCK.long - Math.abs(lx), TRUCK.wide - Math.abs(ly))
							);
						}
						if (depth > 0.6 && !inside.has(key)) tally.deep++;
						if (depth > 0.6) inside.add(key);
						else if (depth < 0.1) inside.delete(key);
					}
					if (!onRoad || car.lane >= LANE.in) return before.delete(key);
					const ahead = along(car.sample, at);
					const prior = before.get(key);
					if (working && !fits && prior !== undefined && prior > 0 && ahead <= 0 && ahead > -15)
						tally.pastBlocked++;
					before.set(key, ahead);
					const between = race.cars.some(
						(o) =>
							o !== car &&
							!o.retired &&
							o.lane < LANE.in &&
							Math.abs(o.across - car.across) < 2.2 &&
							along(car.sample, o.sample) > 0 &&
							along(car.sample, o.sample) < ahead
					);
					if (working && fits && ahead > 0 && ahead < 30 && !between && car.speed < 2)
						tally.stuck += DT;
					if (race.time - out[t] < 8 && ahead > 0 && ahead < 25) {
						const gap = Math.max(
							Math.abs(fore) - TRUCK.long - NOSE,
							Math.abs(side) - TRUCK.wide - HALF_CAR
						);
						if (gap < 2 && car.speed > Math.abs(truck.speed) + 2 && !inside.has(`close${key}`)) {
							tally.close++;
							inside.add(`close${key}`);
						}
					} else inside.delete(`close${key}`);
				});
			});
		}
	}
	listen = null;
	return tally;
}

const SEEDS = Array.from({ length: 14 }, (_, i) => 1000 + i * 7919);

describe.each([
	['circuit', 8],
	['oval', 8]
] as [TrackId, number][])('the tow trucks among the cars on %s, %i cars', (id, count) => {
	const tally = races(id, count, SEEDS);
	const minutes = tally.onTrack / 60;
	it('have work to do', () => {
		// (the oval makes fewer wrecks than the Glen)
		expect(tally.wrecks).toBeGreaterThan(id === 'oval' ? 2 : 5);
	});
	it('are never driven through', () => {
		expect(tally.deep).toBeLessThanOrEqual(1);
	});
	it('are not got past where they leave no room', () => {
		expect(tally.pastBlocked).toBe(0);
	});
	it('are hardly ever touched', () => {
		expect(tally.touches / minutes).toBeLessThan(0.3);
	});
	it('are gone round where there is room', () => {
		expect(tally.stuck / minutes).toBeLessThan(6);
	});
	it('are let out of the pits soon, and on without a fright', () => {
		const held = tally.held.sort((a, b) => a - b);
		expect(held[Math.floor(held.length / 2)]).toBeLessThan(1);
		expect(tally.close).toBe(0);
	});
});
