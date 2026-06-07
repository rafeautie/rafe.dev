import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import type { Card as PlayingCardData, PublicGameState } from '../engine/types';
import type { RaceReveal } from '../hooks/useRacePresentation';
import { CarBadge } from './CarBadge';
import { TheRaceLogo } from './TheRaceLogo';
import { livery } from '../engine/liveries';
import { PlayingCard } from './PlayingCard';
import { YouChip } from './YouChip';
import { HowToPlay } from './HowToPlay';

interface StandingsViewProps {
	state: PublicGameState;
	activeCarIds?: Set<number>;
	pendingChallenge?: PublicGameState['pendingChallenge'];
	// Cars owned by the viewer. Used to tell a hidden opponent commitment (shown
	// face down) apart from the viewer's own card still waiting to be played.
	myCarIds?: number[];
	// Set during a discard/extend reveal hold: the played cards to surface face-up
	// on each car's row. Takes precedence over the live pending/qualifying display.
	reveal?: RaceReveal | null;
}

export function StandingsView({
	state,
	activeCarIds,
	pendingChallenge,
	myCarIds,
	reveal
}: StandingsViewProps) {
	const sorted = [...state.cars].sort((a, b) => b.position - a.position);
	const isQualifying = state.phase === 'qualifying';
	const myCars = new Set(myCarIds ?? []);
	const qualifiedCarIds = new Set(state.qualifiedCarIds ?? []);

	return (
		<Card variant="the-race-bg" className="h-80 w-100 pb-0">
			<CardHeader className="flex items-center justify-between">
				<TheRaceLogo />
				<HowToPlay />
			</CardHeader>
			<CardContent className="scrollbar-none overflow-y-scroll">
				<ul className="flex flex-col gap-3 pt-2">
					{sorted.map((car, rank) => {
						const liv = livery(car.liveryId);
						// During a reveal hold the overlay owns the display: only the revealed
						// car(s) are lit and carded; the live pending/active state is suppressed.
						const revealCards = reveal?.cards[car.id];
						const inReveal = revealCards !== undefined;
						const isChallenger = !reveal && pendingChallenge?.challengerCarId === car.id;
						const isDefender = !reveal && pendingChallenge?.defenderCarId === car.id;
						const isActive = !reveal && !pendingChallenge && (activeCarIds?.has(car.id) ?? false);
						const highlighted = inReveal || isChallenger || isDefender || isActive;
						// Cards to surface on this row: a reveal's played card(s) take precedence,
						// then the viewer's own cards committed to a pending action (challenge
						// cards mid-challenge, or a qualifying selection awaiting the grid lock-in).
						const playedCards = inReveal
							? revealCards
							: isChallenger
								? pendingChallenge?.challengerCards
								: isDefender
									? pendingChallenge?.defenderCards
									: car.qualifyingCards;
						// An opponent has locked in a card we can't see. Until they commit,
						// the slot stays empty/pending (handled by `highlighted` below).
						// "YOU" tags the viewer's own car, but only while it's on the clock —
						// i.e. when it's their turn to act (persists through commit, per the
						// activeCarIds signal).
						const isYourTurn = myCars.has(car.id) && (activeCarIds?.has(car.id) ?? false);
						const opponentSubmitted =
							!reveal &&
							!myCars.has(car.id) &&
							(isChallenger
								? (pendingChallenge?.challengerCommitted ?? false)
								: isDefender
									? (pendingChallenge?.defenderCommitted ?? false)
									: isQualifying && qualifiedCarIds.has(car.id));
						// The card slot, when one is shown. A committed-but-hidden card is a
						// single face-down slot (`undefined`); on reveal it becomes the actual
						// cards — keeping the same keyed instance so PlayingCard flips it over
						// rather than swapping it out.
						const slotCards: (PlayingCardData | undefined)[] | null =
							playedCards && playedCards.length > 0
								? playedCards
								: opponentSubmitted
									? [undefined]
									: null;
						return (
							<motion.li
								key={car.id}
								initial={false}
								animate={{
									backgroundColor: highlighted ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0)',
									boxShadow: highlighted
										? 'inset 0 0 0 1px rgba(255,255,255,0.2)'
										: 'inset 0 0 0 1px rgba(255,255,255,0.1)'
								}}
								transition={{ duration: 0.35, ease: 'easeInOut' }}
								className="relative flex flex-col gap-1.5 rounded-xl px-3 py-1.5 text-[15px] last-of-type:mb-5"
							>
								<div className="flex items-center gap-3">
									{isYourTurn && <YouChip className="absolute top-0 left-8 -translate-y-1/4" />}
									<span className="w-5 font-extrabold">{rank + 1}</span>
									<CarBadge liveryId={car.liveryId} />
									<span className="whitespace-nowrap">{liv.driverName ?? '?'}</span>
									<div className="flex w-full items-center justify-end gap-2 py-2 font-bold">
										{isChallenger && <span className="text-sm">ATK</span>}
										{isDefender && <span className="text-sm">DEF</span>}
										{slotCards ? (
											slotCards.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)
										) : highlighted ? (
											// This car is on the clock but hasn't committed cards yet —
											// show a placeholder slot so its pending play reads as imminent.
											<div className="flex flex-wrap gap-1">
												<div className="aspect-5/7 h-12 animate-pulse rounded-md border-2 border-dashed border-white/25" />
											</div>
										) : (
											<span className="pr-3">{car.handSize}</span>
										)}
									</div>
								</div>
							</motion.li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}
