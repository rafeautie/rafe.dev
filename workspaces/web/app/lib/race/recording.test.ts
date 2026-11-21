import { describe, expect, it } from 'vitest';
import { createReplay, pack, record, unpack } from './recording';
import { ROSTER } from './roster';
import { createRace, drawGrid, rank } from './sim';

describe('a recording', () => {
	it('plays back as the race it was made from', () => {
		const seed = 2;
		const grid = drawGrid(seed, ROSTER);
		const recording = record(seed, grid);
		const replay = createReplay(recording, ROSTER);
		// the same race again, to hold the replay up against
		const race = createRace(seed, grid);
		let hits = 0;
		for (let frame = 0; frame < recording.frames; frame++) {
			for (const event of replay.seek(frame / recording.rate)) if (event.kind === 'hit') hits++;
			race.cars.forEach((car, index) => {
				const shown = replay.cars[index];
				expect(shown.entry).toBe(car.entry);
				expect(Math.abs(shown.x - car.x)).toBeLessThan(0.01);
				expect(Math.abs(shown.y - car.y)).toBeLessThan(0.01);
				expect(Math.abs(Math.sin(shown.angle - car.angle))).toBeLessThan(0.001);
				expect(Math.abs(shown.progress - car.progress)).toBeLessThan(0.06);
				expect(Math.abs(shown.slip - Math.min(25.5, car.slip))).toBeLessThan(0.11);
				expect(shown.retired).toBe(car.retired);
				expect(Math.abs(shown.damage - car.damage)).toBeLessThan(0.001);
				car.hull.forEach((corner, k) =>
					expect(Math.abs(shown.hull[k] - corner)).toBeLessThan(0.003)
				);
			});
			race.step();
			race.step();
		}
		// a race worth checking: it had knocks, and the replay showed them
		expect(hits).toBeGreaterThan(0);
		expect(race.done).toBe(true);
		expect(rank(replay.cars).map((car) => car.entry.id)).toEqual(
			race.order().map((car) => car.entry.id)
		);
		race.cars.forEach((car, index) => {
			expect(Math.abs(replay.cars[index].finishTime - car.finishTime)).toBeLessThan(0.001);
			expect(Math.abs(replay.cars[index].bestLap - car.bestLap)).toBeLessThan(0.001);
		});
	});

	it('shows the same thing after seeking backwards', () => {
		const recording = record(2, drawGrid(2, ROSTER));
		const straight = createReplay(recording, ROSTER);
		const wound = createReplay(recording, ROSTER);
		straight.seek(30);
		wound.seek(wound.duration);
		expect(wound.seek(30)).toEqual([]);
		expect(wound.cars).toEqual(straight.cars);
	});

	it('gives the gap between two cars by the clock', () => {
		const replay = createReplay(record(2, drawGrid(2, ROSTER)), ROSTER);
		// on the grid nobody has yet been where the car behind is
		expect(replay.gap(1, 0)).toBeNull();
		replay.seek(30);
		const [leader, second] = rank(replay.cars).map((car) => replay.cars.indexOf(car));
		expect(replay.gap(leader, leader)).toBeLessThan(0.05);
		const gap = replay.gap(second, leader)!;
		expect(gap).toBeGreaterThan(0);
		// that long ago, the leader was where the second car is now
		const where = replay.cars[second].progress;
		replay.seek(30 - gap);
		expect(Math.abs(replay.cars[leader].progress - where)).toBeLessThan(0.2);
	});

	it('plays back the caution and the truck that fetched the wreck', () => {
		// seed 7 loses a car a quarter of a minute in
		const grid = drawGrid(7, ROSTER);
		const recording = record(7, grid);
		const replay = createReplay(recording, ROSTER);
		const race = createRace(7, grid);
		let cautions = 0;
		let again = 0;
		let towed = 0;
		const gates = new Set<number>();
		for (let frame = 0; frame < recording.frames; frame++) {
			for (const event of replay.seek(frame / recording.rate)) {
				if (event.kind === 'caution') cautions++;
				if (event.kind === 'again') again++;
			}
			expect(replay.flag).toBe(race.flag);
			expect(replay.extra).toBe(again);
			race.trucks.forEach((truck, index) => {
				const shown = replay.trucks[index];
				expect(Math.abs(shown.x - truck.x)).toBeLessThan(0.01);
				expect(Math.abs(shown.y - truck.y)).toBeLessThan(0.01);
				expect(Math.abs(Math.sin(shown.angle - truck.angle))).toBeLessThan(0.001);
				expect(shown.busy).toBe(truck.busy);
				expect(shown.towing).toBe(truck.towing);
				expect(shown.gate).toBe(truck.gate);
				if (shown.gate >= 0) gates.add(shown.gate);
				if (shown.towing >= 0) towed++;
			});
			race.step();
			race.step();
		}
		expect(cautions).toBe(1);
		expect(towed).toBeGreaterThan(0);
		// the laps ended under it were told too, and are as many as the race was made longer by
		expect(again).toBe(race.laps - 3);
		expect(again).toBeGreaterThan(0);
		// one gate was opened to let the truck out, and another to let it off with the wreck
		expect(gates.size).toBe(2);
		// wound back to the start, the flag is green again and the trucks are home
		replay.seek(0);
		expect(replay.flag).toBe('green');
		expect(replay.trucks.every((truck) => !truck.busy)).toBe(true);
	});

	it('leaves the trucks out of a race none went out in, and shows them parked', () => {
		// seed 2 is a clean race; seed 7 loses a car, and a truck goes for it
		const quiet = record(2, drawGrid(2, ROSTER));
		const busy = record(7, drawGrid(7, ROSTER));
		const cars = ROSTER.length * 10;
		expect(quiet.trucks).toBe(0);
		expect(quiet.poses.length).toBe(quiet.frames * cars);
		expect(busy.trucks).toBe(3);
		expect(busy.poses.length).toBeGreaterThan(busy.frames * cars);
		const replay = createReplay(quiet, ROSTER);
		replay.seek(30);
		for (const truck of replay.trucks) expect(truck).toMatchObject({ busy: false, towing: -1 });
	});

	it('still plays a recording made before there were trucks', () => {
		const { trucks: _, ...recording } = record(7, drawGrid(7, ROSTER));
		const cars = ROSTER.length * 10;
		// the same race with the trucks' bytes taken out of every moment
		const moment = recording.poses.length / recording.frames;
		const poses = new Uint8Array(recording.frames * cars);
		for (let frame = 0; frame < recording.frames; frame++) {
			poses.set(recording.poses.subarray(frame * moment, frame * moment + cars), frame * cars);
		}
		const old = createReplay({ ...recording, poses }, ROSTER);
		const now = createReplay(record(7, drawGrid(7, ROSTER)), ROSTER);
		old.seek(40);
		now.seek(40);
		expect(old.cars).toEqual(now.cars);
		// a truck is out by now, but the old recording knows nothing of it: its trucks stay parked
		expect(now.trucks.some((truck) => truck.busy)).toBe(true);
		for (const truck of old.trucks)
			expect(truck).toMatchObject({ busy: false, towing: -1, gate: -1 });
	});

	it('survives being packed into bytes, and stays under 400 KB', () => {
		for (let seed = 1; seed <= 10; seed++) {
			const recording = record(seed, drawGrid(seed, ROSTER));
			const bytes = pack(recording);
			expect(bytes.length).toBeLessThan(400_000);
			const { poses, ...header } = unpack(bytes);
			const { poses: recorded, ...expected } = recording;
			expect(header).toEqual(expected);
			expect(poses.length).toBe(recorded.length);
			expect(poses.every((byte, at) => byte === recorded[at])).toBe(true);
		}
	});
});
