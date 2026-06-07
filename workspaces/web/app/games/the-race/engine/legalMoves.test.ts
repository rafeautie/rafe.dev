import { describe, it, expect } from 'vitest';
import { canExtendWithCard, carLegalMoves, leaderPos, occupiedPositions } from './legalMoves';
import type { LegalMovesStateShape } from './types';
import type { Card } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reg(value: number): Card {
	return { id: `gears:${value}`, kind: 'regular', value, suit: 'gears' };
}

const redline: Card = { id: 'gears:redline', kind: 'redline', suit: 'gears' };

function minimalState(overrides: Partial<LegalMovesStateShape> = {}): LegalMovesStateShape {
	return {
		cars: [
			{ id: 0, position: 0 },
			{ id: 1, position: 2 }
		],
		pendingThisRound: [0],
		...overrides
	};
}

// ─── leaderPos ────────────────────────────────────────────────────────────────

describe('leaderPos', () => {
	it('returns the highest car position', () => {
		expect(leaderPos(minimalState())).toBe(2);
	});

	it('returns 0 when no cars', () => {
		expect(leaderPos({ cars: [], pendingThisRound: [] })).toBe(0);
	});
});

// ─── occupiedPositions ────────────────────────────────────────────────────────

describe('occupiedPositions', () => {
	it('includes all car positions', () => {
		const occ = occupiedPositions(minimalState());
		expect(occ.has(0)).toBe(true);
		expect(occ.has(2)).toBe(true);
		expect(occ.has(1)).toBe(false);
	});
});

// ─── canExtendWithCard ────────────────────────────────────────────────────────

describe('canExtendWithCard', () => {
	it('returns false for non-extend cards (value > 3)', () => {
		const occ = new Set([0, 2]);
		expect(canExtendWithCard(reg(4), 0, 2, occ)).toBe(false);
		expect(canExtendWithCard(reg(12), 0, 2, occ)).toBe(false);
		expect(canExtendWithCard(redline, 0, 2, occ)).toBe(false);
	});

	it('returns true for extend card (value 1) when target position is empty', () => {
		// car at 0, leader at 2, gap at 1
		const occ = new Set([0, 2]);
		expect(canExtendWithCard(reg(1), 0, 2, occ)).toBe(true);
	});

	it('returns false for extend card (value 1) when target position is occupied', () => {
		// car at 0, car at 1 (occupied)
		const occ = new Set([0, 1, 3]);
		expect(canExtendWithCard(reg(1), 0, 3, occ)).toBe(false);
	});

	it('returns false for extend card (value 2) when target position is occupied', () => {
		const occ = new Set([0, 1]);
		expect(canExtendWithCard(reg(2), 0, 1, occ)).toBe(false);
	});

	// ─── Drafting card (value 3) ──────────────────────────────────────────────

	it('returns true for Drafting card (value 3) when car is NOT the leader and the space ahead is free', () => {
		// car at 0 is not the leader (leader at 2); gap at pos 1 means free space ahead
		const occ = new Set([0, 2]);
		expect(canExtendWithCard(reg(3), 0, 2, occ)).toBe(true);
	});

	it('returns false for Drafting card (value 3) when car IS the leader', () => {
		// car at 2 is the leader
		const occ = new Set([0, 2]);
		expect(canExtendWithCard(reg(3), 2, 2, occ)).toBe(false);
	});

	it('returns false for Drafting card (value 3) when the adjacent position is occupied (must challenge)', () => {
		// car at 1, leader at 3; position 2 is occupied — Drafting cannot draft into it
		const occ = new Set([0, 1, 2, 3]);
		expect(canExtendWithCard(reg(3), 1, 3, occ)).toBe(false);
	});
});

// ─── carLegalMoves ────────────────────────────────────────────────────────────

describe('carLegalMoves', () => {
	it('returns all-false when carId is not in state', () => {
		const state = minimalState();
		const result = carLegalMoves(state, 99, []);
		expect(result.isMyTurn).toBe(false);
		expect(result.challengeRole).toBeNull();
		expect(result.hasCommittedChallenge).toBe(false);
		expect(result.cardCanExtend).toEqual([]);
	});

	it('isMyTurn true for the first car in pendingThisRound', () => {
		const state = minimalState({ pendingThisRound: [0, 1] });
		expect(carLegalMoves(state, 0, []).isMyTurn).toBe(true);
		expect(carLegalMoves(state, 1, []).isMyTurn).toBe(false);
	});

	it('isMyTurn false when pendingThisRound is empty', () => {
		const state = minimalState({ pendingThisRound: [] });
		expect(carLegalMoves(state, 0, []).isMyTurn).toBe(false);
	});

	it('challengeRole is "challenger" when the car is the challenger', () => {
		const state = minimalState({
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		expect(carLegalMoves(state, 0, []).challengeRole).toBe('challenger');
	});

	it('challengeRole is "defender" when the car is the defender', () => {
		const state = minimalState({
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		expect(carLegalMoves(state, 1, []).challengeRole).toBe('defender');
	});

	it('challengeRole is null when no pending challenge concerns the car', () => {
		const state = minimalState({});
		expect(carLegalMoves(state, 0, []).challengeRole).toBeNull();
	});

	it('hasCommittedChallenge true when challenger has committed cards', () => {
		const state = minimalState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCards: [reg(8)]
			}
		});
		expect(carLegalMoves(state, 0, []).hasCommittedChallenge).toBe(true);
	});

	it('hasCommittedChallenge false when challenger has not yet committed', () => {
		const state = minimalState({
			pendingChallenge: { challengerCarId: 0, defenderCarId: 1 }
		});
		expect(carLegalMoves(state, 0, []).hasCommittedChallenge).toBe(false);
	});

	it('hasCommittedChallenge true when defender has committed cards', () => {
		const state = minimalState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				defenderCards: [reg(5)]
			}
		});
		expect(carLegalMoves(state, 1, []).hasCommittedChallenge).toBe(true);
	});

	it('cardCanExtend matches per-card eligibility for the hand', () => {
		// car 0 at pos 0, car 1 at pos 2; gap at pos 1
		// hand: [value-1 (extend, pos+1=1 empty), value-3 drafting (not leader), value-5 (no extend), redline]
		const state = minimalState(); // car 0 pos=0, leader pos=2
		const hand: Card[] = [reg(1), reg(3), reg(5), redline];
		const result = carLegalMoves(state, 0, hand);
		expect(result.cardCanExtend).toEqual([
			true, // value 1: pos+1=1 not occupied
			true, // value 3 (drafting): not leader
			false, // value 5: not an extend card
			false // redline: not an extend card
		]);
	});

	it('Drafting card is NOT eligible for the leader', () => {
		// car 1 is at pos 2 = leader position
		const state = minimalState({ pendingThisRound: [1] });
		const hand: Card[] = [reg(3)]; // Drafting card
		const result = carLegalMoves(state, 1, hand); // car 1 at pos 2 is the leader
		expect(result.cardCanExtend[0]).toBe(false);
	});

	it('regular extend card blocked when position+1 is occupied', () => {
		// car 0 at pos 0, car 1 at pos 1 (pos+1 is occupied)
		const state: LegalMovesStateShape = {
			cars: [
				{ id: 0, position: 0 },
				{ id: 1, position: 1 }
			],
			pendingThisRound: [0]
		};
		const hand: Card[] = [reg(1)];
		const result = carLegalMoves(state, 0, hand);
		expect(result.cardCanExtend[0]).toBe(false);
	});
});
