// ─── Season rollups (pure, no React) ──────────────────────────────────────────
//
// A Season is a per-Race, per-car fact table carried on GameState (ADR 0005). The
// engine appends one RaceResult as each Race ends; everything the results screen
// shows about the Season is derived here from that fact table:
//   • driverStandings / constructorStandings — the Championship tables
//   • resultsMatrix      — driver × Race finishing positions (+ Season total)
//   • runningPoints      — driver × Race cumulative championship points
//   • statLeaders        — per driver: wins, overtakes, defenses, places gained
//
// Standings order follows the Championship Tiebreak (CONTEXT.md): points →
// countback (most wins, then P2s, …) → head-to-head (ahead in more Races) → a
// stable id fallback, so there is always exactly one champion.

import type {
	ConstructorStanding,
	DriverStanding,
	RaceCarResult,
	RaceResult,
	SeasonState
} from './types';
import { livery, liveryTeamId } from './liveries';

export const TOTAL_RACES = 7;

// ─── Accrual ───────────────────────────────────────────────────────────────────

export function emptySeason(totalRaces: number = TOTAL_RACES): SeasonState {
	return { totalRaces, races: [] };
}

/** Append one completed Race's fact-table rows (immutable). */
export function accrueRace(season: SeasonState, rows: RaceCarResult[]): SeasonState {
	return { ...season, races: [...season.races, { results: rows }] };
}

export function isComplete(season: SeasonState): boolean {
	return season.races.length >= season.totalRaces;
}

// ─── Standings ─────────────────────────────────────────────────────────────────

/** Per-Race lookup of each car's finishing rank — drives countback + head-to-head. */
function rankByRace(races: RaceResult[]): Array<Map<number, number>> {
	return races.map((r) => new Map(r.results.map((row) => [row.carId, row.rank])));
}

/**
 * The Drivers' Championship: Season points per car, ordered by the Championship
 * Tiebreak. Returns [] before any Race has completed.
 */
export function driverStandings(
	races: RaceResult[],
	carLiveries: Record<number, number>
): DriverStanding[] {
	const fieldSize = Math.max(...races.map((r) => r.results.length), 1);
	const ranks = rankByRace(races);

	// Aggregate points + a finish-count histogram (index 0 = wins, 1 = P2s, …) per car.
	const agg = new Map<number, { points: number; counts: number[] }>();
	for (const r of races)
		for (const row of r.results) {
			let a = agg.get(row.carId);
			if (!a) {
				a = { points: 0, counts: new Array(fieldSize).fill(0) };
				agg.set(row.carId, a);
			}
			a.points += row.points;
			if (row.rank >= 1 && row.rank <= fieldSize) a.counts[row.rank - 1]++;
		}

	// Head-to-head: races where x finished ahead of y vs. the reverse.
	const headToHead = (x: number, y: number): number => {
		let xAhead = 0;
		let yAhead = 0;
		for (const m of ranks) {
			const rx = m.get(x);
			const ry = m.get(y);
			if (rx === undefined || ry === undefined) continue;
			if (rx < ry) xAhead++;
			else if (ry < rx) yAhead++;
		}
		return yAhead - xAhead; // x ahead more → negative → x first
	};

	return [...agg.entries()]
		.sort(([x, ax], [y, ay]) => {
			if (ax.points !== ay.points) return ay.points - ax.points;
			for (let k = 0; k < fieldSize; k++)
				if (ax.counts[k] !== ay.counts[k]) return ay.counts[k] - ax.counts[k];
			const h = headToHead(x, y);
			if (h !== 0) return h;
			return x - y;
		})
		.map(([id, a]) => ({
			carId: id,
			liveryId: carLiveries[id] ?? id,
			points: a.points,
			wins: a.counts[0]
		}));
}

/** Sum of a team's cars' points in one Race — the team head-to-head signal. */
function teamPointsByRace(races: RaceResult[], teamCarIds: Set<number>): number[] {
	return races.map((r) =>
		r.results.reduce((sum, row) => (teamCarIds.has(row.carId) ? sum + row.points : sum), 0)
	);
}

/**
 * The Constructors' Championship: each team's two cars' points summed. Independent
 * of the Drivers' title (a steady pair can beat a lone star). Grouped from the
 * driver standings, so a team inherits its cars' points/wins; ties break on wins,
 * then head-to-head on per-Race team points, then a stable team id.
 */
