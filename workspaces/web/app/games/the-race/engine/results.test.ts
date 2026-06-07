import { describe, it, expect } from 'vitest';
import { isTeamMode, driverOfTheDay } from './results';
import type { PublicCarState, PublicGameState, Score } from './types';

function pubCar(overrides: Partial<PublicCarState> & { id: number }): PublicCarState {
	return {
		position: 0,
		handSize: 0,
		liveryId: overrides.id,
		teamId: 0,
		overtakes: 0,
		defensesHeld: 0,
		gridPosition: 0,
		...overrides
	};
}

function makeState(overrides: Partial<PublicGameState> = {}): PublicGameState {
	return {
		phase: 'results',
		players: [
			{ id: 'p1', name: 'Alice', carIds: [0], isHost: true, connected: true },
			{ id: 'p2', name: 'Bob', carIds: [1], isHost: false, connected: true }
		],
		cars: [],
		pendingThisRound: [],
		endAfterRound: true,
		challengeWinsThisTurn: 0,
		qualifiedCarIds: [],
		log: [],
		...overrides
	};
}

const score = (carId: number, rank: number, points: number): Score => ({ carId, rank, points });

describe('isTeamMode', () => {
	it('is false when every player controls a single car', () => {
		expect(isTeamMode(makeState())).toBe(false);
	});

	it('is true when any player controls more than one car', () => {
		const state = makeState({
			players: [{ id: 'p1', name: 'Alice', carIds: [0, 1], isHost: true, connected: true }]
		});
		expect(isTeamMode(state)).toBe(true);
	});
});

describe('driverOfTheDay', () => {
	// Grid: car0 pole (gridRank 1) … car3 last (gridRank 4).
	const gridCars = () => [
		pubCar({ id: 0, gridPosition: 3 }),
		pubCar({ id: 1, gridPosition: 2 }),
		pubCar({ id: 2, gridPosition: 1 }),
		pubCar({ id: 3, gridPosition: 0 })
	];

	it('returns null when there are no final scores', () => {
		expect(driverOfTheDay(makeState({ cars: gridCars() }))).toBeNull();
	});

	it('picks the car that gained the most places from the grid', () => {
		// car3 climbs from gridRank 4 to P1 → +3 places.
		const state = makeState({
			cars: gridCars(),
			finalScores: [score(3, 1, 9), score(0, 2, 6), score(1, 3, 4), score(2, 4, 3)]
		});
		expect(driverOfTheDay(state)).toEqual({ carId: 3, placesGained: 3 });
	});

	it('returns null when nobody finished ahead of their grid slot', () => {
		// Everyone finishes at their grid rank → no climbers.
		const state = makeState({
			cars: gridCars(),
			finalScores: [score(0, 1, 9), score(1, 2, 6), score(2, 3, 4), score(3, 4, 3)]
		});
		expect(driverOfTheDay(state)).toBeNull();
	});

	it('breaks a tie in places gained by overtakes', () => {
		// car1 and car2 both gain +1; car2 has more overtakes, so it wins.
		const state = makeState({
			cars: [
				pubCar({ id: 0, gridPosition: 3 }),
				pubCar({ id: 1, gridPosition: 2, overtakes: 1 }),
				pubCar({ id: 2, gridPosition: 1, overtakes: 3 }),
				pubCar({ id: 3, gridPosition: 0 })
			],
			finalScores: [score(1, 1, 9), score(2, 2, 6), score(0, 3, 4), score(3, 4, 3)]
		});
		expect(driverOfTheDay(state)).toEqual({ carId: 2, placesGained: 1 });
	});
});
