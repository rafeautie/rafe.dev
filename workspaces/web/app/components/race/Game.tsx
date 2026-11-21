import { FlagIcon, RadioIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from '~/components/Link';
import type { Market, Pools } from '~/lib/race/betting';
import type { Bet, RoomState, Standing, ToRoom } from '~/lib/race/room';
import { FRAME } from './Bar';
import { Bets } from './Bets';
import { Board } from './Board';
import { Extras } from './Extras';
import { Results } from './Results';
import { Empty, type Running, type Tick } from './shared';
import { Slip } from './Slip';
import { Strip } from './Strip';
import { Tower } from './Tower';

// The game around the race. Principles it is built to, for this spectator
// betting game (one shared race every ~2 minutes: 45 s betting, ~65 s race,
// 15 s results). Keep to them when changing anything here.
//
//  1. One job per phase. Betting: the car board and the slip. Racing: the
//     track and the running order. Results: your net, then the finishing
//     order. Whatever is not that job is quiet.
//  2. One primary action, and it is always one button: Place bet. It is the
//     only filled control on the slip besides the selected stake.
//  3. Glanceable in a second during the race. Big place numbers, names not
//     paragraphs, motion only where something moved (rows slide on a pass).
//  4. Fixed regions. One header row is on top (phase, clock, chips, sound,
//     theme), the track on the left, the phase panel on the right, your bets under the track, the rest below that.
//     Phases change what is inside a region, never where the regions are, so
//     the eye learns where to look and nothing jumps.
//  5. Every action is answered at the place it was made: a bet shows "Placed
//     ..." under the button and a new row in your bets; a refusal shows its
//     reason in the same line, which has room reserved so nothing shifts.
//  6. Every outcome is answered too: balances glide, odds glide, and the
//     result is one signed number, "+111" or "-50", before any detail.
//  7. The countdown is a number and a thin bar. It changes character in the
//     last ten seconds (colour and "last call"), not by flashing or shaking:
//     urgency without anxiety.
//  8. Numbers are tabular, grouped and signed, with a real minus sign, and
//     they do not change width as they change.
//  9. Colour is a car's identity, never its only one: each car also has its
//     number on its tile and its name beside it. Good and bad are told by
//     words and signs as well as by colour ("In the money", "+", "-").
// 10. Restraint. Flat, typographic, the site's tokens in both themes. No
//     chrome, gradients, emoji or sound effects that compete with the race.
// 11. Keyboard first-class: every control is a real button, tab or input
//     with a visible focus ring; the cars on the board are buttons and the
//     tabs take arrow keys; dialogs trap focus. Status and refusals are
//     announced through live regions.
// 12. Respect prefers-reduced-motion: gliding numbers jump, rows stop
//     sliding, entrances do not animate.

type Props = {
	room: RoomState | null;
	left: number;
	pools: Pools | null;
	you: Standing | null;
	bets: Bet[];
	board: Standing[];
	ticker: Tick[];
	problem: string | null;
	running: Running | null;
	sound: boolean;
	setSound: (on: boolean) => void;
	send: (message: ToRoom) => boolean;
	/** The race itself. */
	children: ReactNode;
};

export function Game({
	room,
	left,
	pools,
	you,
	bets,
	board,
	ticker,
	problem,
	running,
	sound,
	setSound,
	send,
	children
}: Props) {
	// what is being chosen, kept here because the board and the slip choose together
	const [market, setMarket] = useState<Market>('win');
	const [outcome, setOutcome] = useState<string | null>(null);
	const [stake, setStake] = useState(50);

	return (
		<div className={`${FRAME} flex flex-col gap-4`}>
			<Strip
				room={room}
				left={left}
				running={running}
				you={you}
				problem={problem}
				send={send}
				sound={sound}
				setSound={setSound}
			/>
			<div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_var(--rail)]">
				<div className="flex min-w-0 flex-col gap-4">
					{children}
					{room && pools && <Bets room={room} pools={pools} bets={bets} running={running} />}
				</div>
				<aside
					aria-label="Phase"
					className="flex min-w-0 flex-col rounded-lg bg-foreground/[0.03] p-4"
				>
					{!room || !pools ? (
						<Empty icon={RadioIcon} title="Connecting…" hint="Joining the race" />
					) : room.phase === 'betting' ? (
						<div className="flex flex-col gap-4">
							<Board
								room={room}
								pools={pools}
								market={market}
								outcome={outcome}
								pick={(id) => setOutcome(id)}
							/>
							<Slip
								room={room}
								pools={pools}
								you={you}
								bets={bets}
								problem={problem}
								market={market}
								setMarket={setMarket}
								outcome={outcome}
								setOutcome={setOutcome}
								stake={stake}
								setStake={setStake}
								send={send}
							/>
						</div>
					) : room.phase === 'racing' ? (
						<div className="flex flex-col gap-4">
							<Tower running={running} ids={room.grid} bets={bets} />
							<p className="text-sm text-muted-foreground">Betting is closed for this race.</p>
						</div>
					) : room.phase === 'results' ? (
						<Results room={room} you={you} bets={bets} />
					) : (
						<Empty icon={FlagIcon} title="The next race starts soon." />
					)}
				</aside>
			</div>
			<div className="w-full">
				<Extras you={you} board={board} ticker={ticker} />
				<p className="pt-4 text-sm">
					<Link href="/race/sandbox" className="text-muted-foreground">
						sandbox
					</Link>
				</p>
			</div>
		</div>
	);
}
