import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { MARKET_NAMES } from '~/lib/race/betting';
import { CONDITIONS, inCondition } from '~/lib/race/roster';
import { STATS } from '~/lib/race/settings';
import { cn } from '~/lib/utils';
import { Empty, Panel } from '~/components/admin/cards';
import { Car, Table, Heading } from './parts';
import { NUMBER } from '~/lib/admin/format';
import { cell, condition, number, type View } from './format';
import { useRoomClock } from './clock';
import { TimeAgo } from '~/components/admin/TimeAgo';
import { PhaseBar } from '~/components/race/PhaseBar';

// What is happening right now, the part of the page that is watched rather
// than worked: where the loop is and how long is left, who is there, what
// this race's field looks like and where the chips are going, with the last
// result and the house's position underneath for a glance.

type Loop = View['loop'];

const PHASES = ['betting', 'racing', 'results'] as const;

const WAITING = {
	idle: 'waiting for somebody to open the game',
	betting: 'betting open',
	racing: 'racing',
	results: 'showing the result'
};

export function Live({ view, go }: { view: View; go: (section: 'results' | 'books') => void }) {
	const { loop, history } = view;
	const last = history.races[0];
	return (
		<div className="@container flex flex-col gap-4">
			<Heading>live</Heading>
			<Status loop={loop} />
			{loop.grid.length > 0 && (
				<div className="grid gap-4 @3xl:grid-cols-2">
					<Grid loop={loop} />
					<Pools loop={loop} />
				</div>
			)}
			<div className="grid gap-4 @2xl:grid-cols-2">
				<Panel
					title="last race"
					description={
						last ? (
							<>
								race {last.round} · <TimeAgo at={last.started} />
							</>
						) : undefined
					}
					action={
						<Button variant="ghost" size="sm" onClick={() => go('results')}>
							Results
						</Button>
					}
				>
					{last ? <LastRace race={last} /> : <Empty>No races run yet.</Empty>}
				</Panel>
				<Panel
					title="the house"
					description={`over ${NUMBER.format(history.totals.run)} races`}
					action={
						<Button variant="ghost" size="sm" onClick={() => go('books')}>
							Books
						</Button>
					}
				>
					<dl className="grid grid-cols-2 gap-4">
						<Figure
							label="net"
							value={NUMBER.format(history.totals.net)}
							tone={history.totals.net < 0 ? 'bad' : undefined}
						/>
						<Figure label="staked" value={NUMBER.format(history.totals.staked)} />
					</dl>
				</Panel>
			</div>
		</div>
	);
}

// The only part of the page that ticks, so it keeps the clock itself.
function Status({ loop }: { loop: Loop }) {
	const clock = useRoomClock(loop.now, loop.phase !== 'idle');
	const left = Math.max(0, Math.ceil((loop.endsAt - clock) / 1000));
	const through =
		loop.endsAt > loop.since
			? Math.min(1, Math.max(0, (clock - loop.since) / (loop.endsAt - loop.since)))
			: 0;
	const at = PHASES.indexOf(loop.phase as (typeof PHASES)[number]);
	const staked = loop.pools.reduce((sum, pool) => sum + pool.staked, 0);
	return (
		<Panel
			title={loop.round ? `race ${loop.round}` : 'no races yet'}
			description={
				<span suppressHydrationWarning>
					{WAITING[loop.phase]}
					{loop.phase !== 'idle' && ` · ${left}s left`}
					{loop.paused && ' · stops after this race'}
				</span>
			}
			action={
				loop.paused ? (
					<Badge variant="secondary">Paused</Badge>
				) : (
					<Badge variant={loop.phase === 'idle' ? 'outline' : 'default'}>
						{loop.phase === 'idle' ? 'Idle' : 'Live'}
					</Badge>
				)
			}
		>
			<div className="flex flex-col gap-5">
				{/* the three phases every race goes through, as one bar cut into
				    thirds (a race's length is not known until it is run), filled
				    as far as the race has got */}
				<div className="flex flex-col gap-1.5">
					<PhaseBar
						restart={loop.round}
						className="bg-foreground/10"
						phases={PHASES.map((phase, i) => ({
							name: phase,
							weight: 1,
							fill: i < at ? 1 : i === at ? through : 0
						}))}
					/>
					<ol className="grid grid-cols-3" aria-label="Phase">
						{PHASES.map((phase, i) => (
							<li
								key={phase}
								aria-current={i === at ? 'step' : undefined}
								className={cn('text-foreground/50', i === at && 'text-foreground')}
							>
								{phase}
							</li>
						))}
					</ol>
				</div>
				<dl className="grid grid-cols-2 gap-4 @xl:grid-cols-4">
					<Figure label="pages open" value={NUMBER.format(loop.viewers)} />
					<Figure label="players watching" value={NUMBER.format(loop.players)} />
					<Figure label="staked this race" value={NUMBER.format(staked)} />
					<Figure
						label="in the pools"
						value={NUMBER.format(Math.round(loop.pools.reduce((sum, pool) => sum + pool.total, 0)))}
					/>
				</dl>
			</div>
		</Panel>
	);
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
	return (
		<div>
			<dt className="text-foreground/50">{label}</dt>
			<dd className={cn('text-xl font-medium tabular-nums', tone === 'bad' && 'text-destructive')}>
				{value}
			</dd>
		</div>
	);
}

