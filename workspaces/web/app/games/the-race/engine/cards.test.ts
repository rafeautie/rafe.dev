import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, effectiveValue } from './cards';
import type { Card } from './types';

// ─── createDeck ──────────────────────────────────────────────────────────────

describe('createDeck', () => {
	it('returns 13 cards for a suit', () => {
		const deck = createDeck('gears');
		expect(deck).toHaveLength(13);
	});

	it('contains 12 regular cards (values 1–12)', () => {
		const deck = createDeck('gears');
		const regulars = deck.filter((c) => c.kind === 'regular') as Extract<
			Card,
			{ kind: 'regular' }
		>[];
		expect(regulars).toHaveLength(12);
		expect(regulars.map((c) => c.value).sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
		]);
	});

	it('contains exactly 1 Redline card', () => {
		const deck = createDeck('gears');
		const redlines = deck.filter((c) => c.kind === 'redline');
		expect(redlines).toHaveLength(1);
	});
});

// ─── shuffleDeck ─────────────────────────────────────────────────────────────

describe('shuffleDeck', () => {
	it('returns a deck with the same cards', () => {
		const deck = createDeck('fuel');
		const shuffled = shuffleDeck([...deck]);
		expect(shuffled).toHaveLength(deck.length);
		expect(shuffled).toEqual(expect.arrayContaining(deck));
	});

	it('does not mutate the original deck', () => {
		const deck = createDeck('fuel');
		const copy = [...deck];
		shuffleDeck(deck);
		expect(deck).toEqual(copy);
	});
});

// ─── effectiveValue ───────────────────────────────────────────────────────────

describe('effectiveValue', () => {
	it('returns the value of a regular card', () => {
		expect(effectiveValue({ id: 'gears:7', kind: 'regular', value: 7, suit: 'gears' })).toBe(7);
	});

	it('returns 0 for a Redline card played alone', () => {
		expect(effectiveValue({ id: 'gears:redline', kind: 'redline', suit: 'gears' })).toBe(0);
	});

	it('returns 2 for a Redline card played alongside another card', () => {
		expect(effectiveValue({ id: 'gears:redline', kind: 'redline', suit: 'gears' }, true)).toBe(2);
	});
});
