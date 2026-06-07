import { describe, it, expect } from 'vitest';
import { toPublicState } from './projection';
import type { ProjectionDOState } from './types';
import type { Card, GameState } from './types';
import { emptySeason } from './season';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(value: number): Card {
	return { id: `gears:${value}`, kind: 'regular', value, suit: 'gears' };
}

function redlineCard(): Card {
	return { id: 'gears:redline', kind: 'redline', suit: 'gears' };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
	return {
		phase: 'race',
		players: [
			{ id: 'p1', carIds: [0], isHost: true },
			{ id: 'p2', carIds: [1], isHost: false }
		],
		cars: [
			{ id: 0, position: 0, hand: [makeCard(5), makeCard(8)], deck: [], discard: [] },
			{ id: 1, position: 1, hand: [makeCard(3), makeCard(7)], deck: [], discard: [] }
		],
		pendingThisRound: [0, 1],
		endAfterRound: false,
		challengeWinsThisTurn: 0,
		qualifyingCards: {},
		season: emptySeason(),
		...overrides
	};
}

function makeDOState(overrides: Partial<ProjectionDOState> = {}): ProjectionDOState {
	return {
		players: [
			{ id: 'p1', name: 'Alice', isHost: true, connected: true },
			{ id: 'p2', name: 'Bob', isHost: false, connected: true }
		],
		phase: 'race',
		gameState: makeGameState(),
		log: [],
		carLiveries: { 0: 2, 1: 5 },
		...overrides
	};
}

// ─── Hand secrecy ─────────────────────────────────────────────────────────────

describe('toPublicState — hand secrecy', () => {
	it("viewer's own car has full hand contents", () => {
		const state = makeDOState();
		const pub = toPublicState(state, 'p1');
		const car0 = pub.cars.find((c) => c.id === 0);
		expect(car0?.hand).toBeDefined();
		expect(car0?.hand).toHaveLength(2);
	});

	it("opponent's car has no hand (undefined)", () => {
		const state = makeDOState();
		const pub = toPublicState(state, 'p1');
		const car1 = pub.cars.find((c) => c.id === 1);
		expect(car1?.hand).toBeUndefined();
	});

	it("opponent's car exposes correct handSize", () => {
		const state = makeDOState();
		const pub = toPublicState(state, 'p1');
		const car1 = pub.cars.find((c) => c.id === 1);
		expect(car1?.handSize).toBe(2);
	});

	it('no hand revealed when viewerId is undefined (spectator)', () => {
		const state = makeDOState();
		const pub = toPublicState(state, undefined);
		for (const car of pub.cars) {
			expect(car.hand).toBeUndefined();
		}
	});

	it('in 2-player mode each player sees both their cars', () => {
		const gs = makeGameState({
			players: [
				{ id: 'p1', carIds: [0, 1], isHost: true },
				{ id: 'p2', carIds: [2, 3], isHost: false }
			],
			cars: [
				{ id: 0, position: 0, hand: [makeCard(5)], deck: [], discard: [] },
				{ id: 1, position: 1, hand: [makeCard(6)], deck: [], discard: [] },
				{ id: 2, position: 2, hand: [makeCard(7)], deck: [], discard: [] },
				{ id: 3, position: 3, hand: [makeCard(8)], deck: [], discard: [] }
			]
		});
		const doState: ProjectionDOState = {
			players: [
				{ id: 'p1', name: 'Alice', isHost: true, connected: true },
				{ id: 'p2', name: 'Bob', isHost: false, connected: true }
			],
			phase: 'race',
			gameState: gs,
			log: [],
			carLiveries: {}
		};
		const pub = toPublicState(doState, 'p1');
		expect(pub.cars.find((c) => c.id === 0)?.hand).toBeDefined();
		expect(pub.cars.find((c) => c.id === 1)?.hand).toBeDefined();
		expect(pub.cars.find((c) => c.id === 2)?.hand).toBeUndefined();
		expect(pub.cars.find((c) => c.id === 3)?.hand).toBeUndefined();
	});
});

// ─── Challenge secrecy ────────────────────────────────────────────────────────

