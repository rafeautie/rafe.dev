import { CarBadge } from './CarBadge';
import { YouChip } from './YouChip';
import { standingRowClass } from './standingRow';
import { liveryOf } from '../engine/liveries';
import { cn } from '~/lib/utils';
import type { PublicCarState, PublicPlayer, Score } from '../engine/types';

interface Props {
	/** The full classification, sorted by rank. */
	scores: Score[];
	cars: PublicCarState[];
	players: PublicPlayer[];
	carLiveries: Record<number, number>;
	myCarIds: Set<number>;
}

/** The full finishing order with per-driver overtake/defence stats. */
export function RaceClassification({ scores, cars, players, carLiveries, myCarIds }: Props) {
	const carById = new Map(cars.map((c) => [c.id, c]));
	const playerByCarId = new Map(players.flatMap((p) => p.carIds.map((id) => [id, p] as const)));

	return (
		<ul className="flex w-full flex-col gap-1">
			{scores.map((score) => {
				const liv = liveryOf(score.carId, carLiveries);
				const car = carById.get(score.carId);
				const isMine = myCarIds.has(score.carId);
				return (
					<li
						key={score.carId}
						className={cn(
							'flex items-center gap-3 rounded-xl px-3 py-2',
							standingRowClass(false, isMine)
						)}
					>
						<span className="w-7 text-sm font-bold tabular-nums">P{score.rank}</span>
						<CarBadge liveryId={liv.id} />
						<div className="flex min-w-0 flex-col">
							<div className="flex items-center gap-2">
								<span className={cn('truncate', isMine && 'font-semibold')}>{liv.driverName}</span>
								{isMine && <YouChip />}
							</div>
							<span className="truncate text-xs text-the-race-white-to">
								{liv.teamName} · {playerByCarId.get(score.carId)?.name ?? '?'}
							</span>
						</div>
						<div className="ml-auto flex flex-col items-end">
							<span className="text-sm font-semibold">{score.points} pts</span>
							<span className="text-xs text-the-race-white-to tabular-nums">
								{car?.overtakes ?? 0} OT · {car?.defensesHeld ?? 0} DEF
							</span>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
