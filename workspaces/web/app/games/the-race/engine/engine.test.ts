import { describe, it, expect } from 'vitest';
import { applyAction } from './engine';
import { createDeck } from './cards';
import { emptySeason } from './season';
import type { Card, Car, GameState } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCar(id: number, position: number, hand: Card[] = [], deck: Card[] = []): Car {
	// Mirror createGame: the stat counters start at 0 (gridPosition tracks the
	// car's current slot for constructed mid-race states).
	return {
		id,
		position,
		hand,
		deck,
		discard: [],
		overtakes: 0,
		defensesHeld: 0,
		gridPosition: position
	};
}

function makeDeck(...values: number[]): Card[] {
	return values.map(
		(v) => ({ id: `gears:${v}`, kind: 'regular', value: v, suit: 'gears' }) as Card
	);
}

const idAt = (s: GameState, carId: number, idx: number): string =>
	s.cars.find((c) => c.id === carId)!.hand[idx]!.id;

function baseState(overrides: Partial<GameState> = {}): GameState {
	return {
		phase: 'lobby',
		players: [{ id: 'p1', carIds: [0], isHost: true }],
		cars: [makeCar(0, 0)],
		pendingThisRound: [],
		endAfterRound: false,
		challengeWinsThisTurn: 0,
		qualifyingCards: {},
		season: emptySeason(),
		...overrides
	};
}

// ─── applyAction: START_GAME ─────────────────────────────────────────────────

