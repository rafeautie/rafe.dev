import { CarBadge } from './CarBadge';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { cn } from '~/lib/utils';

export interface SeasonGridRow {
	carId: number;
	liveryId: number;
	/** One value per completed Race; missing trailing Races render as the empty glyph. */
	cells: number[];
	/** Optional trailing total (e.g. Season points), shown when `totalHeader` is set. */
	total?: number;
}

interface SeasonGridProps {
	title: string;
	/** Number of Race columns (R1…RraceCount); cells beyond a row's length show `emptyGlyph`. */
	raceCount: number;
	rows: SeasonGridRow[];
	myCarIds: Set<number>;
	/** Placeholder for a Race a driver hasn't run yet ('–', '·', …). */
	emptyGlyph: string;
	/** When set, a trailing column header + per-row `total` cell are rendered. */
	totalHeader?: string;
}

// The shared driver × Race numeric grid behind the results matrix and the points
// progression — same shell, different cell values + glyph.
export function SeasonGrid({
	title,
	raceCount,
	rows,
	myCarIds,
	emptyGlyph,
	totalHeader
}: SeasonGridProps) {
	if (rows.length === 0) return null;
	const cols = Array.from({ length: raceCount }, (_, i) => i);

	return (
		<Card variant="the-race-bg" className="w-full max-w-md shrink-0">
			<CardHeader className="text-xs tracking-wider text-the-race-white-to uppercase">
				<h2>{title}</h2>
			</CardHeader>
			<CardContent>
				<table className="w-full text-sm">
					<thead>
						<tr className="text-xs text-the-race-white-to">
							<th className="py-1 pr-2 text-left font-medium"> </th>
							{cols.map((c) => (
								<th key={c} className="px-1.5 py-1 text-center font-medium tabular-nums">
									R{c + 1}
								</th>
							))}
							{totalHeader && <th className="py-1 pl-2 text-right font-semibold">{totalHeader}</th>}
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
									{cols.map((c) => {
										const value = row.cells[c];
										return (
											<td key={c} className="px-1.5 py-1.5 text-center tabular-nums">
												{value === undefined ? (
													<span className="text-the-race-white-to/30">{emptyGlyph}</span>
												) : (
													value
												)}
											</td>
										);
									})}
									{totalHeader && (
										<td className="py-1.5 pl-2 text-right font-semibold tabular-nums">
											{row.total}
										</td>
									)}
								</tr>
							);
						})}
					</tbody>
				</table>
			</CardContent>
		</Card>
	);
}
