// ─── Per-Race results aggregation (pure, no React) ────────────────────────────
//
// Client-side helpers over a single Race's finalScores for the results screen:
// detect Team Mode and pick that Race's Driver of the Day. Season-wide rollups —
// the Championship standings, results matrix, and stats — live in season.ts.

import type { DriverOfTheDay, PublicGameState } from './types';

/** True when any player controls more than one car — i.e. Team Mode. */
export function isTeamMode(state: PublicGameState): boolean {
	return state.players.some((p) => p.carIds.length > 1);
}

/**
 * The Driver of the Day: the car that gained the most places between its
 * starting grid slot and its finish, tie-broken by overtakes. Returns null when
 * no car finished ahead of where it started — a hollow award is worse than none.
 */
export function driverOfTheDay(state: PublicGameState): DriverOfTheDay | null {
	const scores = state.finalScores ?? [];
	if (scores.length === 0) return null;

	// Grid rank: 1 = pole (the highest starting grid position).
	const gridOrder = [...state.cars].sort((a, b) => b.gridPosition - a.gridPosition);
	const gridRank = new Map(gridOrder.map((c, i) => [c.id, i + 1]));
	const finalRank = new Map(scores.map((s) => [s.carId, s.rank]));
	const overtakesOf = new Map(state.cars.map((c) => [c.id, c.overtakes]));

	let best: DriverOfTheDay | null = null;
	for (const car of state.cars) {
		const gr = gridRank.get(car.id);
		const fr = finalRank.get(car.id);
		if (gr === undefined || fr === undefined) continue;
		const placesGained = gr - fr;
		if (placesGained <= 0) continue;
		const better =
			best === null ||
			placesGained > best.placesGained ||
			(placesGained === best.placesGained &&
				(overtakesOf.get(car.id) ?? 0) > (overtakesOf.get(best.carId) ?? 0));
		if (better) best = { carId: car.id, placesGained };
	}
	return best;
}
