import { describe, it, expect } from 'vitest';
import {
	createDeck,
	shuffleDeck,
	effectiveValue,
	resolveChallenge,
	buildStartingGrid,
	computeScores,
	applyAction,
} from './engine';
import type { Card, Car, GameState } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCar(id: number, position: number, hand: Card[] = [], deck: Card[] = []): Car {
	return { id, position, hand, deck, discard: [] };
}

function makeDeck(...values: number[]): Card[] {
	return values.map((v) => ({ kind: 'regular', value: v }) as Card);
}

function baseState(overrides: Partial<GameState> = {}): GameState {
	return {
		phase: 'lobby',
		players: [{ id: 'p1', carIds: [0], isHost: true }],
		cars: [makeCar(0, 0)],
		pendingThisRound: [],
		endAfterRound: false,
		challengeWinsThisTurn: 0,
		qualifyingCards: {},
		...overrides,
	};
}

// ─── createDeck ──────────────────────────────────────────────────────────────

describe('createDeck', () => {
	it('returns 13 cards for a suit', () => {
		const deck = createDeck('spades');
		expect(deck).toHaveLength(13);
	});

	it('contains 12 regular cards (values 1–12)', () => {
		const deck = createDeck('spades');
		const regulars = deck.filter((c) => c.kind === 'regular') as Extract<Card, { kind: 'regular' }>[];
		expect(regulars).toHaveLength(12);
		expect(regulars.map((c) => c.value).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});

	it('contains exactly 1 Redline card', () => {
		const deck = createDeck('spades');
		const redlines = deck.filter((c) => c.kind === 'redline');
		expect(redlines).toHaveLength(1);
	});
});

// ─── shuffleDeck ─────────────────────────────────────────────────────────────

describe('shuffleDeck', () => {
	it('returns a deck with the same cards', () => {
		const deck = createDeck('hearts');
		const shuffled = shuffleDeck([...deck]);
		expect(shuffled).toHaveLength(deck.length);
		expect(shuffled).toEqual(expect.arrayContaining(deck));
	});

	it('does not mutate the original deck', () => {
		const deck = createDeck('hearts');
		const copy = [...deck];
		shuffleDeck(deck);
		expect(deck).toEqual(copy);
	});
});

// ─── effectiveValue ───────────────────────────────────────────────────────────

describe('effectiveValue', () => {
	it('returns the value of a regular card', () => {
		expect(effectiveValue({ kind: 'regular', value: 7 })).toBe(7);
	});

	it('returns 0 for a Redline card played alone', () => {
		expect(effectiveValue({ kind: 'redline' })).toBe(0);
	});

	it('returns 2 for a Redline card played alongside another card', () => {
		expect(effectiveValue({ kind: 'redline' }, true)).toBe(2);
	});
});

// ─── resolveChallenge ────────────────────────────────────────────────────────

describe('resolveChallenge', () => {
	it('challenger wins when their card is higher', () => {
		const result = resolveChallenge({ kind: 'regular', value: 8 }, { kind: 'regular', value: 5 });
		expect(result).toBe('challenger');
	});

	it('defender wins when their card is higher', () => {
		const result = resolveChallenge({ kind: 'regular', value: 4 }, { kind: 'regular', value: 9 });
		expect(result).toBe('defender');
	});

	it('ties when both cards are equal', () => {
		const result = resolveChallenge({ kind: 'regular', value: 6 }, { kind: 'regular', value: 6 });
		expect(result).toBe('tie');
	});

	it('applies challenger modifier (Redline bonus)', () => {
		// challenger plays 5 + Redline (5+2=7) vs defender 6 → challenger wins
		const result = resolveChallenge({ kind: 'regular', value: 5 }, { kind: 'regular', value: 6 }, 2);
		expect(result).toBe('challenger');
	});

	it('applies defender modifier (Redline bonus)', () => {
		// challenger 8 vs defender 7 + Redline (7+2=9) → defender wins
		const result = resolveChallenge({ kind: 'regular', value: 8 }, { kind: 'regular', value: 7 }, 0, 2);
		expect(result).toBe('defender');
	});
});

// ─── buildStartingGrid ───────────────────────────────────────────────────────

describe('buildStartingGrid', () => {
	it('returns consecutive positions 0..N-1 for N cars', () => {
		expect(buildStartingGrid(6)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('works for 1 car', () => {
		expect(buildStartingGrid(1)).toEqual([0]);
	});
});

// ─── computeScores ───────────────────────────────────────────────────────────

describe('computeScores', () => {
	it('awards 9/6/4/3/2/1 points for positions 1–6', () => {
		const cars = [
			makeCar(0, 5), // 1st place (highest position)
			makeCar(1, 4),
			makeCar(2, 3),
			makeCar(3, 2),
			makeCar(4, 1),
			makeCar(5, 0), // 6th place (lowest position)
		];
		const scores = computeScores(cars);
		expect(scores.find((s) => s.carId === 0)?.points).toBe(9);
		expect(scores.find((s) => s.carId === 1)?.points).toBe(6);
		expect(scores.find((s) => s.carId === 2)?.points).toBe(4);
		expect(scores.find((s) => s.carId === 3)?.points).toBe(3);
		expect(scores.find((s) => s.carId === 4)?.points).toBe(2);
		expect(scores.find((s) => s.carId === 5)?.points).toBe(1);
	});

	it('scores car in 1st as rank 1', () => {
		const cars = [makeCar(0, 10), makeCar(1, 5)];
		const scores = computeScores(cars);
		expect(scores.find((s) => s.carId === 0)?.rank).toBe(1);
		expect(scores.find((s) => s.carId === 1)?.rank).toBe(2);
	});
});

// ─── applyAction: START_GAME ─────────────────────────────────────────────────

describe('applyAction START_GAME', () => {
	it('transitions from lobby to qualifying', () => {
		const state = baseState({
			phase: 'lobby',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false },
			],
			cars: [makeCar(0, 0), makeCar(1, 0)],
		});
		const next = applyAction(state, { type: 'START_GAME' });
		expect(next.phase).toBe('qualifying');
	});

	it('deals 5 cards to each car from its deck', () => {
		const deck = createDeck('spades');
		const state = baseState({
			phase: 'lobby',
			players: [{ id: 'p1', carIds: [0], isHost: true }],
			cars: [{ ...makeCar(0, 0), deck: [...deck] }],
		});
		const next = applyAction(state, { type: 'START_GAME' });
		expect(next.cars[0].hand).toHaveLength(5);
	});

	it('sets pendingThisRound to all car IDs', () => {
		const state = baseState({
			phase: 'lobby',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false },
			],
			cars: [
				{ ...makeCar(0, 0), deck: createDeck('spades') },
				{ ...makeCar(1, 0), deck: createDeck('hearts') },
			],
		});
		const next = applyAction(state, { type: 'START_GAME' });
		expect(next.pendingThisRound.sort()).toEqual([0, 1]);
	});
});

