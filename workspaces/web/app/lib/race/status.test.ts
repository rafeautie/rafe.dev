import { describe, expect, it } from 'vitest';
import { LANE } from './pits';
import type { ReplayCar, ReplayTruck } from './recording';
import { describeRow, statusOf, towed, type Row } from './status';

const car = (over: Partial<ReplayCar> = {}) =>
	({ retired: false, finishTime: 0, lane: LANE.racing, stop: null, ...over }) as ReplayCar;
const truck = (towing: number, load: number[] = [-1, -1]) =>
	({ busy: towing >= 0 || load.some((at) => at >= 0), towing, load }) as ReplayTruck;
const stop = { service: 'both', since: 0, seconds: 3.4, slow: false, over: false } as const;

describe('status', () => {
	it('tells a car on a truck, on its crane or its bed', () => {
		expect(towed(2, [truck(-1), truck(2)])).toBe(true);
		expect(towed(2, [truck(-1, [-1, 2])])).toBe(true);
		expect(towed(2, [truck(1, [3, -1])])).toBe(false);
		expect(towed(2, [])).toBe(false);
	});

	it('says what each car is doing', () => {
		const trucks = [truck(1)];
		expect(statusOf(car(), 0, trucks)).toBe('racing');
		expect(statusOf(car({ lane: LANE.called }), 0, trucks)).toBe('racing');
		expect(statusOf(car({ lane: LANE.in }), 0, trucks)).toBe('pit');
		expect(statusOf(car({ lane: LANE.out }), 0, trucks)).toBe('pit');
		expect(statusOf(car({ lane: LANE.box, stop: { ...stop, plan: [] } as never }), 0, trucks)).toBe(
			'box'
		);
		// in the box before its stop is known is still in the pits
		expect(statusOf(car({ lane: LANE.box }), 0, trucks)).toBe('pit');
		expect(statusOf(car({ finishTime: 80 }), 0, trucks)).toBe('home');
		expect(statusOf(car({ retired: true }), 0, trucks)).toBe('out');
		expect(statusOf(car({ retired: true }), 1, trucks)).toBe('tow');
	});
});

describe('describing a row', () => {
	const row = (over: Partial<Row>): Row => ({
		name: 'Comet',
		place: 3,
		status: 'racing',
		leading: false,
		gap: null,
		finish: null,
		stop: null,
		supplies: null,
		...over
	});

	it('says the gap, or that it leads', () => {
		expect(describeRow(row({ gap: 2.04 }))).toBe('Comet, place 3, 2.0 s behind the leader');
		expect(describeRow(row({ place: 1, leading: true }))).toBe('Comet, place 1, leading');
		expect(describeRow(row({}))).toBe('Comet, place 3');
	});

	it('says a stop and what is left in the tank and the tires', () => {
		expect(
			describeRow(
				row({
					status: 'box',
					stop: { service: 'both', seconds: 3.42 },
					supplies: { fuel: 0.4, tyres: 0.716 }
				})
			)
		).toBe('Comet, place 3, in its box: fuel and tires, 3.4 s, fuel 40%, tires 72%');
		expect(describeRow(row({ status: 'pit' }))).toBe('Comet, place 3, in the pit lane');
	});

	it('says a car is out, towed or home, with nothing about its tank', () => {
		const supplies = { fuel: 0.1, tyres: 0.1 };
		expect(describeRow(row({ status: 'out', supplies }))).toBe('Comet, place 3, retired');
		expect(describeRow(row({ status: 'tow', supplies }))).toBe(
			'Comet, place 3, retired, being towed'
		);
		expect(
			describeRow(row({ status: 'home', supplies, finish: { time: 61.234, behind: null } }))
		).toBe('Comet, place 3, finished in 61.23 s');
		expect(describeRow(row({ status: 'home', finish: { time: 62, behind: 0.5 } }))).toBe(
			'Comet, place 3, finished 0.50 s behind the winner'
		);
	});
});
