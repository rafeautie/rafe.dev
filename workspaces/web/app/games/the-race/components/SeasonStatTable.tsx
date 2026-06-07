import { CarBadge } from './CarBadge';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { statLeaders } from '../engine/season';
import { cn } from '~/lib/utils';
import type { RaceResult } from '../engine/types';

interface Props {
	races: RaceResult[];
	carLiveries: Record<number, number>;
	myCarIds: Set<number>;
}

const COLUMNS = [
	{ key: 'wins', label: 'Wins' },
	{ key: 'overtakes', label: 'OT' },
	{ key: 'defenses', label: 'DEF' },
	{ key: 'placesGained', label: '+/−' }
] as const;

// Per-driver Season aggregates; the leader of each column is emphasised.
export function SeasonStatTable({ races, carLiveries, myCarIds }: Props) {
	const rows = statLeaders(races, carLiveries);
	if (rows.length === 0) return null;

	// Per-column leading value (only highlighted when strictly positive).
	const leaders = Object.fromEntries(
		COLUMNS.map((col) => [col.key, Math.max(...rows.map((r) => r[col.key]))])
	) as Record<(typeof COLUMNS)[number]['key'], number>;

	return (
		<Card variant="the-race-bg" size="sm" className="w-full max-w-md shrink-0">
			<CardHeader className="text-xs tracking-wider text-the-race-white-to uppercase">
				<h2>Season stats</h2>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-xs text-the-race-white-to">
								<th className="py-1 pr-2 text-left font-medium"> </th>
								{COLUMNS.map((col) => (
									<th key={col.key} className="px-2 py-1 text-right font-medium">
										{col.label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const isMine = myCarIds.has(row.carId);
								return (
									<tr
										key={row.carId}
										className={cn('border-t border-white/5', isMine && 'font-semibold')}
									>
										<td className="py-1.5 pr-2">
											<CarBadge
												liveryId={row.liveryId}
												className="size-6 min-w-6 text-xs leading-6"
											/>
										</td>
										{COLUMNS.map((col) => {
											const value = row[col.key];
											const isLeader = leaders[col.key] > 0 && value === leaders[col.key];
											return (
												<td
													key={col.key}
													className={cn(
														'px-2 py-1.5 text-right tabular-nums',
														isLeader && 'font-bold text-the-race-accent'
													)}
												>
													{col.key === 'placesGained' && value > 0 ? `+${value}` : value}
												</td>
											);
										})}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}
