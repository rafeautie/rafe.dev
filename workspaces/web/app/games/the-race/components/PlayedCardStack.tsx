import { motion, type TargetAndTransition, type Transition } from 'framer-motion';
import type { Card } from '../engine/types';
import {
	CARD_DWELL_MS,
	CARD_FADE_IN_MS,
	CARD_FADE_OUT_MS,
	CARD_SCALE_DELAY_MS,
	CARD_SCALE_DOWN_MS,
	CAR_MOVE_MS,
	REVEAL_MOVE_DELAY_MS
} from '../hooks/useRacePresentation';
import { PlayingCard } from './PlayingCard';

// ─── Played-card overlay ──────────────────────────────────────────────────────────
//
// The card(s) a car just played, overlaid on top of that car on the track during a
// reveal hold — a discard, an extend, or either side of a challenge. Mounted inside
// the car's track piece, so when the play moves the car (an extend forward, a won
// challenge's swap) the cards ride along with it.
//
// Beat: the cards fade in and an `emphasized` stack scales up slightly, holds that
// scale while the car moves and settles, then eases back down to its normal size,
// lingers a beat at rest, and finally fades away — the fade completing just as the
// presentation layer releases the frame. Both duellists are emphasized on a tie; a
// solo discard/extend is always its own focal play.

interface PlayedCardStackProps {
	cards: Card[];
	/** Scale this stack up slightly to mark it as the focal play (a challenge winner,
	 *  or a solo discard/extend). */
	emphasized: boolean;
}

// The reveal spans the whole hold so its fade-out lands as the frame releases. The
// timeline is derived from the shared reveal constants so the card fully reveals and
// scales (ending at REVEAL_MOVE_DELAY_MS) before the car moves, stays visible until
// the car has settled plus the dwell, then fades — keeping the phases in lockstep
// with the move/hold if the timing is ever retuned.
/** How much an emphasized stack grows. */
const EMPHASIS_SCALE = 1.18;
// The scale completes exactly at REVEAL_MOVE_DELAY_MS (= fade-in + delay + scale-up),
// which is when the car starts to move — so the scale is wholly before the move.
const SCALE_END_MS = REVEAL_MOVE_DELAY_MS;
const SETTLE_MS = REVEAL_MOVE_DELAY_MS + CAR_MOVE_MS;
const TOTAL_MS = SETTLE_MS + CARD_DWELL_MS + CARD_FADE_OUT_MS;

// times (fractions of TOTAL): mount → faded in → scale starts → scaled up (move
// begins) → car settled (still scaled) → scaled back down → start fade → gone.
const TIMES = [
	0,
	CARD_FADE_IN_MS / TOTAL_MS,
	(CARD_FADE_IN_MS + CARD_SCALE_DELAY_MS) / TOTAL_MS,
	SCALE_END_MS / TOTAL_MS,
	SETTLE_MS / TOTAL_MS,
	(SETTLE_MS + CARD_SCALE_DOWN_MS) / TOTAL_MS,
	(SETTLE_MS + CARD_DWELL_MS) / TOTAL_MS,
	1
];
const TRANSITION: Transition = { duration: TOTAL_MS / 1000, times: TIMES, ease: 'easeInOut' };

const EMPHASIZED_KEYFRAMES: TargetAndTransition = {
	// Scale up before the move, hold through it, then ease back down once settled.
	opacity: [0, 1, 1, 1, 1, 1, 1, 0],
	scale: [1, 1, 1, EMPHASIS_SCALE, EMPHASIS_SCALE, 1, 1, 1]
};
const PLAIN_KEYFRAMES: TargetAndTransition = {
	opacity: [0, 1, 1, 1, 1, 1, 1, 0],
	scale: 1
};

export function PlayedCardStack({ cards, emphasized }: PlayedCardStackProps) {
	if (cards.length === 0) return null;
	// The outer wrapper pins the stack centred over the car (inset-0 spans the car
	// piece); the inner motion element owns the animated transform (Framer manages
	// `transform`, so the two must not share an element or one clobbers the other).
	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
			<motion.div
				// A drop-shadow filter (not box-shadow) so the shadow follows each card's
				// rounded silhouette and lifts it off the car. Safe to set via class — the
				// keyframes below animate transform/opacity, never `filter`.
				className="flex items-end gap-1 drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]"
				initial={{ opacity: 0 }}
				animate={emphasized ? EMPHASIZED_KEYFRAMES : PLAIN_KEYFRAMES}
				transition={TRANSITION}
			>
				{cards.map((card, i) => (
					<PlayingCard key={card.id ?? i} card={card} size="md" />
				))}
			</motion.div>
		</div>
	);
}
