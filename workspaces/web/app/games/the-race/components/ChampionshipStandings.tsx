import { Crown } from 'lucide-react';
import { CarBadge } from './CarBadge';
import { YouChip } from './YouChip';
import { TeamSwatch } from './TeamSwatch';
import { standingRowClass } from './standingRow';
import { livery } from '../engine/liveries';
import { cn } from '~/lib/utils';
import type { ConstructorStanding, DriverStanding } from '../engine/types';

// The two Season title tables. Rows are pre-sorted into Championship order by
// season.ts; the leader is crowned only at the finale (crownLeader).

function ChampionBadge() {
	return (
		<span className="flex items-center gap-1 text-xs tracking-wider text-the-race-accent uppercase">
			<Crown className="size-3.5" />
			Champion
		</span>
	);
}

interface DriversProps {
	standings: DriverStanding[];
	myCarIds: Set<number>;
	crownLeader: boolean;
}

export function DriversChampionship({ standings, myCarIds, crownLeader }: DriversProps) {
	if (standings.length === 0) return null;
	return (
		<section className="flex w-full max-w-md flex-col gap-2">
			<h2 className="text-xs tracking-wider text-the-race-white-to uppercase">
				Drivers&rsquo; Championship
			</h2>
			<ul className="flex flex-col gap-1">
				{standings.map((d, i) => {
					const liv = livery(d.liveryId);
					const isMine = myCarIds.has(d.carId);
					const isChampion = crownLeader && i === 0;
					return (
						<li
							key={d.carId}
							className={cn(
								'flex items-center gap-3 rounded-xl px-3 py-2',
								standingRowClass(isChampion, isMine)
							)}
						>
							<span className="w-5 text-sm font-bold tabular-nums">{i + 1}</span>
							<CarBadge liveryId={d.liveryId} />
							<div className="flex min-w-0 flex-col">
								<div className="flex items-center gap-2">
									<span className={cn('truncate', isMine && 'font-semibold')}>
										Car #{liv.number}
									</span>
									{isMine && <YouChip />}
								</div>
								<span className="truncate text-xs text-the-race-white-to">{liv.teamName}</span>
							</div>
							<div className="ml-auto flex items-center gap-3">
								{isChampion && <ChampionBadge />}
								<div className="flex flex-col items-end">
									<span className="text-sm font-semibold tabular-nums">{d.points} pts</span>
									<span className="text-xs text-the-race-white-to tabular-nums">{d.wins} W</span>
								</div>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

interface ConstructorsProps {
	standings: ConstructorStanding[];
	carLiveries: Record<number, number>;
	myTeamIds: Set<number>;
	crownLeader: boolean;
}

export function ConstructorsChampionship({
	standings,
	carLiveries,
	myTeamIds,
	crownLeader
}: ConstructorsProps) {
	if (standings.length === 0) return null;
	return (
		<section className="flex w-full max-w-md flex-col gap-2">
			<h2 className="text-xs tracking-wider text-the-race-white-to uppercase">
				Constructors&rsquo; Championship
			</h2>
			<ul className="flex flex-col gap-1">
				{standings.map((t, i) => {
					const isMine = myTeamIds.has(t.teamId);
					const isChampion = crownLeader && i === 0;
					return (
						<li
							key={t.teamId}
							className={cn(
								'flex items-center gap-3 rounded-xl px-4 py-3',
								standingRowClass(isChampion, isMine)
							)}
						>
							<span className="w-5 text-sm font-bold tabular-nums">{i + 1}</span>
							<TeamSwatch standing={t} carLiveries={carLiveries} className="size-6" />
							<div className="flex min-w-0 flex-col">
								<div className="flex items-center gap-2">
									<span className="truncate font-semibold">{t.teamName}</span>
									{isMine && <YouChip />}
								</div>
								<span className="truncate text-xs text-the-race-white-to tabular-nums">
									{t.wins} W
								</span>
							</div>
							<div className="ml-auto flex items-center gap-3">
								{isChampion && <ChampionBadge />}
								<span className="text-sm font-semibold tabular-nums">{t.points} pts</span>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
