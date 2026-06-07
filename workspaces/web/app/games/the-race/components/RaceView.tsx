import { TrackView } from './TrackView';
import { HandView } from './HandView';
import { ActionView } from './ActionView';
import { StandingsView } from './StandingsView';
import { GameLog } from './GameLog';
import type { RaceSession } from '../hooks/useRaceSession';

interface RaceViewProps {
	session: RaceSession;
}

export function RaceView({ session }: RaceViewProps) {
	const {
		state,
		view,
		reveal,
		challengeReveal,
		gridReveal,
		setSelectedCarId,
		selectMain,
		toggleRedline,
		qualify,
		discard,
		extend,
		challenge
	} = session;

	if (!state || !view) return null;

	return (
		<div className="flex h-dvh scrollbar-none flex-col gap-5 overflow-y-scroll p-5">
			<div className="flex justify-between gap-5">
				<StandingsView
					state={state}
					activeCarIds={view.activeCarIds}
					pendingChallenge={state.pendingChallenge}
					myCarIds={view.myCarIds}
					reveal={reveal}
				/>
				<GameLog log={state.log} cars={state.cars} className="w-70" />
			</div>
			<div className="flex flex-1 items-center">
				<TrackView
					state={state}
					holdAtStart={view.holdAtStart}
					reveal={reveal}
					challenge={challengeReveal}
					gridReveal={gridReveal}
				/>
			</div>
			<div className="flex items-end gap-5">
				<HandView
					selectedMainId={view.mainCardId}
					pairRedlineId={view.pairCardId}
					canPairRedline={view.canPairRedline}
					myCars={view.myCars}
					selectedCarId={view.selectedCarId}
					onSelectCar={setSelectedCarId}
					onSelectMain={selectMain}
					onToggleRedlinePair={toggleRedline}
					activeCarIds={view.carsNeedingCard}
				/>

				<ActionView
					className="h-74 min-w-70"
					actions={
						view.isQualifying
							? [{ label: 'Qualify', onClick: qualify, disabled: !view.canQualify }]
							: [
									{
										label: 'Discard',
										variant: 'the-race-white',
										onClick: discard,
										disabled: !view.canDiscard
									},
									{
										label: 'Extend',
										variant: 'the-race-white',
										onClick: extend,
										disabled: !view.canExtend
									},
									{
										label: view.challengeLabel,
										variant: 'the-race-red',
										onClick: challenge,
										disabled: !view.canChallenge
									}
								]
					}
					selectedCards={view.selectedCards}
				/>
			</div>
		</div>
	);
}