describe('applyAction START_GAME', () => {
	it('transitions from lobby to qualifying', () => {
		const state = baseState({
			phase: 'lobby',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false }
			],
			cars: [makeCar(0, 0), makeCar(1, 0)]
		});
		const { state: next, events } = applyAction(state, { type: 'START_GAME' });
		expect(next.phase).toBe('qualifying');
		expect(events).toEqual([{ type: 'gameStarted' }]);
	});

	it('deals all 13 cards to each car from its deck', () => {
		const deck = createDeck('gears');
		const state = baseState({
			phase: 'lobby',
			players: [{ id: 'p1', carIds: [0], isHost: true }],
			cars: [{ ...makeCar(0, 0), deck: [...deck] }]
		});
		const { state: next } = applyAction(state, { type: 'START_GAME' });
		expect(next.cars[0].hand).toHaveLength(13);
	});

	it('sets pendingThisRound to all car IDs', () => {
		const state = baseState({
			phase: 'lobby',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false }
			],
			cars: [
				{ ...makeCar(0, 0), deck: createDeck('gears') },
				{ ...makeCar(1, 0), deck: createDeck('fuel') }
			]
		});
		const { state: next } = applyAction(state, { type: 'START_GAME' });
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
				{ id: 'p2', carIds: [1], isHost: false }
			],
			cars: [makeCar(0, 0, makeDeck(7, 5, 3)), makeCar(1, 0, makeDeck(10, 2, 8))],
			pendingThisRound: [0, 1]
		});
	}

	it('removes the played card from the car hand', () => {
		const state = qualifyingState();
		const { state: next } = applyAction(state, {
			type: 'QUALIFY',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		expect(next.cars[0].hand).toHaveLength(2);
	});

	it('emits a qualifyingLockedIn event while cars are still to qualify', () => {
		const state = qualifyingState();
		const { events } = applyAction(state, {
			type: 'QUALIFY',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		expect(events).toEqual([{ type: 'qualifyingLockedIn', carId: 0 }]);
	});

	it('records the qualifying card for the car', () => {
		const state = qualifyingState();
		const { state: next } = applyAction(state, {
			type: 'QUALIFY',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		expect(next.qualifyingCards[0]).toHaveLength(1);
		expect(next.qualifyingCards[0][0]).toEqual({
			id: 'gears:7',
			kind: 'regular',
			value: 7,
			suit: 'gears'
		});
	});

	it('removes car from pendingThisRound', () => {
		const state = qualifyingState();
		const { state: next } = applyAction(state, {
			type: 'QUALIFY',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		expect(next.pendingThisRound).not.toContain(0);
	});

	it('assigns starting positions and transitions to race when all cars qualify', () => {
		const state = qualifyingState();
		// car 0 plays value 7, car 1 plays value 10 → car 1 gets pole (pos 1), car 0 gets pos 0
		const { state: after0 } = applyAction(state, {
			type: 'QUALIFY',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		const { state: after1 } = applyAction(after0, {
			type: 'QUALIFY',
			carId: 1,
			cardIds: [idAt(after0, 1, 0)]
		});
		expect(after1.phase).toBe('race');
		const car1 = after1.cars.find((c) => c.id === 1)!;
		const car0 = after1.cars.find((c) => c.id === 0)!;
		expect(car1.position).toBeGreaterThan(car0.position);
	});

	it('emits qualified events in grid order then gridSet when the grid locks in', () => {
		const state = qualifyingState();
		const { state: after0 } = applyAction(state, {
			type: 'QUALIFY',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		const { events } = applyAction(after0, {
			type: 'QUALIFY',
			carId: 1,
			cardIds: [idAt(after0, 1, 0)]
		});
		// car 1 (value 10) takes pole, so it is revealed first; gridSet closes the reveal.
		expect(events.map((e) => e.type)).toEqual(['qualified', 'qualified', 'gridSet']);
		expect(events[0]).toMatchObject({ type: 'qualified', carId: 1 });
		expect(events[1]).toMatchObject({ type: 'qualified', carId: 0 });
	});
});

// ─── applyAction: DISCARD ────────────────────────────────────────────────────

describe('applyAction DISCARD', () => {
	it('moves card from hand to discard pile', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5, 8, 3))],
			pendingThisRound: [0]
		});
		const discarded = { id: 'gears:8', kind: 'regular', value: 8, suit: 'gears' } as const;
		const { state: next, events } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 1)
		});
		expect(next.cars[0].discard).toContainEqual(discarded);
		expect(next.cars[0].hand).toHaveLength(2);
		// The engine reports the played card on the event — no DO peeking needed.
		expect(events).toEqual([{ type: 'discarded', carId: 0, card: discarded }]);
	});

	it('ends the car turn (removes from pendingThisRound)', () => {
		const state = baseState({
			phase: 'race',
			// gap at pos 1 so car 0 has a free space ahead and may discard
			cars: [makeCar(0, 0, makeDeck(5, 8, 3)), makeCar(1, 2, makeDeck(6))],
			pendingThisRound: [0, 1] // both pending so round doesn't immediately reset
		});
		const { state: next } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		expect(next.pendingThisRound).not.toContain(0);
		expect(next.pendingThisRound).toContain(1);
	});

	it('rejects discard from a car that is not at the front of the round queue', () => {
		// car 1 has a free space ahead (gap at pos 3) so its only barrier to
		// discarding is turn order — it is not next to act (car 0 is).
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5)), makeCar(1, 2, makeDeck(6))],
			pendingThisRound: [0, 1]
		});
		expect(() =>
			applyAction(state, { type: 'DISCARD', carId: 1, cardId: idAt(state, 1, 0) })
		).toThrow('Not your turn');
	});

	it('rejects discard when a car is directly ahead (must challenge)', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5, 8)), makeCar(1, 1, makeDeck(6))],
			pendingThisRound: [0, 1]
		});
		expect(() =>
			applyAction(state, { type: 'DISCARD', carId: 0, cardId: idAt(state, 0, 0) })
		).toThrow();
	});

	it('rejects discard while the car is locked into a challenge', () => {
		const state = baseState({
			phase: 'race',
			// defender has a free space ahead but is still mid-challenge
			cars: [makeCar(0, 0, makeDeck(5)), makeCar(1, 1, makeDeck(6, 7)), makeCar(2, 5, makeDeck(8))],
			pendingThisRound: [0, 1, 2],
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		expect(() =>
			applyAction(state, { type: 'DISCARD', carId: 1, cardId: idAt(state, 1, 0) })
		).toThrow();
	});

	it('transitions to results immediately when the leader goes outOfCards', () => {
		const state = baseState({
			phase: 'race',
			cars: [
				makeCar(0, 5, makeDeck(4)), // leader (highest position)
				makeCar(1, 2, makeDeck(6, 7)) // non-leader, still has cards
			],
			pendingThisRound: [0, 1]
		});
		const { state: next } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		expect(next.phase).toBe('results');
		expect(next.pendingThisRound).not.toContain(0);
	});

	it('sets endAfterRound when a non-leader goes outOfCards (current round plays out)', () => {
		const state = baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(5)), // non-leader
				makeCar(1, 3, makeDeck(6, 7)) // leader, still has cards
			],
			pendingThisRound: [0, 1]
		});
		const { state: next } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		expect(next.endAfterRound).toBe(true);
		expect(next.phase).toBe('race');
		expect(next.pendingThisRound).not.toContain(0);
	});
});

