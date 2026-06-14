import { Crown } from 'lucide-react';
import { CarBadge } from './CarBadge';
import { TeamSwatch } from './TeamSwatch';
import { livery } from '../engine/liveries';
import type { ConstructorStanding, DriverStanding } from '../engine/types';

interface Props {
	driversChampion: DriverStanding;
	constructorsChampion?: ConstructorStanding;
	carLiveries: Record<number, number>;
}

/** Finale-only banner crowning the Season's Drivers' (and, in Team Mode,
 *  Constructors') Champions. */
export function ChampionsBanner({ driversChampion, constructorsChampion, carLiveries }: Props) {
	const driverLiv = livery(driversChampion.liveryId);
	return (
		<div className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-the-race-accent/10 p-5 ring-1 ring-the-race-accent/40 ring-inset">
			<div className="flex items-center gap-2 text-the-race-accent">
				<Crown className="size-5" />
				<span className="text-xs tracking-[0.2em] uppercase">Champions</span>
			</div>
			<div className="flex items-center gap-3">
				<CarBadge liveryId={driversChampion.liveryId} className="size-10 text-lg" />
				<div className="flex min-w-0 flex-col">
					<span className="text-[10px] tracking-wider text-the-race-white-to uppercase">
						Drivers&rsquo; Champion
					</span>
					<span className="truncate text-lg font-bold">Car #{driverLiv.number}</span>
					<span className="truncate text-xs text-the-race-white-to">
						{driverLiv.teamName} · {driversChampion.points} pts
					</span>
				</div>
			</div>
			{constructorsChampion && (
				<div className="flex items-center gap-3 border-t border-the-race-accent/20 pt-3">
					<TeamSwatch
						standing={constructorsChampion}
						carLiveries={carLiveries}
						className="size-10"
					/>
					<div className="flex min-w-0 flex-col">
						<span className="text-[10px] tracking-wider text-the-race-white-to uppercase">
							Constructors&rsquo; Champion
						</span>
						<span className="truncate text-lg font-bold">{constructorsChampion.teamName}</span>
						<span className="truncate text-xs text-the-race-white-to">
							{constructorsChampion.points} pts
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
