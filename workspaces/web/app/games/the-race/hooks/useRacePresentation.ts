import { useEffect, useState } from 'react';
import type { Card, PublicGameState, RaceEvent } from '../engine/types';

/** How long a single car takes to pull out and brake to a stop on the track. */
export const CAR_MOVE_MS = 900;

// ─── Played-card reveal phases ────────────────────────────────────────────────────
// The card fades in, waits a beat, then scales up for emphasis. The car's move waits
// for all three so the scale lands fully before anything moves.

/** Card fades in over this long. */
export const CARD_FADE_IN_MS = 200;
/** Beat between the card being revealed and the emphasis scale kicking in. */
export const CARD_SCALE_DELAY_MS = 400;
/** Emphasis scale-up duration. */
export const CARD_SCALE_UP_MS = 500;

/** A played card fully reveals and scales in place before its car moves — an extend
 *  forward or a won challenge's swap waits this long, so the scale animation lands
 *  before the position move. A play that moves no car (a discard, a held defence)
 *  just ignores it. */
export const REVEAL_MOVE_DELAY_MS = CARD_FADE_IN_MS + CARD_SCALE_DELAY_MS + CARD_SCALE_UP_MS;

/** How long the card takes to ease back down to its normal size once its car has
 *  settled from the move. Runs within the dwell, so the hold length is unchanged. */
export const CARD_SCALE_DOWN_MS = 300;

/** How long the played card lingers, fully visible, after its car has settled —
 *  before it begins to fade away. Spans the scale-back-down plus a beat at rest. */
export const CARD_DWELL_MS = 800;

/** How long the played card takes to fade away at the end of its reveal. */
export const CARD_FADE_OUT_MS = 300;

/** How long a played-card reveal stays on screen: the card plays, the car moves
 *  (REVEAL_MOVE_DELAY_MS + CAR_MOVE_MS), the card lingers (CARD_DWELL_MS), then it
 *  fades (CARD_FADE_OUT_MS) — the frame releases just as the fade completes. */
const REVEAL_HOLD_MS = REVEAL_MOVE_DELAY_MS + CAR_MOVE_MS + CARD_DWELL_MS + CARD_FADE_OUT_MS;

/** Delay between consecutive cars pulling onto the grid during the reveal. */
export const GRID_REVEAL_STAGGER_MS = 300;

/** Time the last car needs to pull in and stop, plus a beat, before releasing. */
const GRID_REVEAL_SETTLE_MS = CAR_MOVE_MS + 400;

/** Cards shown face-up on each car's standings row during a reveal hold. */
export interface RaceReveal {
	cards: Record<number, Card[]>;
}

/**
 * A resolved challenge dwelt on during its hold. The duellists' cards sit on top
 * of their cars on the track and the winner gets an impactful pop (both cards on a
 * tie). The cards ride inside each car's track piece, so a position swap carries
 * them along — they follow the cars and swap too.
 */
export interface ChallengeReveal {
	challengerCarId: number;
	defenderCarId: number;
	challengerCards: Card[];
	defenderCards: Card[];
	outcome: 'challenger' | 'defender' | 'tie';
}

interface RacePresentation {
	/** The state to render — a held reveal frame during a hold, else the live feed. */
	state: PublicGameState | null;
	/** Non-null during a hold; the standings overlay for the revealed play. */
	reveal: RaceReveal | null;
	/** Non-null during a challenge-resolution hold; the duel's track-card overlay. */
	challenge: ChallengeReveal | null;
	/** True during the grid-set beat: cars spring onto the grid one at a time. */
	gridReveal: boolean;
}

export interface Hold {
	frame: PublicGameState;
	reveal: RaceReveal | null;
	/** Set for a challenge-resolution hold: the duel's track-card overlay + outcome. */
	challenge: ChallengeReveal | null;
	/** The grid-set beat staggers the cars onto the grid (pole first). */
	gridReveal: boolean;
	/** How long this hold stays on screen — longer for the staggered grid reveal. */
	holdMs: number;
}

// ─── Race presentation layer ────────────────────────────────────────────────────
//
// Sits between the authoritative state feed and the rendered UI, choreographing
// transitions the engine passes through instantaneously. A play resolves and
// positions change in a single tick; to dwell on it we briefly hold a *frame* that
// keeps the live (post-action) positions but surfaces the played cards. Positions
// therefore animate at the *start* of the hold — the rows reorder and the track
// car springs forward as the cards appear — and the cards linger until release.
//
// This is driven by explicit events, not by diffing snapshots: an event's arrival
// is the signal and its payload carries the cards to dwell on.
//
// A challenge reveal encodes its two hands + roles via an injected pendingChallenge
// (which also drives the track's duel focus). A discard/extend reveal clears any
// pendingChallenge and surfaces the single played card via `reveal.cards`.
//
// The grid-set beat is a hold of a different shape: it carries no reveal cards but
// clears the round's focus, so the cars spring from the start line onto the grid
// and settle before the first turn's tile highlight appears (otherwise the
// car-to-grid animation and that highlight land on the same tick).