export function constructorStandings(
	races: RaceResult[],
	carLiveries: Record<number, number>
): ConstructorStanding[] {
	const teams = new Map<number, ConstructorStanding>();
	for (const d of driverStandings(races, carLiveries)) {
		const teamId = liveryTeamId(d.liveryId);
		let t = teams.get(teamId);
		if (!t) {
			t = { teamId, teamName: livery(d.liveryId).teamName, carIds: [], points: 0, wins: 0 };
			teams.set(teamId, t);
		}
		t.carIds.push(d.carId);
		t.points += d.points;
		t.wins += d.wins;
	}

	const list = [...teams.values()];
	const racePts = new Map(list.map((t) => [t.teamId, teamPointsByRace(races, new Set(t.carIds))]));
	return list.sort((a, b) => {
		if (a.points !== b.points) return b.points - a.points;
		if (a.wins !== b.wins) return b.wins - a.wins;
		const pa = racePts.get(a.teamId) ?? [];
		const pb = racePts.get(b.teamId) ?? [];
		let aAhead = 0;
		let bAhead = 0;
		for (let i = 0; i < races.length; i++) {
			if (pa[i] > pb[i]) aAhead++;
			else if (pb[i] > pa[i]) bAhead++;
		}
		if (aAhead !== bAhead) return bAhead - aAhead;
		return a.teamId - b.teamId;
	});
}

// ─── Tabular analytics (all rows in Championship order) ────────────────────────

export interface MatrixRow {
	carId: number;
	liveryId: number;
	/** Finishing position per completed Race; index matches the Race order. */
	positions: number[];
	/** Season points total. */
	total: number;
}

export interface RunningRow {
	carId: number;
	liveryId: number;
	/** Cumulative championship points after each completed Race. */
	cumulative: number[];
}

export interface StatRow {
	carId: number;
	liveryId: number;
	wins: number;
	overtakes: number;
	defenses: number;
	placesGained: number;
}

/** driver × Race finishing positions, with a Season-points total. */
export function resultsMatrix(
	races: RaceResult[],
	carLiveries: Record<number, number>
): MatrixRow[] {
	const ranks = rankByRace(races);
	return driverStandings(races, carLiveries).map((d) => ({
		carId: d.carId,
		liveryId: d.liveryId,
		positions: ranks.flatMap((m) => {
			const r = m.get(d.carId);
			return r === undefined ? [] : [r];
		}),
		total: d.points
	}));
}

/** driver × Race cumulative championship points. */
export function runningPoints(
	races: RaceResult[],
	carLiveries: Record<number, number>
): RunningRow[] {
	const pts = races.map((r) => new Map(r.results.map((row) => [row.carId, row.points])));
	return driverStandings(races, carLiveries).map((d) => {
		let acc = 0;
		const cumulative = pts.map((m) => {
			acc += m.get(d.carId) ?? 0;
			return acc;
		});
		return { carId: d.carId, liveryId: d.liveryId, cumulative };
	});
}

/** Grid rank within one Race: 1 = pole (highest gridPosition). */
function gridRanks(results: RaceCarResult[]): Map<number, number> {
	const sorted = [...results].sort((a, b) => b.gridPosition - a.gridPosition);
	return new Map(sorted.map((row, i) => [row.carId, i + 1]));
}

/** Per-driver Season aggregates: wins, overtakes, defenses, places gained. */
export function statLeaders(races: RaceResult[], carLiveries: Record<number, number>): StatRow[] {
	const order = driverStandings(races, carLiveries);
	const acc = new Map(order.map((d) => [d.carId, { overtakes: 0, defenses: 0, placesGained: 0 }]));
	for (const r of races) {
		const grid = gridRanks(r.results);
		for (const row of r.results) {
			const a = acc.get(row.carId);
			if (!a) continue;
			a.overtakes += row.overtakes;
			a.defenses += row.defensesHeld;
			const gr = grid.get(row.carId);
			if (gr !== undefined) a.placesGained += gr - row.rank;
		}
	}
	return order.map((d) => ({
		carId: d.carId,
		liveryId: d.liveryId,
		wins: d.wins,
		...(acc.get(d.carId) ?? { overtakes: 0, defenses: 0, placesGained: 0 })
	}));
}
