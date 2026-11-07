import { useEffect, useRef, useState } from 'react';
import { DAYS_PER_YEAR, SEASON_NAMES, SPEEDS, TICKS_PER_DAY, season } from '~/lib/civ/config';
import { useSim } from '~/lib/civ/use-sim';
import { useWritingTheme } from '~/lib/writing-theme';
import { Chronicle } from './Chronicle';
import { MapCanvas, type MapCanvasHandle } from './MapCanvas';
import { PersonPanel } from './PersonPanel';

// The /civ page once it's in the browser: the map, the clock and speed, the
// person being followed, and the chronicle. The world itself runs in a
// worker (lib/civ/sim/sim.worker.ts); this only shows it.

const SPEED_LABEL = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' } as const;

function newSeed() {
	return Math.floor(Math.random() * 2 ** 31);
}

export default function CivApp() {
	const [seed, setSeed] = useState(newSeed);
	// a new world starts everything below afresh
	return <World key={seed} seed={seed} onNewWorld={() => setSeed(newSeed())} />;
}

function World({ seed, onNewWorld }: { seed: number; onNewWorld: () => void }) {
	const dark = useWritingTheme();
	const sim = useSim(seed);
	const map = useRef<MapCanvasHandle>(null);
	const [followedId, setFollowedId] = useState<number | null>(null);

	const { onFrame } = sim;
	useEffect(() => onFrame((frame) => map.current?.pushFrame(frame)), [onFrame]);

	const follow = (id: number | null) => {
		setFollowedId(id);
		sim.follow(id);
	};

	const day = Math.floor(sim.tick / TICKS_PER_DAY);
	const currentSeason = season(day);
	const year = Math.floor(day / DAYS_PER_YEAR) + 1;
	// someone who has died is no longer sent, so following them shows nothing
	const followed =
		followedId !== null && sim.followed?.id === followedId && sim.followed.died === undefined
			? sim.followed
			: undefined;

	return (
		<div className="flex flex-col gap-3 lg:h-[calc(100dvh-7rem)] lg:flex-row">
			<div className="flex min-h-0 flex-col gap-3 lg:flex-1">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
					<span className="tabular-nums">
						Year {year}, {SEASON_NAMES[currentSeason]}
					</span>
					<span className="text-foreground/50 tabular-nums">{sim.population} people</span>
					<div className="ml-auto flex items-center gap-1">
						{SPEEDS.map((speed) => (
							<button
								key={speed}
								type="button"
								onClick={() => sim.setSpeed(speed)}
								className={`cursor-pointer rounded-md px-2 py-1 ${
									sim.speed === speed
										? 'bg-foreground/10 text-foreground'
										: 'text-foreground/50 hover:text-foreground'
								}`}
							>
								{SPEED_LABEL[speed]}
							</button>
						))}
						<button
							type="button"
							onClick={onNewWorld}
							className="ml-2 cursor-pointer rounded-md px-2 py-1 text-foreground/50 hover:text-foreground"
						>
							New world
						</button>
					</div>
				</div>
				<div className="relative h-[60dvh] min-h-0 w-full overflow-hidden rounded-lg bg-foreground/[0.04] lg:h-auto lg:flex-1">
					<MapCanvas
						ref={map}
						layers={sim.layers}
						living={sim.living}
						season={currentSeason}
						followedId={followed ? followedId : null}
						onSelect={follow}
						onUserPan={() => followedId !== null && follow(null)}
						theme={dark ? 'dark' : 'light'}
					/>
					{!sim.layers && (
						<div className="absolute inset-0 flex items-center justify-center text-sm text-foreground/40">
							Making a world…
						</div>
					)}
				</div>
			</div>
			<aside className="flex min-h-0 flex-col gap-6 lg:w-96 lg:overflow-y-auto lg:pr-1">
				{followed ? (
					<PersonPanel
						person={followed}
						tick={sim.tick}
						nameOf={sim.nameOf}
						onFollow={follow}
						onClose={() => follow(null)}
					/>
				) : (
					<div className="text-sm text-foreground/50">Click someone on the map to follow them.</div>
				)}
				<div className="flex flex-col gap-2">
					<div className="text-xs tracking-wide text-foreground/40 uppercase">Chronicle</div>
					<Chronicle events={sim.chronicle} onFollow={follow} />
				</div>
			</aside>
		</div>
	);
}