describe('toPublicState — challenge card secrecy', () => {
	it('committed challenger cards are visible only to the challenger', () => {
		const gs = makeGameState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCards: [makeCard(8)],
				defenderCards: undefined
			}
		});
		const state = makeDOState({ gameState: gs });

		// p1 owns car 0 (challenger)
		const p1view = toPublicState(state, 'p1');
		expect(p1view.pendingChallenge?.challengerCards).toBeDefined();
		expect(p1view.pendingChallenge?.challengerCards).toHaveLength(1);
		expect(p1view.pendingChallenge?.defenderCards).toBeUndefined();

		// p2 owns car 1 (defender) — should NOT see challenger cards
		const p2view = toPublicState(state, 'p2');
		expect(p2view.pendingChallenge?.challengerCards).toBeUndefined();
	});

	it('committed defender cards are visible only to the defender', () => {
		const gs = makeGameState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCards: [makeCard(8)],
				defenderCards: [makeCard(6)]
			}
		});
		const state = makeDOState({ gameState: gs });

		// p2 owns car 1 (defender)
		const p2view = toPublicState(state, 'p2');
		expect(p2view.pendingChallenge?.defenderCards).toBeDefined();
		expect(p2view.pendingChallenge?.defenderCards).toHaveLength(1);
		expect(p2view.pendingChallenge?.challengerCards).toBeUndefined();

		// p1 owns car 0 (challenger) — should NOT see defender cards
		const p1view = toPublicState(state, 'p1');
		expect(p1view.pendingChallenge?.defenderCards).toBeUndefined();
	});

	it('challengerCommitted is true when challengerCards is set', () => {
		const gs = makeGameState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCards: [makeCard(8)],
				defenderCards: undefined
			}
		});
		const state = makeDOState({ gameState: gs });
		const pub = toPublicState(state, 'p2');
		expect(pub.pendingChallenge?.challengerCommitted).toBe(true);
		expect(pub.pendingChallenge?.defenderCommitted).toBe(false);
	});

	it('both committed flags are false before either side commits', () => {
		const gs = makeGameState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1
			}
		});
		const state = makeDOState({ gameState: gs });
		const pub = toPublicState(state, 'p1');
		expect(pub.pendingChallenge?.challengerCommitted).toBe(false);
		expect(pub.pendingChallenge?.defenderCommitted).toBe(false);
	});
});

// ─── Qualifying reveal ────────────────────────────────────────────────────────

describe('toPublicState — qualifying reveal', () => {
	it("viewer's own qualifying card is revealed during qualifying", () => {
		const gs = makeGameState({
			phase: 'qualifying',
			qualifyingCards: { 0: [makeCard(7)] }
		});
		const state = makeDOState({ phase: 'qualifying', gameState: gs });
		const pub = toPublicState(state, 'p1');
		const car0 = pub.cars.find((c) => c.id === 0);
		expect(car0?.qualifyingCards).toBeDefined();
		expect(car0?.qualifyingCards).toHaveLength(1);
	});

	it("opponent's qualifying card is NOT revealed during qualifying", () => {
		const gs = makeGameState({
			phase: 'qualifying',
			qualifyingCards: { 1: [makeCard(10)] }
		});
		const state = makeDOState({ phase: 'qualifying', gameState: gs });
		const pub = toPublicState(state, 'p1');
		const car1 = pub.cars.find((c) => c.id === 1);
		expect(car1?.qualifyingCards).toBeUndefined();
	});

	it('qualifyingCards not set after qualifying phase ends', () => {
		const gs = makeGameState({
			phase: 'race',
			qualifyingCards: {}
		});
		const state = makeDOState({ phase: 'race', gameState: gs });
		const pub = toPublicState(state, 'p1');
		const car0 = pub.cars.find((c) => c.id === 0);
		expect(car0?.qualifyingCards).toBeUndefined();
	});
});

// ─── qualifiedCarIds ──────────────────────────────────────────────────────────

