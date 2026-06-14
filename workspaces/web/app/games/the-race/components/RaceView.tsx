import { TrackView } from './TrackView';
import { HandView } from './HandView';
import { ActionView } from './ActionView';
import { LogView } from './LogView';
import { TurnBanner } from './TurnBanner';
import { turnPrompt } from '../engine/raceView';
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

	// The screen is a fixed h-dvh column that never scrolls: the standings/log
	// row and the hand row scale with viewport height (clamped in each
	// component), and the track absorbs whatever is left — zooming its lanes
	// down to fit — so the hand is never pushed off the bottom.
	return (
		<div className="flex h-dvh flex-col gap-5 overflow-hidden p-5">
			<div className="flex shrink-0 justify-between gap-5">
				<LogView state={state} />
				<TurnBanner prompt={turnPrompt(state, view.myCarIds)} className="min-w-0 flex-1" />
			</div>
			<div className="flex min-h-48 flex-1 flex-col overflow-hidden">
				<TrackView
					state={state}
					holdAtStart={view.holdAtStart}
					reveal={reveal}
					challenge={challengeReveal}
					gridReveal={gridReveal}
					className="h-full"
				/>
			</div>
			<div className="flex shrink-0 items-end gap-5">
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
					className="h-[clamp(13rem,28dvh,18.5rem)] min-w-70"
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
