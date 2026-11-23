import { describe, expect, it } from 'vitest';
import { LANE } from './pits';
import { createReplay, record } from './recording';
import { ROSTER } from './roster';
import { RULES } from './sim';
import { createTelemetry, pedals, pitOf, type Source } from './telemetry';
import { getTrack } from './track';

describe('pedals', () => {
	it('is on the throttle gaining speed and holding it, and on the brake losing it', () => {
		expect(pedals(30, 6).throttle).toBe(1);
		expect(pedals(30, 0).throttle).toBeCloseTo(0.3);
		expect(pedals(30, 0).brake).toBe(0);
		const braking = pedals(30, -10);
		expect(braking.throttle).toBe(0);
		expect(braking.brake).toBeGreaterThan(0.5);
		// rolling a little slower is neither
		expect(pedals(30, -1).brake).toBe(0);
		// standing still is neither
		expect(pedals(0, 0)).toEqual({ throttle: 0, brake: 0 });
	});
});

describe('pits', () => {
	it('says where a car is with the pits', () => {
		expect(pitOf(LANE.racing)).toBe('track');
		expect(pitOf(LANE.called)).toBe('track');
		expect(pitOf(LANE.in)).toBe('lane');
		expect(pitOf(LANE.box)).toBe('box');
		expect(pitOf(LANE.out)).toBe('lane');
	});
});

describe('reading a car', () => {
	const track = getTrack('daytona');
	const grid = ROSTER.slice(0, 6);
	const replay = createReplay(record(7, grid, track, [30], RULES), ROSTER);

	it('reads place, gaps, laps and what is left in the tank through a race', () => {
		const telemetry = createTelemetry();
		const seen = { lap: false, braked: false, throttle: false, stop: false, caution: false };
		for (let time = 0; time < replay.duration; time += 1 / 30) {
			replay.seek(time);
			const reading = telemetry.read(replay, 0);
			expect(reading.id).toBe(grid[0].id);
			expect(reading.place).toBeGreaterThanOrEqual(1);
			expect(reading.place).toBeLessThanOrEqual(grid.length);
			expect(reading.of).toBe(grid.length);
			expect(reading.ahead === null).toBe(reading.place === 1);
			expect(reading.behind === null).toBe(reading.place === grid.length);
			expect(reading.fuel).not.toBeNull();
			expect(reading.fuel!).toBeGreaterThanOrEqual(0);
			expect(reading.fuel!).toBeLessThanOrEqual(1);
			if (reading.last > 0) {
				seen.lap = true;
				expect(reading.best).toBeLessThanOrEqual(reading.last);
				expect(reading.fastest).toBeLessThanOrEqual(reading.best);
			}
			seen.braked ||= reading.brake > 0.3;
			seen.throttle ||= reading.throttle > 0.8;
			seen.stop ||= reading.pit === 'box' && reading.stop !== null;
			seen.caution ||= reading.caution;
		}
		expect(seen.lap).toBe(true);
		expect(seen.braked).toBe(true);
		expect(seen.throttle).toBe(true);
		// a caution was thrown by hand at 30 s
		expect(seen.caution).toBe(true);
		// four laps on a tank that holds about three: it stopped
		expect(seen.stop).toBe(true);
	});

	it('gives the gap to the car ahead as the replay times it', () => {
		const telemetry = createTelemetry();
		replay.seek(25);
		const second = replay.cars.indexOf([...replay.cars].sort((a, b) => b.progress - a.progress)[1]);
		const reading = telemetry.read(replay, second);
		const ahead = replay.cars.findIndex((car) => car.entry.id === reading.ahead!.id);
		expect(reading.place).toBe(2);
		expect(reading.ahead!.gap).toBeCloseTo(replay.gap(second, ahead)!, 5);
	});

	it('places the car by the order it is given, as the tower shows it', () => {
		replay.seek(25);
		const order = [...replay.cars]
			.sort((a, b) => b.progress - a.progress)
			.map((car) => car.entry.id);
		// the tower still has the first two the other way round
		[order[0], order[1]] = [order[1], order[0]];
		const first = replay.cars.findIndex((car) => car.entry.id === order[1]);
		const reading = createTelemetry().read(replay, first, order);
		expect(reading.place).toBe(2);
		expect(reading.ahead!.id).toBe(order[0]);
	});

	it('has no tank or tyres in a race without pits, and no pedals for a retired car', () => {
		const source: Source = {
			...replay,
			cars: replay.cars.map((car) => ({ ...car })),
			flag: replay.flag,
			pits: false,
			time: 10,
			lap: replay.lap,
			gap: () => 1.5
		};
		source.cars[0].retired = true;
		source.cars[0].speed = 20;
		const reading = createTelemetry().read(source, 0);
		expect(reading.fuel).toBeNull();
		expect(reading.tyres).toBeNull();
		expect(reading.throttle).toBe(0);
		expect(reading.brake).toBe(0);
		expect(reading.retired).toBe(true);
		// 20 m/s is about 45 mph
		expect(reading.speed).toBeCloseTo(44.74, 1);
	});
});
