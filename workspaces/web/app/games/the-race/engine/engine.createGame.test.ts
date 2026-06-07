import { describe, it, expect } from 'vitest';
import { createGame, applyAction } from './engine';
import type { CreateGamePlayer, CreateGameOpts } from './types';
import type { Suit } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALL_SUITS: Suit[] = ['gears', 'fuel', 'pistons', 'steering-wheels', 'shift-gates', 'belt'];

// Deterministic RNG: cycles through a fixed sequence so tests are reproducible.
function seededRng(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) & 0xffffffff;
		return (s >>> 0) / 0xffffffff;
	};
}

function twoPlayers(): CreateGamePlayer[] {
	return [
		{ id: 'p1', isHost: true },
		{ id: 'p2', isHost: false }
	];
}

function fourPlayers(): CreateGamePlayer[] {
	return [
		{ id: 'p1', isHost: true },
		{ id: 'p2', isHost: false },
		{ id: 'p3', isHost: false },
		{ id: 'p4', isHost: false }
	];
}

function opts2P(extraOpts: Partial<CreateGameOpts> = {}): CreateGameOpts {
	return {
		suits: ALL_SUITS,
		carsPerPlayer: 2,
		rng: seededRng(42),
		...extraOpts
	};
}

function opts1P(extraOpts: Partial<CreateGameOpts> = {}): CreateGameOpts {
	return {
		suits: ALL_SUITS,
		carsPerPlayer: 1,
		rng: seededRng(42),
		...extraOpts
	};
}

// ─── Basic structure ──────────────────────────────────────────────────────────

describe('createGame — basic structure', () => {
	it('returns a GameState in lobby phase', () => {
		const state = createGame(twoPlayers(), opts2P());
		expect(state.phase).toBe('lobby');
	});

	it('creates 4 cars for 2-player mode (2 per player)', () => {
		const state = createGame(twoPlayers(), opts2P());
		expect(state.cars).toHaveLength(4);
	});

	it('creates 4 cars for 4 players with 1 car each', () => {
		const state = createGame(fourPlayers(), opts1P());
		expect(state.cars).toHaveLength(4);
	});

	it('creates correct number of engine players', () => {
		const state = createGame(twoPlayers(), opts2P());
		expect(state.players).toHaveLength(2);
	});

	it('player ids match the input', () => {
		const state = createGame(twoPlayers(), opts2P());
		const ids = state.players.map((p) => p.id).sort();
		expect(ids).toEqual(['p1', 'p2']);
	});

	it('host flag is preserved', () => {
		const state = createGame(twoPlayers(), opts2P());
		const host = state.players.find((p) => p.id === 'p1');
		expect(host?.isHost).toBe(true);
		const guest = state.players.find((p) => p.id === 'p2');
		expect(guest?.isHost).toBe(false);
	});

	it('pendingThisRound is empty (not yet started via applyAction)', () => {
		const state = createGame(twoPlayers(), opts2P());
		expect(state.pendingThisRound).toHaveLength(0);
	});

	it('qualifyingCards is an empty record', () => {
		const state = createGame(twoPlayers(), opts2P());
		expect(Object.keys(state.qualifyingCards)).toHaveLength(0);
	});
});

// ─── Dealing ─────────────────────────────────────────────────────────────────

describe('createGame — dealing', () => {
	it('each car starts with exactly 13 cards in hand', () => {
		const state = createGame(twoPlayers(), opts2P());
		for (const car of state.cars) {
			expect(car.hand).toHaveLength(13);
		}
	});

	it('each car starts with an empty deck (all dealt)', () => {
		const state = createGame(twoPlayers(), opts2P());
		for (const car of state.cars) {
			expect(car.deck).toHaveLength(0);
		}
	});

	it('each car starts with an empty discard pile', () => {
		const state = createGame(twoPlayers(), opts2P());
		for (const car of state.cars) {
			expect(car.discard).toHaveLength(0);
		}
	});

	it('total cards dealt equals 13 × numCars', () => {
		const state = createGame(twoPlayers(), opts2P());
		const totalCards = state.cars.reduce((sum, c) => sum + c.hand.length, 0);
		expect(totalCards).toBe(13 * 4);
	});

	it('1-per-player mode: each car has 13 cards from its own suit deck', () => {
		const state = createGame(twoPlayers(), opts1P({ suits: ['gears', 'fuel'] }));
		expect(state.cars).toHaveLength(2);
		for (const car of state.cars) {
			expect(car.hand).toHaveLength(13);
		}
	});
});