function Grid({ loop }: { loop: Loop }) {
	return (
		<Panel title="on the grid" description="in starting order, stats as conditioned" flush>
			<Table
				head={['', 'car', ...STATS.map((stat) => stat.slice(0, 1))]}
				right={STATS.map((_, i) => i + 2)}
			>
				{loop.grid.map((car, slot) => {
					const changes = CONDITIONS[car.condition];
					// the stats this race is run on, the condition's nudge included
					const raced = inCondition(car, car.condition);
					return (
						<tr key={car.car}>
							<td className={cn(cell, 'text-foreground/50')}>{slot + 1}</td>
							<td className={cell}>
								<Car id={car.car} />
								<span className="block pl-4 text-xs text-foreground/50">
									{condition(car.condition)}
								</span>
							</td>
							{STATS.map((stat) => (
								<td
									key={stat}
									title={stat}
									className={cn(
										number,
										'px-2',
										changes?.stat === stat && (changes.by > 0 ? 'font-medium' : 'text-destructive')
									)}
								>
									{raced[stat].toFixed(2)}
									{changes?.stat === stat && (changes.by > 0 ? '↑' : '↓')}
								</td>
							))}
						</tr>
					);
				})}
			</Table>
		</Panel>
	);
}

// Each market's pool, the bar as long as the pool against the biggest, its
// dark part the players' chips and the rest the house's seed.
function Pools({ loop }: { loop: Loop }) {
	const most = Math.max(1, ...loop.pools.map((pool) => pool.total));
	return (
		<Panel title="pools" description="players’ chips over the house’s seed">
			<ul className="flex flex-col gap-3">
				{loop.pools.map((pool) => (
					<li key={pool.market} className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between gap-3">
							<span>{MARKET_NAMES[pool.market].toLowerCase()}</span>
							<span className="text-foreground/50 tabular-nums">
								<span className="text-foreground">{NUMBER.format(pool.staked)}</span> of{' '}
								{NUMBER.format(Math.round(pool.total))}
							</span>
						</div>
						<span className="flex h-1.5 overflow-hidden rounded-full bg-foreground/5" aria-hidden>
							<span
								className="flex h-full overflow-hidden rounded-full bg-foreground/20"
								style={{ width: `${(pool.total / most) * 100}%` }}
							>
								<span
									className="h-full bg-foreground"
									style={{ width: `${pool.total ? (pool.staked / pool.total) * 100 : 0}%` }}
								/>
							</span>
						</span>
					</li>
				))}
			</ul>
		</Panel>
	);
}

function LastRace({ race }: { race: View['history']['races'][number] }) {
	if (race.voided) return <Empty>Voided: every bet was handed back.</Empty>;
	return (
		<div className="flex flex-col gap-3">
			<ol className="flex flex-wrap gap-x-3 gap-y-1">
				{race.order.map((car, place) => (
					<li key={car} className={cn(place > 2 && 'text-foreground/50')}>
						<span className="text-foreground/50 tabular-nums">{place + 1} </span>
						<Car id={car} />
					</li>
				))}
			</ol>
			<dl className="grid grid-cols-3 gap-4">
				<div>
					<dt className="text-foreground/50">first out</dt>
					<dd>{race.firstOut ? <Car id={race.firstOut} /> : 'nobody'}</dd>
				</div>
				<div>
					<dt className="text-foreground/50">fastest lap</dt>
					<dd>{race.fastest ? <Car id={race.fastest} /> : '–'}</dd>
				</div>
				<div>
					<dt className="text-foreground/50">house net</dt>
					<dd className={cn('tabular-nums', race.net < 0 && 'text-destructive')}>
						{NUMBER.format(race.net)}
					</dd>
				</div>
			</dl>
		</div>
	);
}
