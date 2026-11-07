import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DAYS_PER_YEAR, SEASON_NAMES, TICKS_PER_DAY, season, type Speed } from '~/lib/civ/config';
import type { WeatherKind } from '~/lib/civ/types';
import { useSim, type Frame } from '~/lib/civ/use-sim';
import { useWritingTheme } from '~/lib/writing-theme';
import { Alerts } from './Alerts';
import { Chronicle } from './Chronicle';
import { PANEL, TABS, type TabId } from './labels';
import { MapCanvas, type MapCanvasHandle } from './MapCanvas';
import { KnowledgeList, WorldPanel } from './Panels';
import { PeopleList } from './PeopleList';
import { PersonPanel } from './PersonPanel';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

// The /civ page once it's in the browser: the map fills the screen and the
// interface sits on top of it as game panels. The world itself runs in a
// worker (lib/civ/sim/sim.worker.ts); this only shows it.

// how often the lists that are built from frames refresh, in ms
const SNAPSHOT_MS = 350;

function newSeed() {
	return Math.floor(Math.random() * 2 ** 31);
}

export default function CivApp({ lead }: { lead?: ReactNode }) {
	const [seed, setSeed] = useState(newSeed);
	// a new world starts everything below afresh
	return <World key={seed} seed={seed} lead={lead} onNewWorld={() => setSeed(newSeed())} />;
}

// Typing in a box should never pause the world
function isTyping(target: EventTarget | null) {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
	);
}

function World({
	seed,
	lead,
	onNewWorld
}: {
	seed: number;
	lead?: ReactNode;
	onNewWorld: () => void;
}) {
	const dark = useWritingTheme();
	const sim = useSim(seed);
	const map = useRef<MapCanvasHandle>(null);
	const [followedId, setFollowedId] = useState<number | null>(null);
	const [tab, setTab] = useState<TabId | null>(null);
	const [weather, setWeather] = useState<WeatherKind>('clear');
	const [snapshot, setSnapshot] = useState<Frame>();
	const latest = useRef<Frame>(undefined);
	const lastWeather = useRef<WeatherKind>('clear');
	const speedBeforePause = useRef<Speed>(1);

	// every frame goes to the map; React only hears about weather changes, and
	// the latest frame is parked in a ref for the lists below
	const { onFrame } = sim;
	useEffect(
		() =>
			onFrame((frame) => {
				map.current?.pushFrame(frame);
				latest.current = frame;
				if (frame.weather !== lastWeather.current) {
					lastWeather.current = frame.weather;
					setWeather(frame.weather);
				}
			}),
		[onFrame]
	);

	// the people and world lists refresh a few times a second, and only while open
	const needsSnapshot = tab === 'people' || tab === 'world';
	useEffect(() => {
		if (!needsSnapshot) return;
		const timer = setInterval(() => setSnapshot(latest.current), SNAPSHOT_MS);
		return () => clearInterval(timer);
	}, [needsSnapshot]);

	const { setSpeed, speed } = sim;
	const simFollow = sim.follow;
	const follow = (id: number | null) => {
		setFollowedId(id);
		simFollow(id);
	};

	const toggleTab = (id: TabId) => setTab((open) => (open === id ? null : id));

	// Space pauses and resumes at the old speed, 1/2/3 pick a speed, Escape
	// closes the open panel and then stops following
	useEffect(() => {
		const speeds: Record<string, Speed> = { '1': 1, '2': 2, '3': 4 };
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
			if (event.code === 'Space') {
				event.preventDefault();
				if (event.repeat) return;
				if (speed === 0) setSpeed(speedBeforePause.current);
				else {
					speedBeforePause.current = speed;
					setSpeed(0);
				}
			} else if (event.key in speeds) {
				setSpeed(speeds[event.key]);
			} else if (event.key === 'Escape') {
				if (tab !== null) setTab(null);
				else if (followedId !== null) {
					setFollowedId(null);
					simFollow(null);
				}
			}
		};
		// a focused button would otherwise also "click" when Space is released
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code === 'Space' && !isTyping(event.target)) event.preventDefault();
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [speed, setSpeed, tab, followedId, simFollow]);

	const day = Math.floor(sim.tick / TICKS_PER_DAY);
	const currentSeason = season(day);
	const year = Math.floor(day / DAYS_PER_YEAR) + 1;
	// someone who has died is no longer sent, so following them shows nothing
	const followed =
		followedId !== null && sim.followed?.id === followedId && sim.followed.died === undefined
			? sim.followed
			: undefined;
	const villageName = snapshot?.villages.find((v) => v.id === followed?.village)?.name;
	const tabName = TABS.find((t) => t.id === tab)?.name;

	return (
		<div className="fixed inset-0 overflow-hidden bg-background">
			<div className="absolute inset-0">
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

			{/* everything on top lets clicks through to the map except the panels themselves */}
			<div className="pointer-events-none absolute inset-0 text-foreground">
				<div className="absolute inset-x-3 top-3 flex">
					<TopBar
						lead={lead}
						year={year}
						seasonName={SEASON_NAMES[currentSeason]}
						weather={weather}
						population={sim.population}
						speed={sim.speed}
						onSpeed={sim.setSpeed}
						onFit={() => map.current?.fit()}
						onNewWorld={onNewWorld}
					/>
				</div>

				<Alerts events={sim.chronicle} onFollow={follow} />

				{followed && (
					<PersonPanel
						className={`absolute bottom-14 left-3 w-72 ${tab ? 'max-lg:hidden' : ''}`}
						person={followed}
						tick={sim.tick}
						villageName={villageName}
						nameOf={sim.nameOf}
						onFollow={follow}
						onClose={() => follow(null)}
					/>
				)}

				{tab && (
					<div
						className={`pointer-events-auto absolute bottom-14 left-1/2 flex max-h-[60dvh] w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col text-xs ${PANEL}`}
					>
						<div className="px-3 pt-2.5 pb-1 text-sm font-medium">{tabName}</div>
						<div className="min-h-0 overflow-y-auto px-3 pb-3">
							{tab === 'chronicle' && <Chronicle events={sim.chronicle} onFollow={follow} />}
							{tab === 'people' && (
								<PeopleList frame={snapshot} followedId={followedId} onFollow={follow} />
							)}
							{tab === 'knowledge' && (
								<KnowledgeList events={sim.chronicle} nameOf={sim.nameOf} onFollow={follow} />
							)}
							{tab === 'world' && <WorldPanel frame={snapshot} />}
						</div>
					</div>
				)}

				<div className="absolute inset-x-0 bottom-3 flex justify-center">
					<TabBar open={tab} onToggle={toggleTab} />
				</div>
			</div>
		</div>
	);
}