const HOLD_TYPES = ['challengeResolved', 'discarded', 'extended', 'gridSet'] as const;
type HoldEvent = Extract<RaceEvent, { type: (typeof HOLD_TYPES)[number] }>;

function isHoldEvent(e: RaceEvent): e is HoldEvent {
	return (HOLD_TYPES as readonly string[]).includes(e.type);
}

export function buildHold(state: PublicGameState, event: HoldEvent): Hold {
	// A hold dwells on a race-phase reveal. When the held action is the one that
	// ends the game, the server's state already reads `phase: 'results'` — so the
	// frame pins `phase: 'race'` to keep the race screen up for the whole beat,
	// letting the final reveal/positions animate before the results screen takes
	// over (the live results state surfaces once the hold releases).
	switch (event.type) {
		case 'challengeResolved':
			// Both hands revealed via a synthetic pending challenge (also focuses the
			// track on the duel and surfaces the cards in the standings). Positions are
			// the live, post-swap ones — so the track cars animate the swap from their
			// previous render, carrying the floating challenge cards along. `challenge`
			// drives that track overlay and the winner's pop.
			return {
				frame: {
					...state,
					phase: 'race',
					pendingChallenge: {
						challengerCarId: event.challengerCarId,
						defenderCarId: event.defenderCarId,
						challengerCards: event.challengerCards,
						defenderCards: event.defenderCards,
						challengerCommitted: true,
						defenderCommitted: true
					}
				},
				reveal: null,
				challenge: {
					challengerCarId: event.challengerCarId,
					defenderCarId: event.defenderCarId,
					challengerCards: event.challengerCards,
					defenderCards: event.defenderCards,
					outcome: event.outcome
				},
				gridReveal: false,
				holdMs: REVEAL_HOLD_MS
			};
		case 'extended':
		case 'discarded':
			// Dwell on the single played card. Suppress any auto-declared next
			// challenge during the beat; positions are the live, post-action ones.
			return {
				frame: { ...state, phase: 'race', pendingChallenge: undefined },
				reveal: { cards: { [event.carId]: event.card ? [event.card] : [] } },
				challenge: null,
				gridReveal: false,
				holdMs: REVEAL_HOLD_MS
			};
		case 'gridSet':
			// The grid just locked in. Hold a focus-free race frame: the live grid
			// positions stay (so the cars pull out from the start line and brake onto
			// the grid), but clearing pendingThisRound/pendingChallenge suppresses the
			// first turn's tile highlight until the hold releases — separating the two
			// beats instead of firing both on the same tick. `gridReveal` tells the
			// track to bring the cars in one at a time (pole first), so the hold runs
			// long enough to cover the whole stagger plus the last car settling.
			return {
				frame: { ...state, phase: 'race', pendingThisRound: [], pendingChallenge: undefined },
				reveal: null,
				challenge: null,
				gridReveal: true,
				holdMs: Math.max(0, state.cars.length - 1) * GRID_REVEAL_STAGGER_MS + GRID_REVEAL_SETTLE_MS
			};
	}
}

export function useRacePresentation(
	state: PublicGameState | null,
	events: RaceEvent[]
): RacePresentation {
	// While set, this frozen reveal frame is shown instead of the live feed.
	const [held, setHeld] = useState<Hold | null>(null);
	// The last events array we acted on, tracked by reference so each message's
	// events are processed exactly once (the "adjust state from a prop change"
	// pattern — no refs touched during render).
	const [seenEvents, setSeenEvents] = useState<RaceEvent[]>(events);

	if (events !== seenEvents) {
		setSeenEvents(events);
		// Don't start a new hold mid-reveal: events arriving during a hold are
		// dropped and the latest state shows when the hold ends (freeze-all).
		if (!held && state) {
			const event = events.find(isHoldEvent);
			if (event) setHeld(buildHold(state, event));
		}
	}

	useEffect(() => {
		if (!held) return;
		const timer = setTimeout(() => setHeld(null), held.holdMs);
		return () => clearTimeout(timer);
	}, [held]);

	return {
		state: held?.frame ?? state,
		reveal: held?.reveal ?? null,
		challenge: held?.challenge ?? null,
		gridReveal: held?.gridReveal ?? false
	};
}
