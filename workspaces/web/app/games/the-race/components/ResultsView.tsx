import { Button } from '~/components/ui/button';
import { TheRaceLogo } from './TheRaceLogo';
import { DriversChampionship, ConstructorsChampionship } from './ChampionshipStandings';
import { ChampionsBanner } from './ChampionsBanner';
import { RacePodium } from './RacePodium';
import { DriverOfTheDayBadge } from './DriverOfTheDayBadge';
import { RaceClassification } from './RaceClassification';
import { ResultsMatrix } from './ResultsMatrix';
import { RunningPointsTable } from './RunningPointsTable';
import { SeasonStatTable } from './SeasonStatTable';
import { driverOfTheDay } from '../engine/results';
import { TOTAL_RACES } from '../engine/season';
import type { RaceSession } from '../hooks/useRaceSession';

interface ResultsViewProps {
	session: RaceSession;
}

export function ResultsView({ session }: ResultsViewProps) {
	const { state, playerId, advanceRace, newSeason } = session;
	if (!state) return null;

	const me = state.players.find((p) => p.id === playerId);
	const isHost = me?.isHost ?? false;
	const myCarIds = new Set(me?.carIds ?? []);
	const myTeamIds = new Set(state.cars.filter((c) => myCarIds.has(c.id)).map((c) => c.teamId));

	const carLiveries = Object.fromEntries(state.cars.map((c) => [c.id, c.liveryId]));

	const sortedScores = [...(state.finalScores ?? [])].sort((a, b) => a.rank - b.rank);
	const dotd = driverOfTheDay(state);

	// ─── Season ──────────────────────────────────────────────────────────────
	const season = state.season;
	const driverStandings = season?.driverStandings ?? [];
	const constructorStandings = season?.constructorStandings;
	const isComplete = season?.isComplete ?? false;
	const raceNumber = season?.raceNumber ?? 1;
	const totalRaces = season?.totalRaces ?? TOTAL_RACES;
	const driversChampion = driverStandings[0];
	const constructorsChampion = constructorStandings?.[0];

	return (
		<div className="flex h-dvh scrollbar-none flex-col items-center gap-8 overflow-y-auto p-6 text-the-race-white-from sm:p-10">
			<div className="flex flex-col items-center gap-1">
				<TheRaceLogo />
				<p className="text-xl font-bold tracking-[0.15em] text-the-race-white-to uppercase">
					{isComplete ? 'Season Finale' : `Race ${raceNumber} of ${totalRaces}`}
				</p>
				<div className="p-2">
					{isHost ? (
						<Button
							onClick={isComplete ? newSeason : advanceRace}
							variant="the-race-red"
							size="lg"
							className="font-bold tracking-wide"
						>
							{isComplete ? 'New Season' : 'Next Race'}
						</Button>
					) : (
						<p className="text-sm text-the-race-white-to">
							{isComplete
								? 'Waiting for host to start a new season…'
								: 'Waiting for host to start the next race…'}
						</p>
					)}
				</div>
			</div>

			{/* Champions (finale only) */}
			{isComplete && driversChampion && (
				<ChampionsBanner
					driversChampion={driversChampion}
					constructorsChampion={constructorsChampion}
					carLiveries={carLiveries}
				/>
			)}

			{/* ─── This Race ─────────────────────────────────────────────── */}
			<section className="flex w-full max-w-md flex-col items-center gap-5">
				<RacePodium scores={sortedScores} carLiveries={carLiveries} myCarIds={myCarIds} />
				<DriverOfTheDayBadge dotd={dotd} carLiveries={carLiveries} />
				<RaceClassification
					scores={sortedScores}
					cars={state.cars}
					players={state.players}
					carLiveries={carLiveries}
					myCarIds={myCarIds}
				/>
			</section>

			{/* ─── Season so far ─────────────────────────────────────────── */}
			<DriversChampionship
				standings={driverStandings}
				myCarIds={myCarIds}
				crownLeader={isComplete}
			/>
			{constructorStandings && (
				<ConstructorsChampionship
					standings={constructorStandings}
					carLiveries={carLiveries}
					myTeamIds={myTeamIds}
					crownLeader={isComplete}
				/>
			)}

			{/* ─── Season tables ─────────────────────────────────────────── */}
			{season && season.races.length > 0 && (
				<>
					<ResultsMatrix
						races={season.races}
						carLiveries={carLiveries}
						totalRaces={totalRaces}
						myCarIds={myCarIds}
					/>
					<RunningPointsTable
						races={season.races}
						carLiveries={carLiveries}
						totalRaces={totalRaces}
						myCarIds={myCarIds}
					/>
					<SeasonStatTable races={season.races} carLiveries={carLiveries} myCarIds={myCarIds} />
				</>
			)}
		</div>
	);
}
