import { Badge } from '~/components/ui/badge';
import { ROSTER } from '~/lib/race/roster';
import { cn } from '~/lib/utils';
import { Empty, Panel } from '~/components/admin/cards';
import { Car, Table, Heading } from './parts';
import { NUMBER, PERCENT } from '~/lib/admin/format';
import { timeAgo } from '~/lib/admin/time';
import { carName, cell, condition, number, type View } from './format';

// How the races have come out: each car's record side by side, to see whether
// the field is balanced (with six cars, a fair one wins about a sixth of the
// time), then the races themselves, newest first.

type History = View['history'];

const FAIR = 1 / ROSTER.length;

export function Results({ history }: { history: History }) {
	return (
		<div className="flex flex-col gap-4">
			<Heading>results</Heading>
			<Cars cars={history.cars} />
			<Races races={history.races} />
		</div>
	);
}

function Cars({ cars }: { cars: History['cars'] }) {
	// every car, even one yet to start, so the table is always the whole field
	const rows = [
		...cars,
		...ROSTER.filter((entry) => !cars.some((car) => car.car === entry.id)).map((entry) => ({
			car: entry.id,
			starts: 0,
			wins: 0,
			winRate: 0,
			podiums: 0,
			firstOuts: 0,
			fastestLaps: 0,
			averagePlace: 0
		}))
	];
	const most = Math.max(FAIR * 2, ...rows.map((car) => car.winRate));
	return (
		<Panel
			title="cars"
			description={`win rate against a fair ${PERCENT.format(FAIR)}, the line`}
			flush
		>
			<Table
				head={['car', 'win rate', 'wins', 'podiums', 'avg finish', 'out first', 'fastest lap']}
				right={[2, 3, 4, 5, 6]}
			>
				{rows.map((car) => (
					<tr key={car.car}>
						<td className={cell}>
							<Car id={car.car} />
						</td>
						<td className={cell}>
							<span className="flex items-center gap-2">
								<span className="relative h-1.5 w-24 rounded-full bg-foreground/10" aria-hidden>
									<span
										className="absolute inset-y-0 left-0 rounded-full bg-foreground"
										style={{ width: `${(car.winRate / most) * 100}%` }}
									/>
									{/* the fair share, a tick across the bar */}
									<span
										className="absolute -inset-y-1 w-px bg-foreground/50"
										style={{ left: `${(FAIR / most) * 100}%` }}
									/>
								</span>
								<span className="w-9 text-right">
									{car.starts ? PERCENT.format(car.winRate) : '–'}
								</span>
							</span>
						</td>
						<td className={number}>
							{car.wins}
							<span className="text-foreground/50"> / {car.starts}</span>
						</td>
						<td className={number}>{car.podiums}</td>
						<td className={number}>{car.starts ? car.averagePlace.toFixed(1) : '–'}</td>
						<td className={number}>{car.firstOuts}</td>
						<td className={number}>{car.fastestLaps}</td>
					</tr>
				))}
			</Table>
		</Panel>
	);
}

function Races({ races }: { races: History['races'] }) {
	return (
		<Panel
			title="recent races"
			description={races.length ? `the last ${races.length}, newest first` : undefined}
			flush
		>
			{races.length ? (
				<Table
					head={['race', 'started', 'finish', 'out first', 'fastest lap', 'staked', 'paid', 'net']}
					right={[5, 6, 7]}
				>
					{races.map((race) => (
						<tr key={race.round} className={cn(race.voided && 'text-foreground/50')}>
							<td className={cell}>
								{race.round}
								{race.voided && (
									<Badge variant="secondary" className="ml-2">
										Void
									</Badge>
								)}
							</td>
							<td className={cn(cell, 'text-foreground/50')} suppressHydrationWarning>
								{timeAgo(race.started)}
							</td>
							<td className={cell}>
								<Finish race={race} />
							</td>
							<td className={cell}>{race.firstOut ? <Car id={race.firstOut} /> : '–'}</td>
							<td className={cell}>{race.fastest ? <Car id={race.fastest} /> : '–'}</td>
							<td className={number}>{NUMBER.format(race.staked)}</td>
							<td className={number}>{NUMBER.format(race.paid)}</td>
							<td className={cn(number, race.net < 0 && 'text-destructive')}>
								{NUMBER.format(race.net)}
							</td>
						</tr>
					))}
				</Table>
			) : (
				<div className="px-4">
					<Empty>No races yet.</Empty>
				</div>
			)}
		</Panel>
	);
}

// The winner by name, then the rest as their colours, in the order they
// finished; each says where it started and in what condition when pointed at.
function Finish({ race }: { race: History['races'][number] }) {
	if (!race.order.length) return '–';
	const [winner, ...rest] = race.order;
	const about = (car: string) => {
		const slot = race.grid.findIndex((entry) => entry.car === car);
		const drew = race.grid[slot]?.condition ?? 'normal';
		return `${carName(car)}, from ${slot + 1}${drew === 'normal' ? '' : `, ${condition(drew)}`}`;
	};
	return (
		<span className="inline-flex items-center gap-2">
			<span title={about(winner)}>
				<Car id={winner} />
			</span>
			<span className="inline-flex gap-1" aria-label={`then ${rest.map(carName).join(', ')}`}>
				{rest.map((car) => (
					<span key={car} title={about(car)}>
						<Car id={car} name={false} />
					</span>
				))}
			</span>
		</span>
	);
}