// ─── applyAction: EXTEND ─────────────────────────────────────────────────────

describe('applyAction EXTEND', () => {
	it('advances car position by 1 into empty gap', () => {
		// car 0 at pos 0, car 1 at pos 2 — gap at pos 1
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(1)), makeCar(1, 2, makeDeck(2))],
			pendingThisRound: [0]
		});
		const { state: next, events } = applyAction(state, {
			type: 'EXTEND',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		const car0 = next.cars.find((c) => c.id === 0)!;
		expect(car0.position).toBe(1);
		// The extended event carries the new position the engine just computed.
		expect(events).toEqual([
			{
				type: 'extended',
				carId: 0,
				card: { id: 'gears:1', kind: 'regular', value: 1, suit: 'gears' },
				newPosition: 1
			}
		]);
	});

	it('ends car turn after extending', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(1)), makeCar(1, 2, makeDeck(2))],
			pendingThisRound: [0, 1] // both pending so round doesn't immediately reset
		});
		const { state: next } = applyAction(state, {
			type: 'EXTEND',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		expect(next.pendingThisRound).not.toContain(0);
		expect(next.pendingThisRound).toContain(1);
	});

	it('rejects extend from a car that is not at the front of the round queue', () => {
		// car 1 sits at pos 2 with a gap ahead (car 2 at pos 4) and an extend card,
		// so only turn order blocks it — car 0 is next to act, not car 1.
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(5)), makeCar(1, 2, makeDeck(1)), makeCar(2, 4, makeDeck(6))],
			pendingThisRound: [0, 1, 2]
		});
		expect(() =>
			applyAction(state, { type: 'EXTEND', carId: 1, cardId: idAt(state, 1, 0) })
		).toThrow('Not your turn');
	});

	it('prevents the leader from extending with the Drafting card (value 3)', () => {
		// Leader is the car with highest position
		const hand: Card[] = [{ id: 'gears:3', kind: 'regular', value: 3, suit: 'gears' }];
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 5, hand), makeCar(1, 2, makeDeck(6))],
			pendingThisRound: [0]
		});
		expect(() =>
			applyAction(state, { type: 'EXTEND', carId: 0, cardId: idAt(state, 0, 0) })
		).toThrow();
	});

	it('forbids a challenge participant from extending out of the challenge into a gap', () => {
		// Reproduces the gap-challenge bug: defender (car 1, pos 1) is locked into a
		// challenge with car 0, but a gap sits at pos 2 (car 2 is at pos 3). Pre-fix
		// the Drafting card let the defender extend into that gap, leaving the two
		// challenge participants a space apart while still "in a challenge".
		const draft: Card[] = [{ id: 'gears:3', kind: 'regular', value: 3, suit: 'gears' }];
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(8)), makeCar(1, 1, draft), makeCar(2, 3, makeDeck(6))],
			pendingThisRound: [0, 1, 2],
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		expect(() =>
			applyAction(state, { type: 'EXTEND', carId: 1, cardId: idAt(state, 1, 0) })
		).toThrow();
	});
});

// ─── applyAction: COMMIT_CHALLENGE_CARDS ─────────────────────────────────────

