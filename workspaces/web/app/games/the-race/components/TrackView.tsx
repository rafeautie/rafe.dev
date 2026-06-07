import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { carsOnClock } from '../engine/raceView';
import type { Card, PublicGameState } from '../engine/types';
import {
	CAR_MOVE_MS,
	GRID_REVEAL_STAGGER_MS,
	REVEAL_MOVE_DELAY_MS,
	type ChallengeReveal,
	type RaceReveal
} from '../hooks/useRacePresentation';
import { cn } from '~/lib/utils';
import { CarPiece } from './CarPiece';
import { PlayedCardStack } from './PlayedCardStack';

const TILE_WIDTH = 150;
const TILE_HEIGHT = 70;
const LANE_HEIGHT = TILE_HEIGHT * 1.1;

// Easing for a car's movement: it pulls away from a standstill (zero velocity at
// the start) and brakes smoothly to a full stop (zero velocity at the end), with
// the deceleration drawn out longer than the launch — the weight of a car coming
// to rest rather than the snap of a spring. (Material's standard "decelerate" curve.)
const CAR_EASE = [0.4, 0, 0.2, 1] as const;

interface TrackViewProps {
	state: PublicGameState;
	// When true, all cars are held at position 0 (qualifying pre-reveal)
	holdAtStart?: boolean;
	// Set during a discard/extend reveal hold: the dwelt-on play owns the track
	// focus so the tile highlight tracks the played car (e.g. an extending car
	// followed to the space it moved into), not the live next-to-act car.
	reveal?: RaceReveal | null;
	// Set during a challenge-resolution hold: each duellist's played cards sit on top
	// of their car (mounted inside the car piece, so a won duel's position swap
	// carries them along), and the winner's stack pops — both stacks on a tie.
	challenge?: ChallengeReveal | null;
	// True during the grid-set beat: cars pull out from the start line onto the grid
	// one at a time, pole (highest position) first, instead of all at once.
	gridReveal?: boolean;
	className?: string;
}

