import { NUMBER } from '~/components/admin/stats/format';
import type { getRaceSummary } from '~/lib/admin/overview';
import { timeAgo } from '~/lib/admin/time';
import { MARKET_NAMES } from '~/lib/race/betting';
import { ROSTER } from '~/lib/race/roster';
import { cn } from '~/lib/utils';
import { Area, Empty, Figure, type Loaded, Shortlist } from './Area';

// The overview's widgets from /admin/race: the loop as it runs, kept up to
// date while the page is open (useLiveRace), and the races it has run with
// the house's books.

type Race = Awaited<ReturnType<typeof getRaceSummary>>;

const PHASES: Record<Race['phase'], string> = {
	idle: 'waiting for someone to watch',
	betting: 'betting open',
	racing: 'racing',
	results: 'showing results'
};

const car = (id: string) => ROSTER.find((entry) => entry.id === id);
const signed = (n: number) => `${n > 0 ? '+' : ''}${NUMBER.format(n)}`;

// The loop as it runs: its phase and time left, who is watching, the pools.
export function LoopCard({
	loaded,
	now,
	className
}: {
	loaded: Loaded<Race>;
	now: number;
	className?: string;
}) {
	return (
		<Area
			title="race"
			href="/admin/race"
			loaded={loaded}
			className={className}
			action={
				loaded.ok &&
				loaded.value.round > 0 && (
					<span className="text-foreground/50 tabular-nums">
						round {NUMBER.format(loaded.value.round)}
					</span>
				)
			}
		>
			{(race) => {
				const live = !race.paused && race.phase !== 'idle';
				const left = Math.max(0, Math.ceil((race.endsAt - now) / 1000));
				const pooled = race.pools.reduce((sum, pool) => sum + pool.total, 0);
				return (
					<>
						<p className="flex items-center gap-2 text-base">
							<span
								className={cn(
									'size-2 shrink-0 rounded-full',
									race.paused
										? 'bg-amber-500'
										: live
											? 'animate-pulse bg-emerald-500'
											: 'bg-foreground/30'
								)}
								aria-hidden
							/>
							{race.paused ? 'paused' : PHASES[race.phase]}
							{live && <span className="text-foreground/50 tabular-nums">· {left}s left</span>}
						</p>
						<div className="flex flex-wrap gap-x-6 gap-y-4">
							<Figure value={NUMBER.format(race.watching)} label="watching" />
							<Figure value={NUMBER.format(race.watchingPlayers)} label="playing now" />
							<Figure
								value={race.playersThisWeek >= 100 ? '100+' : NUMBER.format(race.playersThisWeek)}
								label="players this week"
							/>
						</div>
						{race.phase === 'idle' && <Empty>The next race starts when someone opens /race.</Empty>}
						{race.phase !== 'idle' && (
							<Shortlist
								title={
									<span className="flex justify-between">
										<span>pools this round</span>
										<span className="tabular-nums">{NUMBER.format(Math.round(pooled))} chips</span>
									</span>
								}
							>
								{race.pools.map((pool) => (
									<li
										key={pool.market}
										className="flex items-baseline justify-between gap-4 py-1.5"
									>
										<span className="min-w-0 truncate">
											{MARKET_NAMES[pool.market].toLowerCase()}
										</span>
										<span className="shrink-0 text-foreground/50 tabular-nums">
											{NUMBER.format(Math.round(pool.total))}
										</span>
									</li>
								))}
							</Shortlist>
						)}
					</>
				);
			}}
		</Area>
	);
}

// The races run, the house's books, and how the latest came out.
export function ResultsCard({ loaded, className }: { loaded: Loaded<Race>; className?: string }) {
	return (
		<Area
			title="race results"
			href="/admin/race"
			section="races"
			loaded={loaded}
			className={className}
		>
			{(race) =>
				race.run ? (
					<>
						<div className="flex flex-wrap gap-x-6 gap-y-4">
							<Figure value={signed(race.net)} label="house net" />
							<Figure value={NUMBER.format(race.staked)} label="chips staked" />
							<Figure value={NUMBER.format(race.run)} label="races run" />
						</div>
						<NetBars races={race.nets} />
						<Shortlist title="latest races">
							{race.races.map((result) => (
								<li
									key={result.round}
									className={cn(
										'flex items-center justify-between gap-4 py-2',
										result.voided && 'text-foreground/50'
									)}
								>
									<span className="flex min-w-0 items-center gap-2">
										<span className="w-10 shrink-0 text-foreground/50 tabular-nums">
											{result.round}
										</span>
										<Podium cars={result.podium} />
										<span className="truncate">
											{result.voided
												? 'void'
												: (car(result.podium[0])?.name ?? result.podium[0] ?? '–')}
										</span>
									</span>
									<span className="flex shrink-0 items-baseline gap-3 tabular-nums">
										<span className={cn(result.net < 0 && 'text-destructive')}>
											{signed(result.net)}
										</span>
										<time
											className="hidden w-20 text-right text-foreground/50 sm:inline"
											dateTime={new Date(result.started).toISOString()}
											suppressHydrationWarning
										>
											{timeAgo(new Date(result.started).toISOString())}
										</time>
									</span>
								</li>
							))}
						</Shortlist>
					</>
				) : (
					<Empty>No races yet. One starts when someone opens /race.</Empty>
				)
			}
		</Area>
	);
}

// The first three home, as their cars' colours.
function Podium({ cars }: { cars: string[] }) {
	return (
		<span className="flex shrink-0 -space-x-1" aria-hidden>
			{cars.map((id) => (
				<span
					key={id}
					className="size-3 rounded-full ring-2 ring-card"
					style={{ background: car(id)?.color ?? 'var(--muted)' }}
				/>
			))}
		</span>
	);
}

// What the house kept or paid out, race by race, from a middle line.
function NetBars({ races }: { races: Race['nets'] }) {
	const most = Math.max(1, ...races.map((race) => Math.abs(race.net)));
	return (
		<div>
			<ol className="flex h-12 items-center gap-0.5" aria-label="The house's take, race by race">
				{races.map((race) => {
					const label = `round ${race.round}: ${race.voided ? 'void' : signed(race.net)}`;
					return (
						<li key={race.round} className="relative h-full flex-1" title={label}>
							<span className="sr-only">{label}</span>
							<span
								aria-hidden
								className={cn(
									'absolute inset-x-0 rounded-[1px]',
									race.net >= 0 ? 'bottom-1/2 bg-foreground/30' : 'top-1/2 bg-destructive/60',
									race.voided && 'bg-foreground/10'
								)}
								style={{ height: `${Math.max(4, (Math.abs(race.net) / most) * 50)}%` }}
							/>
						</li>
					);
				})}
			</ol>
			<p className="mt-1.5 text-xs text-foreground/40">
				the house's take, last {races.length} races
			</p>
		</div>
	);
}