describe('toPublicState — qualifiedCarIds', () => {
	it('qualifiedCarIds reflects keys of qualifyingCards', () => {
		const gs = makeGameState({
			phase: 'qualifying',
			qualifyingCards: { 0: [makeCard(7)] }
		});
		const state = makeDOState({ phase: 'qualifying', gameState: gs });
		const pub = toPublicState(state, 'p1');
		expect(pub.qualifiedCarIds).toContain(0);
		expect(pub.qualifiedCarIds).not.toContain(1);
	});

	it('qualifiedCarIds is empty when no car has qualified', () => {
		const gs = makeGameState({ qualifyingCards: {} });
		const state = makeDOState({ gameState: gs });
		const pub = toPublicState(state, 'p1');
		expect(pub.qualifiedCarIds).toHaveLength(0);
	});
});

// ─── liveryId ────────────────────────────────────────────────────────────────

describe('toPublicState — liveryId', () => {
	it('uses carLiveries map for liveryId', () => {
		const state = makeDOState({ carLiveries: { 0: 7, 1: 3 } });
		const pub = toPublicState(state, 'p1');
		expect(pub.cars.find((c) => c.id === 0)?.liveryId).toBe(7);
		expect(pub.cars.find((c) => c.id === 1)?.liveryId).toBe(3);
	});

	it('falls back to carId when livery not assigned', () => {
		const state = makeDOState({ carLiveries: {} });
		const pub = toPublicState(state, 'p1');
		expect(pub.cars.find((c) => c.id === 0)?.liveryId).toBe(0);
		expect(pub.cars.find((c) => c.id === 1)?.liveryId).toBe(1);
	});
});

// ─── teamId ──────────────────────────────────────────────────────────────────

describe('toPublicState — teamId', () => {
	it('derives teamId from the livery so paired teammates share a team', () => {
		// Liveries 6 & 7 are the two Mercedes cars → team index 3.
		const state = makeDOState({ carLiveries: { 0: 6, 1: 7 } });
		const pub = toPublicState(state, 'p1');
		expect(pub.cars.find((c) => c.id === 0)?.teamId).toBe(3);
		expect(pub.cars.find((c) => c.id === 1)?.teamId).toBe(3);
	});

	it('gives cars on different teams distinct teamIds', () => {
		const state = makeDOState({ carLiveries: { 0: 2, 1: 5 } });
		const pub = toPublicState(state, 'p1');
		// Livery 2 → Ferrari (team 1); livery 5 → McLaren (team 2).
		expect(pub.cars.find((c) => c.id === 0)?.teamId).toBe(1);
		expect(pub.cars.find((c) => c.id === 1)?.teamId).toBe(2);
	});
});

// ─── No gameState (lobby phase) ───────────────────────────────────────────────

describe('toPublicState — lobby (no gameState)', () => {
	it('returns empty cars and default pending values when gameState is undefined', () => {
		const state: ProjectionDOState = {
			players: [{ id: 'p1', name: 'Alice', isHost: true, connected: true }],
			phase: 'lobby',
			gameState: undefined,
			log: [],
			carLiveries: {}
		};
		const pub = toPublicState(state, 'p1');
		expect(pub.cars).toHaveLength(0);
		expect(pub.pendingThisRound).toHaveLength(0);
		expect(pub.endAfterRound).toBe(false);
		expect(pub.challengeWinsThisTurn).toBe(0);
		expect(pub.qualifiedCarIds).toHaveLength(0);
	});
});

// ─── Redline card in challenge ────────────────────────────────────────────────

describe('toPublicState — challenge with Redline card', () => {
	it('challenger sees their own Redline card committed', () => {
		const gs = makeGameState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCards: [makeCard(8), redlineCard()],
				defenderCards: undefined
			}
		});
		const state = makeDOState({ gameState: gs });
		const pub = toPublicState(state, 'p1');
		expect(pub.pendingChallenge?.challengerCards).toHaveLength(2);
	});
});

// ─── Season projection ─────────────────────────────────────────────────────────