describe('applyAction COMMIT_CHALLENGE_CARDS', () => {
	// pendingChallenge pre-set as auto-declaration would produce after round start
	function raceState(): GameState {
		return baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(8, 5)), // challenger at pos 0
				makeCar(1, 1, makeDeck(6, 3)) // defender at pos 1 (directly ahead)
			],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
	}

	it('partial commit: pendingChallenge updated, no resolution yet', () => {
		const state = raceState();
		const { state: after, events } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		expect(after.pendingChallenge?.challengerCards).toBeDefined();
		expect(after.pendingChallenge?.defenderCards).toBeUndefined();
		// No resolution → no event emitted.
		expect(events).toEqual([]);
	});

	it('challenger wins: swaps positions, cancels defender turn', () => {
		const state = raceState();
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		}); // value 8
		const { state: s2 } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		}); // value 6 — challenger wins
		const car0 = s2.cars.find((c) => c.id === 0)!;
		const car1 = s2.cars.find((c) => c.id === 1)!;
		expect(car0.position).toBe(1);
		expect(car1.position).toBe(0);
		expect(s2.pendingThisRound).not.toContain(1); // defender's turn cancelled
	});

	it('challenger loses: no position change, challenger turn ends', () => {
		const state = raceState();
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 1)]
		}); // value 5
		const { state: s2 } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		}); // value 6 — defender wins
		const car0 = s2.cars.find((c) => c.id === 0)!;
		const car1 = s2.cars.find((c) => c.id === 1)!;
		expect(car0.position).toBe(0);
		expect(car1.position).toBe(1);
		expect(s2.pendingThisRound).not.toContain(0);
		expect(s2.pendingThisRound).toContain(1);
	});

	it('tie: no position change, challenger turn ends', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(6, 4)), makeCar(1, 1, makeDeck(6, 5))],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		const { state: s2 } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		});
		expect(s2.pendingThisRound).not.toContain(0);
		expect(s2.pendingThisRound).toContain(1);
	});

	it('emits a challengeResolved event only once both sides commit', () => {
		const state = raceState();
		const first = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		}); // value 8 — partial commit, no event yet
		expect(first.events).toEqual([]);
		const second = applyAction(first.state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(first.state, 1, 0)]
		}); // value 6 — challenger wins
		expect(second.events).toHaveLength(1);
		expect(second.events[0]).toMatchObject({
			type: 'challengeResolved',
			challengerCarId: 0,
			defenderCarId: 1,
			outcome: 'challenger'
		});
	});

	it('the challengeResolved event carries both committed hands', () => {
		const state = raceState();
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		const { events } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		});
		const resolved = events[0]!;
		expect(resolved.type).toBe('challengeResolved');
		if (resolved.type === 'challengeResolved') {
			expect(resolved.challengerCards).toHaveLength(1);
			expect(resolved.defenderCards).toHaveLength(1);
		}
	});

	it('enforces 2-win limit: challenger turn ends after 2 wins', () => {
		const state = baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(10, 10, 10)), // challenger
				makeCar(1, 1, makeDeck(3, 3)), // first victim
				makeCar(2, 2, makeDeck(3)) // second victim
			],
			pendingThisRound: [0, 1, 2],
			challengeWinsThisTurn: 0,
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});

		// Win 1: car0 (10) beats car1 (3)
		let s = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		}).state;
		s = applyAction(s, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s, 1, 0)]
		}).state;
		expect(s.challengeWinsThisTurn).toBe(1);
		// Auto-declaration chained: car0 now at pos 1, car2 at pos 2
		expect(s.pendingChallenge?.challengerCarId).toBe(0);
		expect(s.pendingChallenge?.defenderCarId).toBe(2);

		// Win 2: car0 (10) beats car2 (3)
		s = applyAction(s, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(s, 0, 1)]
		}).state;
		s = applyAction(s, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 2,
			cardIds: [idAt(s, 2, 0)]
		}).state;
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
				makeCar(1, 1, makeDeck(3)) // defender with 1 card
			],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		const { state: s2 } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		});
		expect(s2.endAfterRound).toBe(true);
	});
});

// ─── round advancement ────────────────────────────────────────────────────────

