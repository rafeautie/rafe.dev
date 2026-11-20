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

	it('survives being packed into bytes, and stays under 150 KB', () => {
		for (let seed = 1; seed <= 10; seed++) {
			const recording = record(seed, drawGrid(seed, ROSTER));
			const bytes = pack(recording);
			expect(bytes.length).toBeLessThan(150_000);
			const { poses, ...header } = unpack(bytes);
			const { poses: recorded, ...expected } = recording;
			expect(header).toEqual(expected);
			expect(poses.length).toBe(recorded.length);
			expect(poses.every((byte, at) => byte === recorded[at])).toBe(true);
		}
	});
});
