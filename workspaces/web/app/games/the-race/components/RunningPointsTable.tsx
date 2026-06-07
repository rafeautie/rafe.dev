import { SeasonGrid } from './SeasonGrid';
import { runningPoints } from '../engine/season';
import type { RaceResult } from '../engine/types';

interface Props {
	races: RaceResult[];
	carLiveries: Record<number, number>;
	totalRaces: number;
	myCarIds: Set<number>;
}

// driver × Race cumulative championship points — the title fight over the Season.
export function RunningPointsTable({ races, carLiveries, totalRaces, myCarIds }: Props) {
	const rows = runningPoints(races, carLiveries).map((r) => ({
		carId: r.carId,
		liveryId: r.liveryId,
		cells: r.cumulative
	}));
	return (
		<SeasonGrid
			title="Points progression"
			raceCount={totalRaces}
			rows={rows}
			myCarIds={myCarIds}
			emptyGlyph="·"
		/>
	);
}
