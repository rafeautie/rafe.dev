import { describe, it, expect } from 'vitest';
import {
	TOTAL_RACES,
	emptySeason,
	accrueRace,
	isComplete,
	driverStandings,
	constructorStandings,
	resultsMatrix,
	runningPoints,
	statLeaders
} from './season';
import type { RaceCarResult, RaceResult } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────
//
// A row is [carId, rank, points, gridPosition?, overtakes?, defensesHeld?].

type Row = [number, number, number, number?, number?, number?];

function race(...rows: Row[]): RaceResult {
	return {
		results: rows.map(
			([
				carId,
				rank,
				points,
				gridPosition = 0,
				overtakes = 0,
				defensesHeld = 0
			]): RaceCarResult => ({
				carId,
				rank,
				points,
				gridPosition,
				overtakes,
				defensesHeld
			})
		)
	};
}

// Liveries 0,1 → Red Bull (teamId 0); 2,3 → Ferrari (teamId 1).
const teamLiveries = { 0: 0, 1: 1, 2: 2, 3: 3 };
// Single-car: each car its own livery/team.
const soloLiveries = { 0: 0, 1: 2, 2: 4, 3: 6 };

// ─── Accrual ─────────────────────────────────────────────────────────────────

describe('emptySeason / accrueRace / isComplete', () => {
	it('defaults to TOTAL_RACES and no races', () => {
		expect(emptySeason()).toEqual({ totalRaces: TOTAL_RACES, races: [] });
		expect(emptySeason(3).totalRaces).toBe(3);
	});

	it('accrueRace appends immutably', () => {
		const s0 = emptySeason(3);
		const s1 = accrueRace(s0, race([0, 1, 9]).results);
		expect(s0.races).toHaveLength(0); // original untouched
		expect(s1.races).toHaveLength(1);
		expect(s1.races[0]!.results[0]!.carId).toBe(0);
	});

	it('isComplete once races reach totalRaces', () => {
		const full = { totalRaces: 2, races: [race([0, 1, 9]), race([0, 1, 9])] };
		expect(isComplete(full)).toBe(true);
		expect(isComplete({ totalRaces: 2, races: [race([0, 1, 9])] })).toBe(false);
	});
});

// ─── Drivers' Championship ─────────────────────────────────────────────────────

describe('driverStandings', () => {
	it('is empty before any Race completes', () => {
		expect(driverStandings([], soloLiveries)).toEqual([]);
	});

	it('sums points across Races, sorts highest first, counts wins, maps liveries', () => {
		const races = [
			race([0, 1, 9], [1, 2, 6], [2, 3, 4], [3, 4, 3]),
			race([1, 1, 9], [0, 2, 6], [2, 3, 4], [3, 4, 3])
		];
		const s = driverStandings(races, soloLiveries);
		expect(s.map((d) => [d.carId, d.points, d.wins])).toEqual([
			[0, 15, 1],
			[1, 15, 1],
			[2, 8, 0],
			[3, 6, 0]
		]);
		expect(s[0]!.liveryId).toBe(soloLiveries[0]);
	});

	it('countback: equal points break to the driver with more wins', () => {
		// car0 & car1 both finish on 12; car0 has a win, car1 does not.
		const races = [
			race([0, 1, 9], [1, 2, 6], [2, 3, 4], [3, 4, 3]),
			race([2, 1, 9], [1, 2, 6], [3, 3, 4], [0, 4, 3])
		];
		const order = driverStandings(races, soloLiveries).map((d) => d.carId);
		expect(order).toEqual([2, 0, 1, 3]); // car2 13; car0 12 (1W) > car1 12 (0W); car3 7
	});

	it('a fully symmetric tie resolves deterministically by car id', () => {
		const races = [race([0, 1, 9], [1, 2, 6]), race([1, 1, 9], [0, 2, 6])];
		const order = driverStandings(races, soloLiveries).map((d) => d.carId);
		expect(order).toEqual([0, 1]); // identical points/wins/histogram → lower id first
	});

	it('head-to-head orders cars level on points and countback', () => {
		// 3 cars, all 19 pts with identical {P1,P2,P3} histograms; car0 finishes ahead
		// of car1 in 2 of 3 Races.
		const races = [
			race([0, 1, 9], [1, 2, 6], [2, 3, 4]),
			race([2, 1, 9], [0, 2, 6], [1, 3, 4]),
			race([1, 1, 9], [2, 2, 6], [0, 3, 4])
		];
		const order = driverStandings(races, soloLiveries).map((d) => d.carId);
		// car0 ahead of car1 in R1 & R2 → car0 before car1.
		expect(order.indexOf(0)).toBeLessThan(order.indexOf(1));
	});
});

