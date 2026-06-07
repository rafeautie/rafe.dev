import { describe, it, expect } from 'vitest';
import {
	challengeResolvedEvent,
	discardedEvent,
	eventCarIds,
	extendedEvent,
	gameStartedEvent,
	qualifyingLockedInEvent,
	qualifyRevealEvents
} from './events';
import type { Card, ResolvedChallenge } from './types';

const card = (value: number): Card => ({
	id: `gears:${value}`,
	kind: 'regular',
	value,
	suit: 'gears'
});

const resolved: ResolvedChallenge = {
	challengerCarId: 2,
	challengerCards: [card(8)],
	defenderCarId: 5,
	defenderCards: [card(6)],
	outcome: 'challenger'
};

describe('challengeResolvedEvent', () => {
	it('carries the resolution fields verbatim', () => {
		const ev = challengeResolvedEvent(resolved);
		expect(ev).toEqual({
			type: 'challengeResolved',
			challengerCarId: 2,
			defenderCarId: 5,
			challengerCards: [card(8)],
			defenderCards: [card(6)],
			outcome: 'challenger'
		});
	});
});

describe('log event builders', () => {
	it('gameStartedEvent / gridSet are system events with no cars', () => {
		expect(gameStartedEvent()).toEqual({ type: 'gameStarted' });
		expect(eventCarIds(gameStartedEvent())).toEqual([]);
		expect(eventCarIds({ type: 'gridSet' })).toEqual([]);
	});

	it('qualifyingLockedInEvent concerns its car', () => {
		const ev = qualifyingLockedInEvent(4);
		expect(ev).toEqual({ type: 'qualifyingLockedIn', carId: 4 });
		expect(eventCarIds(ev)).toEqual([4]);
	});

	it('qualifyRevealEvents emits one qualified event per car in order, then gridSet', () => {
		const events = qualifyRevealEvents([{ id: 1 }, { id: 0 }], {
			1: [card(10)],
			0: [card(7)]
		});
		expect(events).toHaveLength(3);
		expect(events[0]).toEqual({ type: 'qualified', carId: 1, cards: [card(10)] });
		expect(events[1]).toEqual({ type: 'qualified', carId: 0, cards: [card(7)] });
		expect(events[2]).toEqual({ type: 'gridSet' });
	});

	it('qualifyRevealEvents defaults missing cards to an empty array', () => {
		const events = qualifyRevealEvents([{ id: 0 }], {});
		expect(events[0]).toEqual({ type: 'qualified', carId: 0, cards: [] });
	});

	it('discardedEvent carries the card and concerns its car', () => {
		const ev = discardedEvent(3, card(7));
		expect(ev).toEqual({ type: 'discarded', carId: 3, card: card(7) });
		expect(eventCarIds(ev)).toEqual([3]);
	});

	it('discardedEvent tolerates a missing card', () => {
		expect(discardedEvent(3, undefined)).toEqual({ type: 'discarded', carId: 3, card: undefined });
	});

	it('extendedEvent carries card + new position', () => {
		const ev = extendedEvent(1, card(2), 5);
		expect(ev).toEqual({ type: 'extended', carId: 1, card: card(2), newPosition: 5 });
		expect(eventCarIds(ev)).toEqual([1]);
	});

	it('eventCarIds returns both cars for a resolved challenge', () => {
		expect(eventCarIds(challengeResolvedEvent(resolved))).toEqual([2, 5]);
	});
});
