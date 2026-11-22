import { describe, expect, it } from 'vitest';
import { createReplay, pack, record, unpack } from './recording';
import { ROSTER } from './roster';
import { CLASSIC, createRace, drawGrid, rank } from './sim';
import { getTrack } from './track';

// on the circuit, where the seeds these pick were picked
const track = getTrack('circuit');

/**
 * The six cars that raced every time before the field could change size. The
 * seeds below were picked for races between them, so they race here.
 */
const SIX = ROSTER.slice(0, 6);

describe('a recording', () => {
	it('plays back as the race it was made from', () => {
		const seed = 5;
		const grid = drawGrid(seed, SIX);
		const recording = record(seed, grid, track, [], CLASSIC);
		const replay = createReplay(recording, ROSTER);
		// the same race again, to hold the replay up against
		const race = createRace(seed, grid, track, [], CLASSIC);
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
		const recording = record(5, drawGrid(5, SIX), track, [], CLASSIC);
		const straight = createReplay(recording, ROSTER);
		const wound = createReplay(recording, ROSTER);
		straight.seek(30);
		wound.seek(wound.duration);
		expect(wound.seek(30)).toEqual([]);
		expect(wound.cars).toEqual(straight.cars);
	});

	it('gives the gap between two cars by the clock', () => {
		const replay = createReplay(record(5, drawGrid(5, SIX), track, [], CLASSIC), ROSTER);
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

	it('plays back the caution and the truck that fetched the wreck, crane and all', () => {
		// seed 7 loses a car ten seconds in
		const grid = drawGrid(7, SIX);
		const recording = record(7, grid, track, [], CLASSIC);
		const replay = createReplay(recording, ROSTER);
		const race = createRace(7, grid, track, [], CLASSIC);
		let cautions = 0;
		let again = 0;
		let towed = 0;
		let loaded = 0;
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
				expect(shown.load).toEqual(truck.load);
				expect(Math.abs(Math.sin(shown.crane.swing - truck.crane.swing))).toBeLessThan(0.02);
				expect(Math.abs(shown.crane.reach - truck.crane.reach)).toBeLessThan(0.03);
				expect(Math.abs(shown.crane.raise - truck.crane.raise)).toBeLessThan(0.01);
				if (shown.towing >= 0) towed++;
				if (shown.load.some((car) => car >= 0)) loaded++;
			});
			race.step();
			race.step();
		}
		// every caution in it, the one for that car first
		expect(cautions).toBe(recording.events.filter((event) => event.kind === 'caution').length);
		expect(cautions).toBeGreaterThan(0);
		expect(towed).toBeGreaterThan(0);
		expect(loaded).toBeGreaterThan(0);
		// the laps ended under it were told too, and are as many as the race was made longer by
		expect(again).toBe(race.laps - 3);
		expect(again).toBeGreaterThan(0);
		// wound back to the start, the flag is green again and the trucks are home
		replay.seek(0);
		expect(replay.flag).toBe('green');
		expect(replay.trucks.every((truck) => !truck.busy)).toBe(true);
	});

	it('leaves the trucks out of a race none went out in, and shows them parked', () => {
		// seed 5 is a clean race; seed 7 loses a car, and a truck goes for it
		const quiet = record(5, drawGrid(5, SIX), track, [], CLASSIC);
		const busy = record(7, drawGrid(7, SIX), track, [], CLASSIC);
		const cars = SIX.length * 10;
		expect(quiet.trucks).toBe(0);
		expect(quiet.poses.length).toBe(quiet.frames * cars);
		expect(busy.trucks).toBe(2);
		expect(busy.poses.length).toBeGreaterThan(busy.frames * cars);
		const replay = createReplay(quiet, ROSTER);
		replay.seek(30);
		for (const truck of replay.trucks) expect(truck).toMatchObject({ busy: false, towing: -1 });
	});

	it('still plays a recording made before there were trucks', () => {
		const { trucks: _, ...recording } = record(7, drawGrid(7, SIX), track, [], CLASSIC);
		const cars = SIX.length * 10;
		// the same race with the trucks' bytes taken out of every moment
		const moment = recording.poses.length / recording.frames;
		const poses = new Uint8Array(recording.frames * cars);
		for (let frame = 0; frame < recording.frames; frame++) {
			poses.set(recording.poses.subarray(frame * moment, frame * moment + cars), frame * cars);
		}
		const old = createReplay({ ...recording, poses }, ROSTER);
		const now = createReplay(record(7, drawGrid(7, SIX), track, [], CLASSIC), ROSTER);
		old.seek(40);
		now.seek(40);
		expect(old.cars).toEqual(now.cars);
		// a truck is out by now, but the old recording knows nothing of it: its trucks stay parked
		expect(now.trucks.some((truck) => truck.busy)).toBe(true);
		for (const truck of old.trucks)
			expect(truck).toMatchObject({ busy: false, towing: -1, load: [-1, -1] });
	});

	it('still plays a recording made before the trucks had cranes', () => {
		const { cranes, ...recording } = record(7, drawGrid(7, SIX), track, [], CLASSIC);
		expect(cranes).toBe(true);
		const cars = SIX.length * 10;
		// the same race with each truck's moment cut down to what it was: where it was, and what it was doing
		const moment = recording.poses.length / recording.frames;
		const size = (moment - cars) / recording.trucks!;
		const old = cars + recording.trucks! * 8;
		const poses = new Uint8Array(recording.frames * old);
		for (let frame = 0; frame < recording.frames; frame++) {
			const at = frame * moment;
			poses.set(recording.poses.subarray(at, at + cars), frame * old);
			for (let truck = 0; truck < recording.trucks!; truck++) {
				const from = at + cars + truck * size;
				poses.set(recording.poses.subarray(from, from + 7), frame * old + cars + truck * 8);
			}
		}
		const before = createReplay({ ...recording, poses }, ROSTER);
		const now = createReplay(record(7, drawGrid(7, SIX), track, [], CLASSIC), ROSTER);
		for (let time = 0; time < now.duration; time += 0.5) {
			before.seek(time);
			now.seek(time);
			expect(before.cars).toEqual(now.cars);
			now.trucks.forEach((truck, index) => {
				const shown = before.trucks[index];
				expect([shown.x, shown.y, shown.busy, shown.towing]).toEqual([
					truck.x,
					truck.y,
					truck.busy,
					truck.towing
				]);
				// with its crane folded and nothing on its bed
				expect(shown).toMatchObject({ load: [-1, -1], crane: { raise: 0 } });
			});
		}
	});

	it('takes one packed before there was a choice of track to be on the circuit', () => {
		const { track: _, ...older } = record(1, drawGrid(1, SIX), getTrack('oval'), [], CLASSIC);
		expect(unpack(pack(older as never)).track).toBe('circuit');
	});

	it('survives being packed into bytes, and stays under 600 KB', () => {
		for (let seed = 1; seed <= 10; seed++) {
			const recording = record(seed, drawGrid(seed, SIX), track, [], CLASSIC);
			const bytes = pack(recording);
			// (a caution lasts as long as the truck takes to go round for the wreck, which is most of what a long race is)
			expect(bytes.length).toBeLessThan(600_000);
			const { poses, ...header } = unpack(bytes);
			const { poses: recorded, ...expected } = recording;
			expect(header).toEqual(expected);
			expect(poses.length).toBe(recorded.length);
			expect(poses.every((byte, at) => byte === recorded[at])).toBe(true);
		}
	});
});
