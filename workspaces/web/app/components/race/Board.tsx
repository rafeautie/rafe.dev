import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { MARKET_NAMES, pays, type Market, type Pools } from '~/lib/race/betting';
import type { RoomState } from '~/lib/race/room';
import { CONDITIONS, inCondition, type Entry } from '~/lib/race/roster';
import { Tile, entry, useTween } from './shared';

// One row per car, in grid order: who it is, how it turned up today, what it
// is good at, and what it pays. In a market about single cars the rows are
// the choices; in the others they are the form guide.

const STATS = [
	['speed', 'Speed'],
	['grip', 'Grip'],
	['aggression', 'Aggression'],
	['reliability', 'Reliability']
] as const;

/** Odds that glide when they move, and read a little brighter while they do. */
function Odds({ value }: { value: number }) {
	const shown = useTween(value, 500);
	const moving = Math.abs(shown - value) > 0.005;
	return (
		<span
			className={`w-12 text-right text-base font-medium tabular-nums transition-colors ${moving ? 'text-muted-foreground' : ''}`}
		>
			{shown.toFixed(1)}×
		</span>
	);
}

function Stats({ base, today, touched }: { base: Entry; today: Entry; touched?: string }) {
	return (
		<span
			role="img"
			aria-label={STATS.map(([key, name]) => `${name} ${Math.round(today[key] * 100)}`).join(', ')}
			className="flex gap-1"
		>
			{STATS.map(([key]) => (
				<span
					key={key}
					className="relative h-5 w-1.5 overflow-hidden rounded-full bg-foreground/10"
				>
					<span
						className={`absolute inset-x-0 bottom-0 ${key === touched ? 'bg-foreground' : 'bg-foreground/45'}`}
						style={{ height: `${Math.round(today[key] * 100)}%` }}
					/>
					{key === touched && base[key] !== today[key] && (
						<span
							className="absolute inset-x-0 h-px bg-background"
							style={{ bottom: `${Math.round(base[key] * 100)}%` }}
						/>
					)}
				</span>
			))}
		</span>
	);
}

export function Board({
	room,
	pools,
	market,
	outcome,
	pick
}: {
	room: RoomState;
	pools: Pools;
	market: Market;
	outcome: string | null;
	pick: (id: string) => void;
}) {
	// only a market about one car can be picked from the rows
	const single = market === 'win' || market === 'podium' || market === 'crash' || market === 'lap';
	const oddsOf = single ? market : 'win';
	return (
		<section aria-label="Cars">
			<div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
				<span className="flex items-center gap-1.5">
					Cars
					<span aria-hidden className="ml-3 tracking-[0.2em]">
						SGAR
					</span>
				</span>
				<span>{MARKET_NAMES[oddsOf]} pays</span>
			</div>
			<ul className="flex flex-col">
				{room.grid.map((id, place) => {
					// the stats are the room's, which /admin/race can tune
					const car = { ...entry(id), ...room.settings.cars[id] };
					const condition = CONDITIONS[room.conditions[place]];
					const today = inCondition(car, room.conditions[place]);
					const selected = single && outcome === id;
					const content = (
						<>
							<span className="w-3 text-center text-sm text-muted-foreground tabular-nums">
								{place + 1}
							</span>
							<Tile id={id} />
							<span className="min-w-0 flex-1 text-left">
								<span className="block text-base leading-tight font-medium">{car.name}</span>
								<span className="block truncate text-xs leading-tight text-muted-foreground">
									{condition.by === 0 ? (
										'As usual'
									) : (
										<>
											{condition.by > 0 ? (
												<ArrowUpIcon
													aria-hidden="true"
													strokeWidth={2}
													className="inline size-[1em] shrink-0 align-[-0.125em]"
												/>
											) : (
												<ArrowDownIcon
													aria-hidden="true"
													strokeWidth={2}
													className="inline size-[1em] shrink-0 align-[-0.125em]"
												/>
											)}
											<span className="sr-only">{condition.by > 0 ? 'Up: ' : 'Down: '}</span>{' '}
											{condition.label}
										</>
									)}
								</span>
							</span>
							<Stats base={car} today={today} touched={condition.stat} />
							<Odds value={pays(pools[oddsOf], oddsOf, id)} />
						</>
					);
					const row = 'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 transition-colors';
					return (
						<li key={id}>
							{single ? (
								<button
									type="button"
									aria-pressed={selected}
									aria-label={`${car.name}, ${condition.label}, pays ${pays(pools[oddsOf], oddsOf, id).toFixed(1)} times`}
									onClick={() => pick(id)}
									className={`${row} cursor-pointer outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 ${selected ? 'bg-muted ring-1 ring-foreground/40' : ''}`}
								>
									{content}
								</button>
							) : (
								<div className={row}>{content}</div>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
