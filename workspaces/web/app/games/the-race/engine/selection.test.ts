import { describe, it, expect } from 'vitest';
import {
	selectionReducer,
	getSelection,
	hasMainSelected,
	hasRedlinePaired,
	canPairRedline
} from './selection';
import type { SelectionState } from './types';
import type { Card } from './types';

const reg = (value: number): Card => ({
	id: `gears:${value}`,
	kind: 'regular',
	value,
	suit: 'gears'
});
const redline: Card = { id: 'fuel:redline', kind: 'redline', suit: 'fuel' };

// ─── selectionReducer SELECT_MAIN ─────────────────────────────────────────────

describe('selectionReducer SELECT_MAIN', () => {
	it('selects a main card id for a car', () => {
		const state: SelectionState = {};
		const next = selectionReducer(state, { type: 'SELECT_MAIN', carId: 1, cardId: 'c3' });
		expect(next[1]).toEqual(['c3']);
	});

	it('replaces a previous main selection for the same car', () => {
		const state: SelectionState = { 1: ['c2'] };
		const next = selectionReducer(state, { type: 'SELECT_MAIN', carId: 1, cardId: 'c5' });
		expect(next[1]).toEqual(['c5']);
	});

	it('clears selection when cardId is null', () => {
		const state: SelectionState = { 1: ['c3'] };
		const next = selectionReducer(state, { type: 'SELECT_MAIN', carId: 1, cardId: null });
		expect(next[1]).toBeUndefined();
	});

	it('removes any existing Redline pair when a new main card is selected', () => {
		const state: SelectionState = { 1: ['c2', 'c7'] }; // main=c2, redline=c7
		const next = selectionReducer(state, { type: 'SELECT_MAIN', carId: 1, cardId: 'c4' });
		expect(next[1]).toEqual(['c4']); // pair cleared
	});

	it('does not affect selections for other cars', () => {
		const state: SelectionState = { 0: ['c1'], 2: ['c5'] };
		const next = selectionReducer(state, { type: 'SELECT_MAIN', carId: 1, cardId: 'c3' });
		expect(next[0]).toEqual(['c1']);
		expect(next[2]).toEqual(['c5']);
	});
});

// ─── selectionReducer TOGGLE_REDLINE ─────────────────────────────────────────

describe('selectionReducer TOGGLE_REDLINE', () => {
	it('pairs a Redline when no pair exists and main is selected', () => {
		const state: SelectionState = { 1: ['c2'] };
		const next = selectionReducer(state, { type: 'TOGGLE_REDLINE', carId: 1, redlineId: 'c7' });
		expect(next[1]).toEqual(['c2', 'c7']);
	});

	it('removes the Redline pair when one already exists', () => {
		const state: SelectionState = { 1: ['c2', 'c7'] };
		const next = selectionReducer(state, { type: 'TOGGLE_REDLINE', carId: 1, redlineId: 'c7' });
		expect(next[1]).toEqual(['c2']);
	});

	it('no-ops when no main card is selected', () => {
		const state: SelectionState = {};
		const next = selectionReducer(state, { type: 'TOGGLE_REDLINE', carId: 1, redlineId: 'c7' });
		expect(next[1]).toBeUndefined();
	});
});

// ─── selectionReducer CLEAR ───────────────────────────────────────────────────

describe('selectionReducer CLEAR', () => {
	it('clears the selection for the specified car', () => {
		const state: SelectionState = { 1: ['c3'], 2: ['c5'] };
		const next = selectionReducer(state, { type: 'CLEAR', carId: 1 });
		expect(next[1]).toBeUndefined();
		expect(next[2]).toEqual(['c5']);
	});

	it('is a no-op when the car has no selection', () => {
		const state: SelectionState = { 2: ['c5'] };
		const next = selectionReducer(state, { type: 'CLEAR', carId: 1 });
		expect(next[1]).toBeUndefined();
		expect(next[2]).toEqual(['c5']);
	});
});

// ─── selectionReducer CLEAR_ALL ──────────────────────────────────────────────

describe('selectionReducer CLEAR_ALL', () => {
	it('clears all selections', () => {
		const state: SelectionState = { 0: ['c1'], 1: ['c2', 'c7'], 2: ['c4'] };
		const next = selectionReducer(state, { type: 'CLEAR_ALL' });
		expect(Object.keys(next)).toHaveLength(0);
	});
});

// ─── Selector helpers ─────────────────────────────────────────────────────────

describe('getSelection', () => {
	it('returns the id array for a car', () => {
		expect(getSelection({ 1: ['c3', 'c7'] }, 1)).toEqual(['c3', 'c7']);
	});

	it('returns [] for an unselected car', () => {
		expect(getSelection({}, 1)).toEqual([]);
	});
});

describe('hasMainSelected', () => {
	it('true when a main card is selected', () => {
		expect(hasMainSelected({ 1: ['c3'] }, 1)).toBe(true);
	});

	it('false when nothing is selected', () => {
		expect(hasMainSelected({}, 1)).toBe(false);
	});
});

describe('hasRedlinePaired', () => {
	it('true when a Redline is paired with the main card', () => {
		expect(hasRedlinePaired({ 1: ['c3', 'c7'] }, 1)).toBe(true);
	});

	it('false when only a main card is selected', () => {
		expect(hasRedlinePaired({ 1: ['c3'] }, 1)).toBe(false);
	});

	it('false when nothing is selected', () => {
		expect(hasRedlinePaired({}, 1)).toBe(false);
	});
});

describe('canPairRedline', () => {
	const hand: Card[] = [reg(1), redline, reg(4)];

	it('true when a main card is selected, hand has a Redline, and main is not the Redline', () => {
		expect(canPairRedline(hand, ['gears:1'])).toBe(true);
	});

	it('false when no main card is selected', () => {
		expect(canPairRedline(hand, [])).toBe(false);
	});

	it('false when the selected main card is itself the Redline', () => {
		expect(canPairRedline(hand, ['fuel:redline'])).toBe(false);
	});

	it('false when the hand has no Redline', () => {
		expect(canPairRedline([reg(1), reg(4)], ['gears:1'])).toBe(false);
	});
});