export function TrackView({
	state,
	holdAtStart,
	reveal,
	challenge,
	gridReveal,
	className
}: TrackViewProps) {
	const maxPosition = state.cars.length > 0 ? Math.max(...state.cars.map((c) => c.position)) : 0;
	const tileCount = Math.max(20, maxPosition + 2);
	const laneCount = Math.max(1, state.cars.length);
	const trackHeight = laneCount * LANE_HEIGHT;
	const laneOrder = [...state.cars].sort((a, b) => a.id - b.id);
	const carLane = new Map(laneOrder.map((c, i) => [c.id, i]));

	// During the grid reveal each car pulls in after the one ahead of it: pole
	// (highest position) leads at zero delay, last on the grid trails the most.
	const gridOrder = [...state.cars].sort((a, b) => b.position - a.position);
	const gridRank = new Map(gridOrder.map((c, i) => [c.id, i]));

	// Dim every tile and car except the one(s) whose turn it currently is, so
	// focus stays on the active play. During a reveal hold the dwelt-on play owns
	// the focus — the held frame carries the post-action position, so lighting the
	// revealed car follows it to the tile it landed on. Otherwise the shared
	// carsOnClock focus applies: both duellists during a challenge, or the lone
	// next-to-act car on a solo turn. A car at position `p` sits over tile `p + 1`.
	const activeCarIds = reveal ? new Set(Object.keys(reveal.cards).map(Number)) : carsOnClock(state);

	const focusActive = activeCarIds.size > 0;
	const highlightedTiles = new Set<number>();
	if (focusActive) {
		for (const car of state.cars) {
			if (activeCarIds.has(car.id)) highlightedTiles.add(car.position + 1);
		}
	}

	const scrollRef = useRef<HTMLDivElement>(null);
	const targetScrollLeft = useRef(0);
	const rafRef = useRef<number | null>(null);
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		const animate = () => {
			const diff = targetScrollLeft.current - el.scrollLeft;
			if (Math.abs(diff) < 0.5) {
				el.scrollLeft = targetScrollLeft.current;
				rafRef.current = null;
				return;
			}
			el.scrollLeft += diff * 0.12;
			rafRef.current = requestAnimationFrame(animate);
		};

		const onWheel = (e: WheelEvent) => {
			if (e.shiftKey) return;
			e.preventDefault();
			const maxScroll = el.scrollWidth - el.clientWidth + 20;
			targetScrollLeft.current = Math.max(
				-10,
				Math.min(maxScroll, targetScrollLeft.current + e.deltaY + e.deltaX)
			);
			if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
		};

		el.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			el.removeEventListener('wheel', onWheel);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, []);

	return (
		<div
			ref={scrollRef}
			// `overflow-x-scroll` forces the cross-axis to compute as clipped (not the
			// `visible` we ask for), so a challenge card centred on the top/bottom lane
			// would be cut off. Vertical padding pushes the clip edge (the padding box)
			// out far enough that the cards — which overflow their lane by ~half a card —
			// stay fully visible. The inner `w-max` wrapper is the cars' positioning
			// context, so they still align to the tiles despite the padding.
			className={cn('relative scrollbar-none overflow-x-scroll overflow-y-visible py-6', className)}
		>
			<div className="relative w-max">
				<div className="flex items-center" style={{ height: trackHeight }}>
					{Array.from({ length: tileCount }).map((_, i) => {
						const dimmed = focusActive && !highlightedTiles.has(i);
						if (i === 0) {
							return (
								<div
									key={i}
									className={cn(
										'shrink-0 overflow-hidden rounded-l-xl transition-[filter,opacity] duration-300',
										dimmed && 'opacity-30 brightness-65'
									)}
									style={{
										height: trackHeight,
										width: TILE_WIDTH,
										backgroundImage: `
										linear-gradient(45deg, var(--the-race-bg-from) 25%, transparent 25%),
										linear-gradient(-45deg, var(--the-race-bg-from) 25%, transparent 25%),
										linear-gradient(45deg, transparent 75%, var(--the-race-bg-from) 75%),
										linear-gradient(-45deg, transparent 75%, var(--the-race-bg-from) 75%)
									`,
										backgroundSize: '75px 75px',
										backgroundPosition: '0 0, 0 37px, 37px -37px, -37px 0px',
										backgroundColor: 'var(--the-race-white-from)'
									}}
								/>
							);
						}
						const isRed = i % 2 !== 0;
						return (
							<div
								key={i}
								className={cn(
									'shrink-0 bg-linear-to-b transition-[filter,opacity] duration-300 last:rounded-r-xl',
									isRed
										? 'from-the-race-red-from to-the-race-red-to'
										: 'from-the-race-white-from to-the-race-white-to',
									dimmed && 'opacity-30 brightness-65'
								)}
								style={{ width: TILE_WIDTH, height: trackHeight }}
							/>
						);
					})}
				</div>
				<AnimatePresence>
					{state.cars.map((car) => {
						const lane = carLane.get(car.id) ?? 0;
						const carDimmed = focusActive && !activeCarIds.has(car.id);
						// Played-card overlay: the card(s) this car just played sit on top of it,
						// mounted inside the motion piece below so they ride along when the play
						// moves the car. A challenge shows both duellists' hands (the winner
						// emphasised — both on a tie); a discard/extend shows the single focal
						// card. The held frame carries the post-move position, so the move
						// animates from this car's previous render.
						const isChallenger = challenge?.challengerCarId === car.id;
						const isDefender = challenge?.defenderCarId === car.id;
						const revealCards = reveal?.cards[car.id];
						let playedCards: Card[] | null = null;
						let emphasized = false;
						if (isChallenger || isDefender) {
							playedCards = isChallenger ? challenge!.challengerCards : challenge!.defenderCards;
							emphasized =
								challenge!.outcome === 'tie'
									? true
									: challenge!.outcome === 'challenger'
										? isChallenger
										: isDefender;
						} else if (revealCards && revealCards.length > 0) {
							// A solo discard/extend — its own focal play, so always emphasised.
							playedCards = revealCards;
							emphasized = true;
						}
						// Hold any move this car makes (an extend forward, a won challenge's swap)
						// back a beat so the card reveal plays first, then the car — carrying the
						// cards — slides to its new spot. A play that moves no car ignores it.
						const delay = gridReveal
							? ((gridRank.get(car.id) ?? 0) * GRID_REVEAL_STAGGER_MS) / 1000
							: playedCards
								? REVEAL_MOVE_DELAY_MS / 1000
								: 0;
						return (
							<motion.div
								key={car.id}
								layout
								initial={false}
								animate={{
									x: holdAtStart ? 0 : (car.position + 1) * TILE_WIDTH,
									y: lane * LANE_HEIGHT
								}}
								transition={{ type: 'tween', duration: CAR_MOVE_MS / 1000, ease: CAR_EASE, delay }}
								style={{ width: TILE_WIDTH, height: LANE_HEIGHT }}
								className={cn(
									'absolute top-0 left-0 flex items-center justify-center transition-[filter,opacity] duration-300',
									carDimmed && 'brightness-45'
								)}
							>
								{playedCards && <PlayedCardStack cards={playedCards} emphasized={emphasized} />}
								<CarPiece className="w-36" liveryId={car.liveryId} />
							</motion.div>
						);
					})}
				</AnimatePresence>
			</div>
		</div>
	);
}