// ─── Car IDs and player assignments ──────────────────────────────────────────

describe('createGame — car IDs and player assignments', () => {
	it('car IDs are assigned in consecutive order starting at 0', () => {
		const state = createGame(twoPlayers(), opts2P());
		const ids = state.cars.map((c) => c.id).sort((a, b) => a - b);
		expect(ids).toEqual([0, 1, 2, 3]);
	});

	it('each player owns carsPerPlayer cars', () => {
		const state = createGame(twoPlayers(), opts2P());
		for (const player of state.players) {
			expect(player.carIds).toHaveLength(2);
		}
	});

	it('each player owns exactly 1 car in 1-per-player mode', () => {
		const state = createGame(twoPlayers(), opts1P());
		for (const player of state.players) {
			expect(player.carIds).toHaveLength(1);
		}
	});

	it('all car IDs referenced by players exist in the cars list', () => {
		const state = createGame(twoPlayers(), opts2P());
		const carIdSet = new Set(state.cars.map((c) => c.id));
		for (const player of state.players) {
			for (const carId of player.carIds) {
				expect(carIdSet.has(carId)).toBe(true);
			}
		}
	});

	it('no two players share the same car', () => {
		const state = createGame(twoPlayers(), opts2P());
		const allCarIds = state.players.flatMap((p) => p.carIds);
		const unique = new Set(allCarIds);
		expect(unique.size).toBe(allCarIds.length);
	});

	it('all cars start at position 0', () => {
		const state = createGame(twoPlayers(), opts2P());
		for (const car of state.cars) {
			expect(car.position).toBe(0);
		}
	});
});

// ─── Determinism via injected RNG ─────────────────────────────────────────────

describe('createGame — determinism with injected RNG', () => {
	it('two calls with the same seed produce identical hands', () => {
		const state1 = createGame(twoPlayers(), opts2P({ rng: seededRng(99) }));
		const state2 = createGame(twoPlayers(), opts2P({ rng: seededRng(99) }));
		expect(state1.cars[0]?.hand).toEqual(state2.cars[0]?.hand);
	});

	it('different seeds produce different hands (overwhelmingly likely)', () => {
		const state1 = createGame(twoPlayers(), opts2P({ rng: seededRng(1) }));
		const state2 = createGame(twoPlayers(), opts2P({ rng: seededRng(2) }));
		expect(state1.cars[0]?.hand).not.toEqual(state2.cars[0]?.hand);
	});
});

// ─── Season carried through createGame ────────────────────────────────────────

describe('createGame — Season', () => {
	it('defaults to a fresh empty 7-Race Season', () => {
		const state = createGame(twoPlayers(), opts2P());
		expect(state.season).toEqual({ totalRaces: 7, races: [] });
	});

	it('carries a passed-in Season through createGame and START_GAME', () => {
		const season = { totalRaces: 7, races: [{ results: [] }] };
		const state = createGame(twoPlayers(), opts2P({ season }));
		expect(state.season).toBe(season);
		const { state: next } = applyAction(state, { type: 'START_GAME' });
		expect(next.season).toBe(season);
	});
});

// ─── Integration with applyAction(START_GAME) ─────────────────────────────────

describe('createGame + applyAction(START_GAME) integration', () => {
	it('applyAction START_GAME transitions to qualifying', () => {
		const state = createGame(twoPlayers(), opts1P());
		const { state: next } = applyAction(state, { type: 'START_GAME' });
		expect(next.phase).toBe('qualifying');
	});

	it('after START_GAME all cars still have 13 cards (draw from deck is a no-op when deck is empty)', () => {
		const state = createGame(twoPlayers(), opts1P());
		const { state: next } = applyAction(state, { type: 'START_GAME' });
		for (const car of next.cars) {
			// deck is empty so drawCards adds nothing; hand size stays 13
			expect(car.hand).toHaveLength(13);
		}
	});

	it('after START_GAME pendingThisRound contains all car IDs', () => {
		const state = createGame(twoPlayers(), opts1P());
		const { state: next } = applyAction(state, { type: 'START_GAME' });
		const carIds = state.cars.map((c) => c.id).sort((a, b) => a - b);
		expect(next.pendingThisRound.sort((a, b) => a - b)).toEqual(carIds);
	});
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('createGame — error handling', () => {
	it('throws when not enough suits are provided for the number of cars', () => {
		expect(() => createGame(twoPlayers(), opts2P({ suits: ['gears', 'fuel'] }))).toThrow();
	});
});
