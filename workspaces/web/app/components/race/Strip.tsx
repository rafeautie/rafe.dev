import { Volume2Icon, VolumeXIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, DialogTrigger } from '~/components/ui/dialog';
import { DEBT_CAP } from '~/lib/race/betting';
import { BETTING_MS, RESULTS_MS, type RoomState } from '~/lib/race/room';
import type { Standing, ToRoom } from '~/lib/race/room';
import { LAPS } from '~/lib/race/sim';
import { Bar, ClockFace, iconButton, type Segment } from './Bar';
import { Settings } from './Settings';
import { chips, signed, useTween, type Running } from './shared';

// What the header row holds: how long is left, what you have, and the sound. It never changes shape between phases; only its words do.

// The timeline's lengths in seconds: betting and results are the room's own,
// the race is about a minute.
const BET = BETTING_MS / 1000;
const RESULT = RESULTS_MS / 1000;
const RACE = 65;

function Clock({
	room,
	left,
	running
}: {
	room: RoomState;
	left: number;
	running: Running | null;
}) {
	const phase = room.phase;
	const timed = phase === 'betting' || phase === 'results';
	// the last ten seconds of betting: the colour changes, nothing flashes
	const urgent = phase === 'betting' && left <= 10;
	const leader = running ? running.cars[running.order[0]] : null;
	const lap = leader ? Math.min(LAPS, Math.max(1, leader.lap + 1)) : 1;
	const raced = phase === 'racing' ? (leader?.fraction ?? 0) : phase === 'results' ? 1 : 0;
	const segments: Segment[] = [
		{
			name: 'Bet',
			weight: BET,
			fill: phase === 'betting' ? 1 - left / BET : phase === 'idle' ? 0 : 1,
			urgent
		},
		{ name: 'Race', weight: RACE, fill: raced },
		{ name: 'Result', weight: RESULT, fill: phase === 'results' ? 1 - left / RESULT : 0 }
	];
	return (
		<ClockFace
			small={phase === 'racing'}
			urgent={urgent}
			readout={
				timed
					? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
					: phase === 'racing'
						? `Lap ${lap}/${LAPS}`
						: '�:��'
			}
			caption={
				phase === 'betting'
					? urgent
						? 'last call'
						: 'to bet'
					: phase === 'racing'
						? 'racing'
						: phase === 'results'
							? 'next race'
							: 'waiting'
			}
			segments={segments}
		/>
	);
}

// Same size, shape and hover as the theme toggle beside it.
function SoundToggle({ sound, setSound }: { sound: boolean; setSound: (on: boolean) => void }) {
	const Icon = sound ? Volume2Icon : VolumeXIcon;
	return (
		<button
			type="button"
			aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
			aria-pressed={sound}
			onClick={() => setSound(!sound)}
			className={iconButton}
		>
			<Icon aria-hidden="true" strokeWidth={2} className="size-[18px]" />
		</button>
	);
}

/** How long a change in chips stays beside the balance. */
const DELTA_MS = 2500;

// What you have: chips and name, and, for a moment after a race settles, what
// it changed by. The change floats in the gap to the left, so nothing moves.
function Wallet({
	room,
	you,
	problem,
	send
}: {
	room: RoomState | null;
	you: Standing;
	problem: string | null;
	send: (message: ToRoom) => boolean;
}) {
	const balance = useTween(you.balance);
	const moving = Math.round(balance) !== you.balance;
	const debt = you.balance < 0;
	// what you had when this round began, and the change already announced for it;
	// kept in state so they are settled while rendering
	const round = room?.round ?? -1;
	const [start, setStart] = useState({ round, balance: you.balance });
	const [delta, setDelta] = useState<{ key: string; value: number; shown: boolean } | null>(null);
	if (start.round !== round) setStart({ round, balance: you.balance });
	// the round's net, told once it has settled: what you came out with less what you went in with
	const net = room?.phase === 'results' && start.round === round ? you.balance - start.balance : 0;
	const key = `${round}:${net}`;
	if (net !== 0 && delta?.key !== key) setDelta({ key, value: net, shown: true });
	const id = delta?.key;
	useEffect(() => {
		if (id === undefined) return;
		const timer = setTimeout(() => setDelta((d) => d && { ...d, shown: false }), DELTA_MS);
		return () => clearTimeout(timer);
	}, [id]);
	return (
		<div className="relative -mx-3">
			{delta && (
				<span
					aria-hidden="true"
					className={`pointer-events-none absolute top-1/2 right-full -translate-y-1/2 text-sm font-medium tabular-nums transition-opacity duration-500 motion-reduce:transition-none ${
						delta.value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
					} ${delta.shown ? 'opacity-100' : 'opacity-0'}`}
				>
					{signed(delta.value)}
				</span>
			)}
			<Dialog>
				<DialogTrigger
					render={
						<button
							type="button"
							aria-label={`Your wallet and settings: ${chips(you.balance)} chips, ${you.name}${you.bankruptcies > 0 ? `, bankrupt ${you.bankruptcies} time${you.bankruptcies === 1 ? '' : 's'}` : ''}`}
							className="flex h-11 max-w-full cursor-pointer items-center rounded-md px-3 text-left transition-colors outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
						/>
					}
				>
					<span className="flex min-w-0 flex-col gap-1">
						<span
							className={`block text-base leading-4 font-semibold tabular-nums transition-colors ${
								debt ? 'text-destructive' : moving ? 'text-muted-foreground' : ''
							}`}
						>
							{chips(balance)}
						</span>
						<span
							className={`block truncate text-xs leading-3 tabular-nums ${debt ? 'text-destructive' : 'text-muted-foreground'}`}
						>
							{debt ? `${chips(you.balance + DEBT_CAP)} credit left` : you.name}
							{you.bankruptcies > 0 && (
								<span
									title={`Bankrupt ${you.bankruptcies} time${you.bankruptcies === 1 ? '' : 's'}`}
								>
									{' '}
									�{you.bankruptcies}
								</span>
							)}
						</span>
					</span>
				</DialogTrigger>
				<Settings you={you} problem={problem} send={send} />
			</Dialog>
		</div>
	);
}

export function Strip({
	room,
	left,
	running,
	you,
	problem,
	send,
	sound,
	setSound
}: {
	room: RoomState | null;
	left: number;
	running: Running | null;
	you: Standing | null;
	problem: string | null;
	send: (message: ToRoom) => boolean;
	sound: boolean;
	setSound: (on: boolean) => void;
}) {
	return (
		<Bar
			clock={room ? <Clock room={room} left={left} running={running} /> : undefined}
			wallet={you && <Wallet room={room} you={you} problem={problem} send={send} />}
			sound={<SoundToggle sound={sound} setSound={setSound} />}
		/>
	);
}