describe('round advancement', () => {
	it('resets pendingThisRound to all car IDs when round ends', () => {
		const state = baseState({
			phase: 'race',
			// Both cars have 2 cards in hand — won't go outOfCards after 1 discard.
			// gap at pos 1 so car 0 has a free space ahead and may discard.
			cars: [makeCar(0, 0, makeDeck(5, 6)), makeCar(1, 2, makeDeck(7, 8))],
			pendingThisRound: [0] // only car 0 left this round
		});
		const { state: next } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		// pendingThisRound was [0], after car 0 acts → empty → new round starts with all cars
		expect(next.pendingThisRound.sort()).toEqual([0, 1]);
	});

	it('transitions to results when endAfterRound is true and round ends', () => {
		const state = baseState({
			phase: 'race',
			// gap at pos 1 so car 0 has a free space ahead and may discard
			cars: [makeCar(0, 0, makeDeck(5)), makeCar(1, 2, makeDeck(6))],
			pendingThisRound: [0], // last car to act
			endAfterRound: true
		});
		const { state: next } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		expect(next.phase).toBe('results');
	});

	it('draws from deck when a new round starts after hand is exhausted', () => {
		// Car 0 has 1 hand card and 3 deck cards; car 1 has already acted.
		// After car 0 plays its last hand card, a new round starts and car 0 should draw from deck.
		const state = baseState({
			phase: 'race',
			cars: [
				{ ...makeCar(0, 0, makeDeck(5)), deck: makeDeck(10, 11, 12) },
				makeCar(1, 2, makeDeck(7, 8)) // gap at pos 1 so car 0 may discard
			],
			pendingThisRound: [0]
		});
		const { state: next } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		// Round ends and new round starts; car 0 should have drawn from its deck
		expect(next.phase).toBe('race');
		const car0 = next.cars.find((c) => c.id === 0)!;
		expect(car0.hand.length).toBeGreaterThan(0);
		expect(next.pendingThisRound).toContain(0);
	});

	it('does NOT restart the round when the last car plays its last card (deck also empty)', () => {
		// Car 0 plays its truly last card (hand=1, deck=0), non-leader → endAfterRound
		// Car 1 still has cards and acts last in the round
		const state = baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(5)), // non-leader, 1 card, empty deck
				makeCar(1, 2, makeDeck(7, 8)) // leader, still has cards
			],
			pendingThisRound: [0, 1]
		});
		const { state: afterCar0 } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		expect(afterCar0.endAfterRound).toBe(true);

		const { state: afterCar1 } = applyAction(afterCar0, {
			type: 'DISCARD',
			carId: 1,
			cardId: idAt(afterCar0, 1, 0)
		});
		expect(afterCar1.phase).toBe('results');
	});
});

// ─── race stats accumulation ──────────────────────────────────────────────────