describe('toPublicState — Season projection', () => {
	const raceResult = {
		results: [
			{ carId: 0, rank: 1, points: 9, gridPosition: 0, overtakes: 0, defensesHeld: 0 },
			{ carId: 1, rank: 2, points: 6, gridPosition: 1, overtakes: 0, defensesHeld: 0 }
		]
	};

	it('projects standings, race number, and completion from the Season', () => {
		const gs = makeGameState({ phase: 'results', season: { totalRaces: 7, races: [raceResult] } });
		const pub = toPublicState(makeDOState({ phase: 'results', gameState: gs }), 'p1');
		expect(pub.season?.racesCompleted).toBe(1);
		expect(pub.season?.raceNumber).toBe(1); // just-finished Race in results
		expect(pub.season?.isComplete).toBe(false);
		expect(pub.season?.driverStandings.map((d) => [d.carId, d.points])).toEqual([
			[0, 9],
			[1, 6]
		]);
	});

	it('derives finalScores from the last Race, only in the results phase', () => {
		const resultsGs = makeGameState({
			phase: 'results',
			season: { totalRaces: 7, races: [raceResult] }
		});
		expect(
			toPublicState(makeDOState({ phase: 'results', gameState: resultsGs }), 'p1').finalScores
		).toEqual([
			{ carId: 0, rank: 1, points: 9 },
			{ carId: 1, rank: 2, points: 6 }
		]);

		const raceGs = makeGameState({ phase: 'race', season: { totalRaces: 7, races: [raceResult] } });
		expect(
			toPublicState(makeDOState({ phase: 'race', gameState: raceGs }), 'p1').finalScores
		).toBeUndefined();
	});

	it('raceNumber is the in-progress Race outside results', () => {
		const gs = makeGameState({ phase: 'race', season: { totalRaces: 7, races: [raceResult] } });
		expect(
			toPublicState(makeDOState({ phase: 'race', gameState: gs }), 'p1').season?.raceNumber
		).toBe(2);
	});

	it('omits constructor standings outside Team Mode', () => {
		const gs = makeGameState({ phase: 'results', season: { totalRaces: 7, races: [raceResult] } });
		expect(
			toPublicState(makeDOState({ phase: 'results', gameState: gs }), 'p1').season
				?.constructorStandings
		).toBeUndefined();
	});

	it('includes constructor standings in Team Mode', () => {
		const blank = (id: number) => ({ id, position: 0, hand: [], deck: [], discard: [] });
		const gs = makeGameState({
			phase: 'results',
			players: [
				{ id: 'p1', carIds: [0, 1], isHost: true },
				{ id: 'p2', carIds: [2, 3], isHost: false }
			],
			cars: [blank(0), blank(1), blank(2), blank(3)],
			season: {
				totalRaces: 7,
				races: [
					{
						results: [
							{ carId: 0, rank: 1, points: 9, gridPosition: 0, overtakes: 0, defensesHeld: 0 },
							{ carId: 1, rank: 2, points: 6, gridPosition: 0, overtakes: 0, defensesHeld: 0 },
							{ carId: 2, rank: 3, points: 4, gridPosition: 0, overtakes: 0, defensesHeld: 0 },
							{ carId: 3, rank: 4, points: 3, gridPosition: 0, overtakes: 0, defensesHeld: 0 }
						]
					}
				]
			}
		});
		// Liveries 0,1 → Red Bull (team 0); 2,3 → Ferrari (team 1).
		const state = makeDOState({
			phase: 'results',
			gameState: gs,
			carLiveries: { 0: 0, 1: 1, 2: 2, 3: 3 }
		});
		expect(
			toPublicState(state, 'p1').season?.constructorStandings?.map((t) => [t.teamName, t.points])
		).toEqual([
			['Red Bull Racing', 15],
			['Ferrari', 7]
		]);
	});

	it('has no Season in the lobby (no gameState)', () => {
		const state: ProjectionDOState = {
			players: [{ id: 'p1', name: 'Alice', isHost: true, connected: true }],
			phase: 'lobby',
			gameState: undefined,
			log: [],
			carLiveries: {}
		};
		expect(toPublicState(state, 'p1').season).toBeUndefined();
	});
});