// ─── applyAction: QUALIFY ────────────────────────────────────────────────────

describe('applyAction QUALIFY', () => {
	function qualifyingState(): GameState {
		return baseState({
			phase: 'qualifying',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false },
			],
			cars: [
				makeCar(0, 0, makeDeck(7, 5, 3)),
				makeCar(1, 0, makeDeck(10, 2, 8)),
			],
			pendingThisRound: [0, 1],
		});
	}

	it('removes the played card from the car hand', () => {
		const state = qualifyingState();
		const next = applyAction(state, { type: 'QUALIFY', carId: 0, cardIndices: [0] });
		expect(next.cars[0].hand).toHaveLength(2);
	});

	it('records the qualifying card for the car', () => {
		const state = qualifyingState();
		const next = applyAction(state, { type: 'QUALIFY', carId: 0, cardIndices: [0] });
		expect(next.qualifyingCards[0]).toHaveLength(1);
		expect(next.qualifyingCards[0][0]).toEqual({ kind: 'regular', value: 7 });
	});

	it('removes car from pendingThisRound', () => {
		const state = qualifyingState();
		const next = applyAction(state, { type: 'QUALIFY', carId: 0, cardIndices: [0] });
		expect(next.pendingThisRound).not.toContain(0);
	});

	it('assigns starting positions and transitions to race when all cars qualify', () => {
		const state = qualifyingState();
		// car 0 plays value 7, car 1 plays value 10 → car 1 gets pole (pos 1), car 0 gets pos 0
		const after0 = applyAction(state, { type: 'QUALIFY', carId: 0, cardIndices: [0] });
		const after1 = applyAction(after0, { type: 'QUALIFY', carId: 1, cardIndices: [0] });
		expect(after1.phase).toBe('race');
		const car1 = after1.cars.find((c) => c.id === 1)!;
		const car0 = after1.cars.find((c) => c.id === 0)!;
		expect(car1.position).toBeGreaterThan(car0.position);
	});
});

// ─── applyAction: DISCARD ────────────────────────────────────────────────────