describe('race stats accumulation', () => {
	const carIn = (s: GameState, id: number): Car => s.cars.find((c) => c.id === id)!;

	function challengeState(): GameState {
		return baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(8, 5)), // challenger at pos 0
				makeCar(1, 1, makeDeck(6, 6)) // defender at pos 1 (directly ahead)
			],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
	}

	it('records an overtake for the challenger on a won challenge', () => {
		const state = challengeState();
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		}); // value 8
		const { state: s2 } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		}); // value 6 — challenger wins
		expect(carIn(s2, 0).overtakes).toBe(1);
		expect(carIn(s2, 1).defensesHeld).toBe(0);
	});

	it('records a held defense for the defender on a defender win', () => {
		const state = challengeState();
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 1)]
		}); // value 5
		const { state: s2 } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		}); // value 6 — defender wins
		expect(carIn(s2, 1).defensesHeld).toBe(1);
		expect(carIn(s2, 0).overtakes).toBe(0);
	});

	it('counts a tie as a held defense', () => {
		const state = baseState({
			phase: 'race',
			cars: [makeCar(0, 0, makeDeck(6, 4)), makeCar(1, 1, makeDeck(6, 5))],
			pendingThisRound: [0, 1],
			challengeWinsThisTurn: 0,
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		const { state: s1 } = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		}); // value 6
		const { state: s2 } = applyAction(s1, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s1, 1, 0)]
		}); // value 6 — tie
		expect(carIn(s2, 1).defensesHeld).toBe(1);
		expect(carIn(s2, 0).overtakes).toBe(0);
	});

	it('counts a double-win turn as two overtakes', () => {
		const state = baseState({
			phase: 'race',
			cars: [
				makeCar(0, 0, makeDeck(10, 10, 10)), // challenger
				makeCar(1, 1, makeDeck(3, 3)), // first victim
				makeCar(2, 2, makeDeck(3)) // second victim
			],
			pendingThisRound: [0, 1, 2],
			challengeWinsThisTurn: 0,
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		let s = applyAction(state, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		}).state;
		s = applyAction(s, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 1,
			cardIds: [idAt(s, 1, 0)]
		}).state;
		s = applyAction(s, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 0,
			cardIds: [idAt(s, 0, 1)]
		}).state;
		s = applyAction(s, {
			type: 'COMMIT_CHALLENGE_CARDS',
			carId: 2,
			cardIds: [idAt(s, 2, 0)]
		}).state;
		expect(carIn(s, 0).overtakes).toBe(2);
	});

	it('snapshots each car gridPosition when the grid locks in', () => {
		const state = baseState({
			phase: 'qualifying',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false }
			],
			cars: [makeCar(0, 0, makeDeck(7, 5, 3)), makeCar(1, 0, makeDeck(10, 2, 8))],
			pendingThisRound: [0, 1]
		});
		const { state: a0 } = applyAction(state, {
			type: 'QUALIFY',
			carId: 0,
			cardIds: [idAt(state, 0, 0)]
		});
		const { state: a1 } = applyAction(a0, { type: 'QUALIFY', carId: 1, cardIds: [idAt(a0, 1, 0)] });
		expect(a1.phase).toBe('race');
		for (const car of a1.cars) {
			expect(car.gridPosition).toBe(car.position);
		}
	});
});

// ─── applyAction: PLAY_AGAIN ─────────────────────────────────────────────────

describe('Season accrual (ADR 0005)', () => {
	it('appends one RaceResult of fact-table rows when a Race ends', () => {
		const state = baseState({
			phase: 'race',
			cars: [
				{ ...makeCar(0, 5, makeDeck(4)), overtakes: 2, defensesHeld: 1, gridPosition: 3 },
				makeCar(1, 2, makeDeck(6, 7))
			],
			pendingThisRound: [0, 1]
		});
		const { state: next } = applyAction(state, {
			type: 'DISCARD',
			carId: 0,
			cardId: idAt(state, 0, 0)
		});
		expect(next.phase).toBe('results');
		expect(next.season.races).toHaveLength(1);
		expect(next.season.races[0]!.results).toEqual([
			{ carId: 0, rank: 1, points: 9, gridPosition: 3, overtakes: 2, defensesHeld: 1 },
			{ carId: 1, rank: 2, points: 6, gridPosition: 2, overtakes: 0, defensesHeld: 0 }
		]);
	});

	it('PLAY_AGAIN clears the Season back to empty', () => {
		const state = baseState({
			phase: 'results',
			season: { totalRaces: 7, races: [{ results: [] }] }
		});
		const { state: next } = applyAction(state, { type: 'PLAY_AGAIN' });
		expect(next.season).toEqual({ totalRaces: 7, races: [] });
	});
});

describe('applyAction PLAY_AGAIN', () => {
	it('resets to lobby phase keeping same players', () => {
		const state = baseState({
			phase: 'results',
			players: [
				{ id: 'p1', carIds: [0], isHost: true },
				{ id: 'p2', carIds: [1], isHost: false }
			]
		});
		const { state: next } = applyAction(state, { type: 'PLAY_AGAIN' });
		expect(next.phase).toBe('lobby');
		expect(next.players.map((p) => p.id)).toEqual(['p1', 'p2']);
	});

	it('clears cars, decks, and round state on PLAY_AGAIN', () => {
		const state = baseState({ phase: 'results' });
		const { state: next } = applyAction(state, { type: 'PLAY_AGAIN' });
		expect(next.cars).toHaveLength(0);
		expect(next.endAfterRound).toBe(false);
		expect(next.pendingThisRound).toHaveLength(0);
	});
});
