import { SeasonGrid } from './SeasonGrid';
import { resultsMatrix } from '../engine/season';
import type { RaceResult } from '../engine/types';

interface Props {
	races: RaceResult[];
	carLiveries: Record<number, number>;
	totalRaces: number;
	myCarIds: Set<number>;
}

// driver × Race finishing positions, in Championship order, with a Season total.
export function ResultsMatrix({ races, carLiveries, totalRaces, myCarIds }: Props) {
	const rows = resultsMatrix(races, carLiveries).map((r) => ({
		carId: r.carId,
		liveryId: r.liveryId,
		cells: r.positions,
		total: r.total
	}));
	return (
		<SeasonGrid
			title="Results"
			raceCount={totalRaces}
			rows={rows}
			myCarIds={myCarIds}
			emptyGlyph="–"
			totalHeader="Pts"
		/>
	);
}
