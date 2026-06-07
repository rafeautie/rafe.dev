import { describe, it, expect } from 'vitest';
import { buildHold, GRID_REVEAL_STAGGER_MS } from './useRacePresentation';
import type { Card, PublicGameState } from '../engine/types';

const card = (value: number): Card => ({ id: `gears:${value}`, kind: 'regular', value, suit: 'gears' });

// A state that has already advanced to results — the shape the server sends on the
// game-ending action, alongside that action's reveal event.
function resultsState(overrides: Partial<PublicGameState> = {}): PublicGameState {
	return {
		phase: 'results',
		players: [],
		cars: [],
		pendingThisRound: [],
		endAfterRound: true,
		challengeWinsThisTurn: 0,
		qualifiedCarIds: [],
		finalScores: [{ carId: 0, rank: 1, points: 9 }],
		log: [],
		...overrides
	};
}

describe('buildHold — the final turn animates before results', () => {
	it('keeps a challengeResolved reveal in the race phase even when the game has ended', () => {
		const hold = buildHold(resultsState(), {
			type: 'challengeResolved',
			challengerCarId: 0,
			defenderCarId: 1,
			challengerCards: [card(8)],
			defenderCards: [card(6)],
			outcome: 'challenger'
		});
		expect(hold.frame.phase).toBe('race');
		expect(hold.frame.pendingChallenge?.challengerCarId).toBe(0);
		expect(hold.frame.pendingChallenge?.defenderCommitted).toBe(true);
	});

	it('keeps a discard reveal in the race phase even when the game has ended', () => {
		const hold = buildHold(resultsState(), { type: 'discarded', carId: 2, card: card(5) });
		expect(hold.frame.phase).toBe('race');
		expect(hold.frame.pendingChallenge).toBeUndefined();
		expect(hold.reveal?.cards[2]).toEqual([card(5)]);
	});

	it('keeps an extend reveal in the race phase even when the game has ended', () => {
		const hold = buildHold(resultsState(), {
			type: 'extended',
			carId: 3,
			card: card(2),
			newPosition: 5
		});
		expect(hold.frame.phase).toBe('race');
		expect(hold.reveal?.cards[3]).toEqual([card(2)]);
	});
});

describe('buildHold — the grid-set beat settles before the first highlight', () => {
	it('clears the round focus so the cars settle onto the grid before the first turn lights up', () => {
		const hold = buildHold(
			resultsState({
				phase: 'race',
				pendingThisRound: [0, 1],
				pendingChallenge: {
					challengerCarId: 0,
					defenderCarId: 1,
					challengerCommitted: false,
					defenderCommitted: false
				}
			}),
			{ type: 'gridSet' }
		);
		// Live grid positions are kept (so the cars animate onto the grid), but the
		// focus inputs are cleared so no tiles are highlighted during the hold.
		expect(hold.frame.phase).toBe('race');
		expect(hold.frame.pendingThisRound).toEqual([]);
		expect(hold.frame.pendingChallenge).toBeUndefined();
		expect(hold.reveal).toBeNull();
		// Flags the staggered grid reveal so the track brings cars in one at a time.
		expect(hold.gridReveal).toBe(true);
	});

	it('lengthens the grid-set hold to cover the per-car stagger', () => {
		const cars = [0, 1, 2, 3].map((id) => ({
			id,
			position: id,
			handSize: 0,
			liveryId: 0,
			teamId: 0,
			overtakes: 0,
			defensesHeld: 0,
			gridPosition: id
		}));
		const hold = buildHold(resultsState({ phase: 'race', cars }), { type: 'gridSet' });
		// Four cars stagger across three gaps, so the hold runs longer than the
		// single-car-reveal default to let the last car settle before releasing.
		expect(hold.holdMs).toBeGreaterThan(3 * GRID_REVEAL_STAGGER_MS);
	});

	it('does not stagger non-grid reveals', () => {
		const hold = buildHold(resultsState(), { type: 'discarded', carId: 2, card: card(5) });
		expect(hold.gridReveal).toBe(false);
	});
});