// ─── Constructors' Championship ────────────────────────────────────────────────

describe('constructorStandings', () => {
	it('sums each team across its cars', () => {
		const races = [race([0, 1, 9], [1, 2, 6], [2, 3, 4], [3, 4, 3])];
		const s = constructorStandings(races, teamLiveries);
		expect(s.map((t) => [t.teamName, t.points, t.wins])).toEqual([
			['Red Bull Racing', 15, 1], // car0 9 + car1 6
			['Ferrari', 7, 0] // car2 4 + car3 3
		]);
		expect(s[0]!.carIds).toEqual([0, 1]);
	});

	it('the Constructors champion can differ from the Drivers champions team', () => {
		// car2 (Ferrari) wins the drivers title on 22, but Red Bull's steadier pair
		// (car0 21 + car1 14 = 35) beats Ferrari (car2 22 + car3 9 = 31).
		const races = [
			race([2, 1, 9], [0, 2, 6], [1, 3, 4], [3, 4, 3]),
			race([2, 1, 9], [0, 2, 6], [1, 3, 4], [3, 4, 3]),
			race([0, 1, 9], [1, 2, 6], [2, 3, 4], [3, 4, 3])
		];
		const drivers = driverStandings(races, teamLiveries);
		const teams = constructorStandings(races, teamLiveries);
		expect(drivers[0]!.carId).toBe(2); // Ferrari driver tops the Drivers'
		expect(teams[0]!.teamName).toBe('Red Bull Racing'); // …but Red Bull tops the Constructors'
		expect(teams.map((t) => t.points)).toEqual([35, 31]);
	});
});

// ─── Tabular analytics ─────────────────────────────────────────────────────────

const divergenceRaces = [
	race([2, 1, 9], [0, 2, 6], [1, 3, 4], [3, 4, 3]),
	race([2, 1, 9], [0, 2, 6], [1, 3, 4], [3, 4, 3]),
	race([0, 1, 9], [1, 2, 6], [2, 3, 4], [3, 4, 3])
];

describe('resultsMatrix', () => {
	it('rows in championship order with per-Race positions and a points total', () => {
		const m = resultsMatrix(divergenceRaces, teamLiveries);
		expect(m[0]).toMatchObject({ carId: 2, positions: [1, 1, 3], total: 22 });
		expect(m[1]).toMatchObject({ carId: 0, positions: [2, 2, 1], total: 21 });
	});
});

describe('runningPoints', () => {
	it('accumulates championship points across Races', () => {
		const r = runningPoints(divergenceRaces, teamLiveries);
		expect(r[0]).toMatchObject({ carId: 2, cumulative: [9, 18, 22] });
		expect(r[1]).toMatchObject({ carId: 0, cumulative: [6, 12, 21] });
	});
});

describe('statLeaders', () => {
	it('aggregates wins, overtakes, defenses, and places gained', () => {
		// One Race: car0 climbs from grid 2 to P1 (+1), car1 falls from pole to P2 (-1).
		const races = [race([0, 1, 9, 0, 3, 0], [1, 2, 6, 1, 0, 2])];
		const s = statLeaders(races, soloLiveries);
		expect(s[0]).toEqual({
			carId: 0,
			liveryId: soloLiveries[0],
			wins: 1,
			overtakes: 3,
			defenses: 0,
			placesGained: 1
		});
		expect(s[1]).toEqual({
			carId: 1,
			liveryId: soloLiveries[1],
			wins: 0,
			overtakes: 0,
			defenses: 2,
			placesGained: -1
		});
	});
});