describe('applyAction DISCARD', () => {
	it('moves card from hand to discard pile', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5, 8, 3))],
			pendingThisRound: [0],
		});
		const next = applyAction(state, { type: 'DISCARD', carId: 0, cardIndex: 1 });
		expect(next.cars[0].discard).toContainEqual({ kind: 'regular', value: 8 });
		expect(next.cars[0].hand).toHaveLength(2);
	});

	it('ends the car turn (removes from pendingThisRound)', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5, 8, 3)), makeCar(1, 1, makeDeck(6))],
			pendingThisRound: [0, 1], // both pending so round doesn't immediately reset
		});
		const next = applyAction(state, { type: 'DISCARD', carId: 0, cardIndex: 0 });
		expect(next.pendingThisRound).not.toContain(0);
		expect(next.pendingThisRound).toContain(1);
	});

	it('sets endAfterRound and removes from pendingThisRound when car goes outOfCards', () => {
		// Car has 1 card left and no deck
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5), [])],
			pendingThisRound: [0, 1],
		});
		const next = applyAction(state, { type: 'DISCARD', carId: 0, cardIndex: 0 });
		expect(next.endAfterRound).toBe(true);
		expect(next.pendingThisRound).not.toContain(0);
	});
});

// ─── applyAction: EXTEND ─────────────────────────────────────────────────────

describe('applyAction EXTEND', () => {
	it('advances car position by 1 into empty gap', () => {
		// car 0 at pos 0, car 1 at pos 2 — gap at pos 1
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5)), makeCar(1, 2, makeDeck(6))],
			pendingThisRound: [0],
		});
		const next = applyAction(state, { type: 'EXTEND', carId: 0, cardIndex: 0 });
		const car0 = next.cars.find((c) => c.id === 0)!;
		expect(car0.position).toBe(1);
	});

	it('ends car turn after extending', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5)), makeCar(1, 2, makeDeck(6))],
			pendingThisRound: [0, 1], // both pending so round doesn't immediately reset
		});
		const next = applyAction(state, { type: 'EXTEND', carId: 0, cardIndex: 0 });
		expect(next.pendingThisRound).not.toContain(0);
		expect(next.pendingThisRound).toContain(1);
	});

	it('prevents the leader from extending with the Drafting card (value 3)', () => {
		// Leader is the car with highest position
		const hand: Card[] = [{ kind: 'regular', value: 3 }];
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 5, hand), makeCar(1, 2, makeDeck(6))],
			pendingThisRound: [0],
		});
		expect(() => applyAction(state, { type: 'EXTEND', carId: 0, cardIndex: 0 })).toThrow();
	});
});

// ─── applyAction: CHALLENGE / DEFEND ─────────────────────────────────────────

describe('applyAction CHALLENGE + DEFEND', () => {
	function raceState(): GameState {
		return baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(8, 5)), // challenger
				makeCar(1, 1, makeDeck(6, 3)), // defender (ahead)
			],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
		});
	}

	it('sets pendingChallenge after CHALLENGE action', () => {
		const state = raceState();
		const next = applyAction(state, {
			type: 'CHALLENGE',
			carId: 0,
			cardIndices: [0],
			defenderCarId: 1,
		});
		expect(next.pendingChallenge).toBeDefined();
		expect(next.pendingChallenge?.challengerCarId).toBe(0);
		expect(next.pendingChallenge?.defenderCarId).toBe(1);
	});

	it('challenger wins: swaps positions, cancels defender turn', () => {
		const state = raceState(); // car0 at 0, car1 at 1
		const afterChallenge = applyAction(state, {
			type: 'CHALLENGE',
			carId: 0,
			cardIndices: [0], // value 8
			defenderCarId: 1,
		});
		const afterDefend = applyAction(afterChallenge, {
			type: 'DEFEND',
			carId: 1,
			cardIndices: [0], // value 6 — challenger wins
		});
		const car0 = afterDefend.cars.find((c) => c.id === 0)!;
		const car1 = afterDefend.cars.find((c) => c.id === 1)!;
		expect(car0.position).toBe(1); // moved ahead
		expect(car1.position).toBe(0); // pushed back
		expect(afterDefend.pendingThisRound).not.toContain(1); // defender's turn cancelled
	});

	it('challenger loses: no position change, challenger turn ends', () => {
		const state = raceState();
		const afterChallenge = applyAction(state, {
			type: 'CHALLENGE',
			carId: 0,
			cardIndices: [1], // value 5
			defenderCarId: 1,
		});
		const afterDefend = applyAction(afterChallenge, {
			type: 'DEFEND',
			carId: 1,
			cardIndices: [0], // value 6 — defender wins
		});
		const car0 = afterDefend.cars.find((c) => c.id === 0)!;
		const car1 = afterDefend.cars.find((c) => c.id === 1)!;
		expect(car0.position).toBe(0);
		expect(car1.position).toBe(1);
		expect(afterDefend.pendingThisRound).not.toContain(0); // challenger's turn ends
		expect(afterDefend.pendingThisRound).toContain(1); // defender keeps their turn
	});

	it('tie: no position change, challenger turn ends', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(6)), makeCar(1, 1, makeDeck(6))],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
		});
		const afterChallenge = applyAction(state, {
			type: 'CHALLENGE',
			carId: 0,
			cardIndices: [0],
			defenderCarId: 1,
		});
		const afterDefend = applyAction(afterChallenge, {
			type: 'DEFEND',
			carId: 1,
			cardIndices: [0],
		});
		expect(afterDefend.pendingThisRound).not.toContain(0);
		expect(afterDefend.pendingThisRound).toContain(1);
	});

	it('enforces 2-win limit: challenger turn ends after 2 wins', () => {
		const state = baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(10, 10, 10)), // challenger
				makeCar(1, 1, makeDeck(3, 3)),        // first victim
				makeCar(2, 2, makeDeck(3)),            // second victim
			],
			pendingThisRound: [0, 1, 2],
			challengeWinsThisTurn: 0,
		});

		// Win 1
		let s = applyAction(state, { type: 'CHALLENGE', carId: 0, cardIndices: [0], defenderCarId: 1 });
		s = applyAction(s, { type: 'DEFEND', carId: 1, cardIndices: [0] });
		expect(s.challengeWinsThisTurn).toBe(1);

		// Win 2 — challenger now at pos 1, car2 at pos 2
		s = applyAction(s, { type: 'CHALLENGE', carId: 0, cardIndices: [1], defenderCarId: 2 });
		s = applyAction(s, { type: 'DEFEND', carId: 2, cardIndices: [0] });
		expect(s.pendingThisRound).not.toContain(0); // turn ends after 2nd win
	});
});

