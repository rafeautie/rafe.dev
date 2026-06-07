import type { Card, Suit } from './types';

// ─── Card vocabulary & deck (pure) ──────────────────────────────────────────────
//
// What a card *is* and what it is worth: deck construction, the card-kind
// predicates, and effective value. The single home for card meaning — imported by
// the engine state machine, the rules, and the legal-move predicates, so the
// definitions live in exactly one place and cannot drift.

// ─── Deck ─────────────────────────────────────────────────────────────────────

export function createDeck(suit: Suit): Card[] {
	const cards: Card[] = [];
	for (let v = 1; v <= 12; v++) {
		cards.push({ id: `${suit}:${v}`, kind: 'regular', value: v, suit });
	}
	cards.push({ id: `${suit}:redline`, kind: 'redline', suit });
	return cards;
}

export function shuffleDeck(deck: Card[]): Card[] {
	const out = [...deck];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}

// ─── Card-kind predicates & value ───────────────────────────────────────────────

export function effectiveValue(card: Card, paired?: boolean): number {
	if (card.kind === 'regular') return card.value;
	return paired ? 2 : 0;
}

export function isExtendCard(card: Card): boolean {
	return card.kind === 'regular' && card.value <= 3;
}

export function isDraftingCard(card: Card): boolean {
	return card.kind === 'regular' && card.value === 3;
}

export function isRedline(card: Card): boolean {
	return card.kind === 'redline';
}
