import type { Card, CarLegalMoves, ChallengeRole, LegalMovesStateShape } from './types';
import { isExtendCard, isDraftingCard } from './cards';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Returns the highest position among all cars in the state. */
export function leaderPos(state: LegalMovesStateShape): number {
	if (state.cars.length === 0) return 0;
	return Math.max(...state.cars.map((c) => c.position));
}

/** Returns the set of all occupied positions. */
export function occupiedPositions(state: LegalMovesStateShape): Set<number> {
	return new Set(state.cars.map((c) => c.position));
}

// ─── Shared extend predicate ──────────────────────────────────────────────────
//
// This is the SINGLE definition of the extend-eligibility rule. Both
// carLegalMoves (client preview) and applyAction EXTEND (server enforcer) must
// use this predicate so the rule lives in exactly one place.
//
// Rules mirrored from applyAction EXTEND:
//   1. Only cards with value 1–3 (isExtendCard) are eligible.
//   2. Extending requires a free space directly ahead: position+1 must be
//      unoccupied. When position+1 is occupied the car has no solo turn — it
//      MUST challenge and can neither extend nor discard. This applies to every
//      extend card, the Drafting card included: there is no "drafting" into an
//      occupied slot.
//   3. The Drafting card (value 3) additionally cannot be used by the leader,
//      who has no car ahead to draft off of.

/**
 * Returns whether a card may legally be used for the EXTEND action by a car
 * at `carPos`, given the current leader position and the set of occupied
 * positions.
 *
 * This is the canonical extend predicate — shared by both carLegalMoves
 * (client preview) and the EXTEND branch in applyAction (server enforcement).
 */
export function canExtendWithCard(
	card: Card,
	carPos: number,
	leaderPosition: number,
	occupied: Set<number>
): boolean {
	if (!isExtendCard(card)) return false;
	// A car may only extend into a free space directly ahead. If position+1 is
	// occupied the car must challenge instead — extending is not allowed for any
	// extend card, including the Drafting card.
	if (occupied.has(carPos + 1)) return false;
	// The Drafting card (value 3) additionally cannot be used by the leader.
	if (isDraftingCard(card)) return carPos !== leaderPosition;
	return true;
}

// ─── Legal-moves advertisement ────────────────────────────────────────────────

/**
 * Returns the legal-move advertisement for a specific car, given the current
 * state and the car's own hand (only the viewer's cars have a full hand;
 * opponents pass an empty array or the PublicCarState hand).
 *
 * Works with both GameState and PublicGameState — accepts a minimal shape.
 */
export function carLegalMoves(
	state: LegalMovesStateShape,
	carId: number,
	hand: Card[]
): CarLegalMoves {
	const car = state.cars.find((c) => c.id === carId);
	if (!car) {
		return {
			isMyTurn: false,
			challengeRole: null,
			hasCommittedChallenge: false,
			cardCanExtend: []
		};
	}

	const isMyTurn = state.pendingThisRound.length > 0 && state.pendingThisRound[0] === carId;

	const pc = state.pendingChallenge;
	const challengeRole: ChallengeRole =
		pc?.challengerCarId === carId ? 'challenger' : pc?.defenderCarId === carId ? 'defender' : null;

	const hasCommittedChallenge =
		(challengeRole === 'challenger' && pc?.challengerCards !== undefined) ||
		(challengeRole === 'defender' && pc?.defenderCards !== undefined);

	const lp = leaderPos(state);
	const occ = occupiedPositions(state);
	const cardCanExtend = hand.map((card) => canExtendWithCard(card, car.position, lp, occ));

	return { isMyTurn, challengeRole, hasCommittedChallenge, cardCanExtend };
}
