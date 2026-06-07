// ─── Race view-model (pure, no React) ─────────────────────────────────────────
//
// Projects a PublicGameState + the viewer's selection state into everything the
// RaceView component needs to render: the round-level sets, the currently-viewed
// car's hand/selection, and the enable/disable gating for each action button.
//
// Solo-action gating (discard / extend) gates on TURN ORDER: only the car at the
// front of the round queue may act — matching the engine, whose DISCARD/EXTEND
// handlers reject a car that is not next to act. Offering the button to a car
// that is merely in the round would let it fire a move the server then rejects.

import type { Phase, PublicGameState, RaceView, SelectionState } from './types';
import { carLegalMoves } from './legalMoves';
import { canPairRedline, getSelection, hasMainSelected } from './selection';

/**
 * The car(s) on the clock for a race turn — the focus set the standings
 * highlight and the track dimming share, so the two never drift apart. During a
 * challenge both duelling cars are lit; otherwise (a solo turn) only the next
 * car to act — the lowest-position car still pending this round, matching the
 * engine's turn order. Returns an empty set outside the race phase; qualifying
 * (every car acts at once) and reveal holds are layered on by callers.
 */
export function carsOnClock(state: {
	phase: Phase;
	cars: readonly { id: number; position: number }[];
	pendingThisRound: readonly number[];
	pendingChallenge?: { challengerCarId: number; defenderCarId: number };
}): Set<number> {
	if (state.pendingChallenge) {
		return new Set([state.pendingChallenge.challengerCarId, state.pendingChallenge.defenderCarId]);
	}
	if (state.phase === 'race' && state.pendingThisRound.length > 0) {
		const pending = state.cars.filter((c) => state.pendingThisRound.includes(c.id));
		if (pending.length > 0) {
			const next = pending.reduce((a, b) => (a.position < b.position ? a : b));
			return new Set([next.id]);
		}
	}
	return new Set();
}

/**
 * The car tab the viewer should be auto-focused on, or undefined to leave the
 * current tab untouched. Drives the HandView's auto-switching:
 *
 *  1. When a turn opens and the focused car owes no card, jump to the first of
 *     the viewer's own cars (tab order) that does.
 *  2. With two cars both on the clock, submitting one drops it from the pending
 *     set — the same rule then lands focus on the remaining pending car.
 *
 * Staying put while the focused car still owes a card lets a player who controls
 * two pending cars choose which to play first without being yanked around.
 */
export function autoFocusCarId(
	myCars: readonly { id: number }[],
	carsNeedingCard: readonly number[],
	currentCarId: number | undefined
): number | undefined {
	if (currentCarId !== undefined && carsNeedingCard.includes(currentCarId)) return undefined;
	const target = myCars.find((c) => carsNeedingCard.includes(c.id));
	return target && target.id !== currentCarId ? target.id : undefined;
}

/**
 * Build the RaceView for the given game state, selection state, viewer, and the
 * viewer's preferred car tab (undefined → defaults to their first car).
 */
export function selectRaceView(
	state: PublicGameState,
	selections: SelectionState,
	playerId: string,
	preferredCarId: number | undefined
): RaceView {
	const myCarIds = state.players.find((p) => p.id === playerId)?.carIds ?? [];
	const myCars = state.cars.filter((c) => myCarIds.includes(c.id));

	const isQualifying = state.phase === 'qualifying';
	const holdAtStart = isQualifying && (state.qualifiedCarIds?.length ?? 0) < state.cars.length;

	// The car(s) on the clock right now — a single car on a solo turn, both
	// duellists during a challenge. Qualifying is simultaneous, so every car still
	// to submit is on the clock. This drives the standings highlight and the tab
	// beam; the solo-action gating below shares the same turn-order rule (only the
	// car next to act may discard/extend, matching the engine).
	const activeCarIds = isQualifying ? new Set(state.pendingThisRound) : carsOnClock(state);
	const activeCar = state.cars.find((c) => activeCarIds.has(c.id));

	const pc = state.pendingChallenge;
	const carsNeedingCard = pc
		? [
				...(pc.challengerCommitted ? [] : [pc.challengerCarId]),
				...(pc.defenderCommitted ? [] : [pc.defenderCarId])
			]
		: [...activeCarIds];

	const selectedCarId = preferredCarId ?? myCarIds[0];
	const selectedCar = state.cars.find((c) => c.id === selectedCarId) ?? activeCar;
	const isMine = selectedCarId !== undefined && myCarIds.includes(selectedCarId);

	const hand = selectedCar?.hand ?? [];
	const selection = getSelection(selections, selectedCarId ?? -1);
	const mainCardId = selection[0] ?? null;
	const pairCardId = selection[1] ?? null;
	const hasMain = hasMainSelected(selections, selectedCarId ?? -1);

	const mainCard = mainCardId !== null ? hand.find((c) => c.id === mainCardId) : undefined;
	const pairCard = pairCardId !== null ? hand.find((c) => c.id === pairCardId) : undefined;
	const selectedCards = [...(mainCard ? [mainCard] : []), ...(pairCard ? [pairCard] : [])];

	// Challenge role only applies to the viewer's own car in the pending challenge.
	const legalMoves = carLegalMoves(state, selectedCarId ?? -1, hand);
	// A solo turn (discard / extend) belongs only to the car at the front of the
	// round queue — mirrors the engine's turn-order guard so the UI never offers a
	// move the server will reject (e.g. a car just promoted to the lead).
	const isMyTurnToAct = isMine && legalMoves.isMyTurn;
	const role = isMine ? legalMoves.challengeRole : null;
	const inChallenge = role !== null;
	const challengeLabel =
		role === 'challenger' ? 'Attack' : role === 'defender' ? 'Defend' : 'Challenge';

	// A car may only take a solo turn (discard / extend) when it has a free space
	// directly ahead. When position+1 is occupied the car must challenge instead.
	const hasCarDirectlyAhead =
		selectedCar !== undefined && state.cars.some((c) => c.position === selectedCar.position + 1);

	const canQualify =
		isQualifying && isMine && !state.qualifiedCarIds?.includes(selectedCarId!) && hasMain;
	const canDiscard = isMyTurnToAct && !inChallenge && !hasCarDirectlyAhead && mainCardId !== null;
	const mainIndex = mainCard ? hand.indexOf(mainCard) : -1;
	const canExtend = isMyTurnToAct && !inChallenge && (legalMoves.cardCanExtend[mainIndex] ?? false);
	const canChallenge = inChallenge && hasMain && !legalMoves.hasCommittedChallenge;

	return {
		myCarIds,
		myCars,
		activeCarIds,
		carsNeedingCard,
		isQualifying,
		holdAtStart,
		selectedCarId,
		hand,
		mainCardId,
		pairCardId,
		selectedCards,
		// Redline stacking is a challenge-only mechanic. On a solo turn (discard /
		// extend) the car may select exactly one card, so pairing is never offered.
		canPairRedline: inChallenge && canPairRedline(hand, selection),
		challengeLabel,
		canQualify,
		canDiscard,
		canExtend,
		canChallenge
	};
}