// ─── outOfCards as defender ───────────────────────────────────────────────────

describe('outOfCards as defender', () => {
	it('sets endAfterRound when defender goes outOfCards after losing', () => {
		const state = baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(10)), // challenger
				makeCar(1, 1, makeDeck(3)),  // defender with 1 card
			],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
		});
		const s1 = applyAction(state, { type: 'CHALLENGE', carId: 0, cardIndices: [0], defenderCarId: 1 });
		const s2 = applyAction(s1, { type: 'DEFEND', carId: 1, cardIndices: [0] });
		// Defender lost, their last card used → outOfCards → endAfterRound
		expect(s2.endAfterRound).toBe(true);
	});
});

// ─── round advancement ────────────────────────────────────────────────────────

describe('round advancement', () => {
	it('resets pendingThisRound to all car IDs when round ends', () => {
		const state = baseState({
			phase: 'race',
			// Both cars have 2 cards in hand — won't go outOfCards after 1 discard
			cars: [makeCar(0, 0, makeDeck(5, 6)), makeCar(1, 1, makeDeck(7, 8))],
			pendingThisRound: [0], // only car 0 left this round
		});
		const next = applyAction(state, { type: 'DISCARD', carId: 0, cardIndex: 0 });
		// pendingThisRound was [0], after car 0 acts → empty → new round starts with all cars
		expect(next.pendingThisRound.sort()).toEqual([0, 1]);
	});

	it('transitions to results when endAfterRound is true and round ends', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5)), makeCar(1, 1, makeDeck(6))],
			pendingThisRound: [0], // last car to act
			endAfterRound: true,
		});
		const next = applyAction(state, { type: 'DISCARD', carId: 0, cardIndex: 0 });
		expect(next.phase).toBe('results');
	});
});

// ─── applyAction: PLAY_AGAIN ─────────────────────────────────────────────────

describe('applyAction PLAY_AGAIN', () => {
	it('resets to lobby phase keeping same players', () => {
		const state = baseState({
			phase: 'results',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false },
			],
		});
		const next = applyAction(state, { type: 'PLAY_AGAIN' });
		expect(next.phase).toBe('lobby');
		expect(next.players.map((p) => p.id)).toEqual(['p1', 'p2']);
	});

	it('clears cars, decks, and round state on PLAY_AGAIN', () => {
		const state = baseState({ phase: 'results' });
		const next = applyAction(state, { type: 'PLAY_AGAIN' });
		expect(next.cars).toHaveLength(0);
		expect(next.endAfterRound).toBe(false);
		expect(next.pendingThisRound).toHaveLength(0);
	});
});
