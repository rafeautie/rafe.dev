// ─── Race event builders (pure) ─────────────────────────────────────────────────
//
// Builders that turn engine outcomes into public RaceEvents. They live next to
// the command handler's needs (the Durable Object), kept pure so payloads — and
// the per-car filter derivation — are unit-testable with no DO or WebSocket
// machinery. Each emitted event is both appended to the game log and broadcast
// transiently for animation; the client renders the structured data directly.

import type { Card, RaceEvent, ResolvedChallenge } from './types';

type ChallengeResolvedEvent = Extract<RaceEvent, { type: 'challengeResolved' }>;

export function gameStartedEvent(): RaceEvent {
	return { type: 'gameStarted' };
}

/** One car locked in its qualifying card (partial — not all cars done yet). */
export function qualifyingLockedInEvent(carId: number): RaceEvent {
	return { type: 'qualifyingLockedIn', carId };
}

/**
 * The last car qualified and the grid is set. Emits one `qualified` event per car
 * (in grid order, pole first) followed by a `gridSet` event. `allQualifyingCards`
 * maps carId → the cards it played.
 */
export function qualifyRevealEvents(
	carsInGridOrder: ReadonlyArray<{ id: number }>,
	allQualifyingCards: Record<number, Card[]>
): RaceEvent[] {
	const revealed: RaceEvent[] = carsInGridOrder.map((c) => ({
		type: 'qualified',
		carId: c.id,
		cards: allQualifyingCards[c.id] ?? []
	}));
	return [...revealed, { type: 'gridSet' }];
}

/** A car discarded a card. `card` is undefined only if the lookup failed. */
export function discardedEvent(carId: number, card: Card | undefined): RaceEvent {
	return { type: 'discarded', carId, card };
}

/** A car extended to `newPosition` with `card` (undefined if the lookup failed). */
export function extendedEvent(
	carId: number,
	card: Card | undefined,
	newPosition: number | undefined
): RaceEvent {
	return { type: 'extended', carId, card, newPosition };
}

/** Build the `challengeResolved` event from the engine's resolution. */
export function challengeResolvedEvent(resolved: ResolvedChallenge): ChallengeResolvedEvent {
	return {
		type: 'challengeResolved',
		challengerCarId: resolved.challengerCarId,
		defenderCarId: resolved.defenderCarId,
		challengerCards: resolved.challengerCards,
		defenderCards: resolved.defenderCards,
		outcome: resolved.outcome
	};
}

/**
 * The cars an event concerns — drives the per-car log filter. An empty list marks
 * a system/global event (e.g. game started, grid set) that always shows.
 */
export function eventCarIds(event: RaceEvent): number[] {
	switch (event.type) {
		case 'qualifyingLockedIn':
		case 'qualified':
		case 'discarded':
		case 'extended':
			return [event.carId];
		case 'challengeResolved':
			return [event.challengerCarId, event.defenderCarId];
		case 'gameStarted':
		case 'gridSet':
			return [];
	}
}
