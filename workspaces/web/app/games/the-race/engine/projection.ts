import type {
	ProjectionDOState,
	PublicCarState,
	PublicGameState,
	PublicPlayer,
	PublicSeasonState,
	Score
} from './types';
import { liveryTeamId } from './liveries';
import { constructorStandings, driverStandings, isComplete } from './season';

// ─── toPublicState ─────────────────────────────────────────────────────────────
//
// Personalised state projection: the viewer's own cars get full hand contents;
// all other cars get handSize only. Challenge secrecy rules mirror the
// Qualifying Reveal pattern — neither side's committed cards are revealed until
// both have submitted; each player sees only their own committed cards.

export function toPublicState(doState: ProjectionDOState, viewerId?: string): PublicGameState {
	const gs = doState.gameState;

	const players: PublicPlayer[] = doState.players.map((pe) => {
		const enginePlayer = gs?.players.find((p) => p.id === pe.id);
		return {
			id: pe.id,
			name: pe.name,
			isHost: pe.isHost,
			connected: pe.connected,
			carIds: enginePlayer?.carIds ?? []
		};
	});

	let pendingChallenge: PublicGameState['pendingChallenge'];
	if (gs?.pendingChallenge) {
		const { challengerCarId, defenderCarId, challengerCards, defenderCards } = gs.pendingChallenge;
		const viewerOwnsChallengerCar = gs.players.some(
			(p) => p.id === viewerId && p.carIds.includes(challengerCarId)
		);
		const viewerOwnsDefenderCar = gs.players.some(
			(p) => p.id === viewerId && p.carIds.includes(defenderCarId)
		);
		pendingChallenge = {
			challengerCarId,
			defenderCarId,
			challengerCards: viewerOwnsChallengerCar ? challengerCards : undefined,
			defenderCards: viewerOwnsDefenderCar ? defenderCards : undefined,
			challengerCommitted: challengerCards !== undefined,
			defenderCommitted: defenderCards !== undefined
		};
	}

	const cars: PublicCarState[] = gs
		? gs.cars.map((c) => {
				const viewerOwnsCar = gs.players.some((p) => p.id === viewerId && p.carIds.includes(c.id));
				return {
					id: c.id,
					position: c.position,
					handSize: c.hand.length,
					hand: viewerOwnsCar ? c.hand : undefined,
					liveryId: doState.carLiveries[c.id] ?? c.id,
					teamId: liveryTeamId(doState.carLiveries[c.id] ?? c.id),
					// Race stats — defaulted so cars persisted before the feature still
					// project cleanly (grid falls back to the current position → 0 climb).
					overtakes: c.overtakes ?? 0,
					defensesHeld: c.defensesHeld ?? 0,
					gridPosition: c.gridPosition ?? c.position,
					// During qualifying, reveal the viewer's own locked-in selection
					qualifyingCards:
						viewerOwnsCar && doState.phase === 'qualifying' ? gs.qualifyingCards[c.id] : undefined
				};
			})
		: [];

	// ─── Season projection ───────────────────────────────────────────────────
	const season = gs?.season;
	const carLiveries = doState.carLiveries;
	const teamMode = gs?.players.some((p) => p.carIds.length > 1) ?? false;
	const lastRace = season?.races[season.races.length - 1];

	const publicSeason: PublicSeasonState | undefined = season
		? {
				totalRaces: season.totalRaces,
				racesCompleted: season.races.length,
				// In results, the just-finished Race; otherwise the in-progress one.
				raceNumber: doState.phase === 'results' ? season.races.length : season.races.length + 1,
				isComplete: isComplete(season),
				races: season.races,
				driverStandings: driverStandings(season.races, carLiveries),
				constructorStandings: teamMode ? constructorStandings(season.races, carLiveries) : undefined
			}
		: undefined;

	// The current Race's classification is the last accrued Race's rows — a single
	// source of truth, so no separately-stored finalScores.
	const finalScores: Score[] | undefined =
		doState.phase === 'results' && lastRace
			? lastRace.results.map((r) => ({ carId: r.carId, rank: r.rank, points: r.points }))
			: undefined;

	return {
		phase: doState.phase,
		players,
		cars,
		pendingThisRound: gs?.pendingThisRound ?? [],
		endAfterRound: gs?.endAfterRound ?? false,
		challengeWinsThisTurn: gs?.challengeWinsThisTurn ?? 0,
		pendingChallenge,
		qualifiedCarIds: gs ? Object.keys(gs.qualifyingCards).map(Number) : [],
		finalScores,
		season: publicSeason,
		log: doState.log
	};
}
