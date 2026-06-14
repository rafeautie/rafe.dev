import { Crown } from 'lucide-react';
import { CarBadge } from './CarBadge';
import { YouChip } from './YouChip';
import { liveryOf } from '../engine/liveries';
import { cn } from '~/lib/utils';
import type { Score } from '../engine/types';

interface Props {
	/** The full classification, sorted by rank — the top 3 form the podium. */
	scores: Score[];
	carLiveries: Record<number, number>;
	myCarIds: Set<number>;
}

/** Stepped P2 · P1 · P3 podium, with the race winner tallest in the middle. */
export function RacePodium({ scores, carLiveries, myCarIds }: Props) {
	const podium = scores.slice(0, 3);
	const podiumOrder = [podium[1], podium[0], podium[2]].filter((s) => s !== undefined);
	if (podiumOrder.length === 0) return null;

	return (
		<div className="flex items-end justify-center gap-2 sm:gap-3">
			{podiumOrder.map((score) => {
				const liv = liveryOf(score.carId, carLiveries);
				const isWinner = score.rank === 1;
				const isMine = myCarIds.has(score.carId);
				const stepHeight = score.rank === 1 ? 168 : score.rank === 2 ? 128 : 100;

				return (
					<div key={score.carId} className="flex w-24 flex-col items-center sm:w-28">
						<Crown className={cn('mb-1 size-5 text-the-race-accent', !isWinner && 'invisible')} />
						<CarBadge liveryId={liv.id} className="size-9 text-base" />
						{isMine && <YouChip className="mt-1" />}
						<p className={cn('mt-1 text-center text-sm leading-tight', isWinner && 'font-bold')}>
							Car #{liv.number}
						</p>
						<p className="text-center text-xs text-the-race-white-to">{liv.teamName}</p>
						<p className="mt-0.5 text-xs font-semibold">{score.points} pts</p>
						<div
							className={cn(
								'mt-2 flex w-full items-start justify-center rounded-t-xl pt-6',
								isWinner ? 'ring-the-race-accent' : 'ring-white'
							)}
							style={{ height: stepHeight, backgroundColor: liv.primary, opacity: 0.85 }}
						>
							<span className="text-sm font-black text-white">P{score.rank}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
