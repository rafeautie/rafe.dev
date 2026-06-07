import type { Card, SelectionAction, SelectionState } from './types';

// ─── Card-selection state machine (pure, no React) ────────────────────────────
//
// Tracks per-car card selection: a main card id plus an optional Redline
// pairing id. Used by useRaceSession and unit-tested independently.
//
// Shape: Record<carId, string[]>
//   []                  – nothing selected
//   [mainId]            – main card selected
//   [mainId, redlineId] – main card + Redline pair

/** Pure reducer — return new state for every selection action. */
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
	switch (action.type) {
		case 'SELECT_MAIN': {
			if (action.cardId === null) {
				const next = { ...state };
				delete next[action.carId];
				return next;
			}
			// Select main card; clear any existing pair for this car
			return { ...state, [action.carId]: [action.cardId] };
		}

		case 'TOGGLE_REDLINE': {
			const current = state[action.carId] ?? [];
			if (current.length === 0) {
				// No main card selected — nothing to pair with
				return state;
			}
			if (current.length > 1) {
				// Already paired — remove the Redline
				return { ...state, [action.carId]: [current[0]!] };
			}
			// Pair the Redline with the existing main card
			return { ...state, [action.carId]: [current[0]!, action.redlineId] };
		}

		case 'CLEAR': {
			const next = { ...state };
			delete next[action.carId];
			return next;
		}

		case 'CLEAR_ALL': {
			return {};
		}
	}
}

/** Returns [mainId, redlineId | undefined] for a car, or [] if nothing selected. */
export function getSelection(state: SelectionState, carId: number): string[] {
	return state[carId] ?? [];
}

/** True when a car has a main card selected (with or without Redline pairing). */
export function hasMainSelected(state: SelectionState, carId: number): boolean {
	return (state[carId]?.length ?? 0) > 0;
}

/** True when the car has a Redline paired with its main card selection. */
export function hasRedlinePaired(state: SelectionState, carId: number): boolean {
	return (state[carId]?.length ?? 0) > 1;
}

/**
 * Whether a Redline can be paired onto the current main selection: a main card
 * is selected, the hand contains a Redline, and the main card is not itself the
 * Redline. `selection` is the car's selection array (e.g. from getSelection).
 */
export function canPairRedline(hand: Card[], selection: string[]): boolean {
	const mainId = selection[0];
	if (mainId === undefined) return false;
	if (hand.find((c) => c.id === mainId)?.kind === 'redline') return false;
	return hand.some((c) => c.kind === 'redline');
}
