import type { Bet } from '~/lib/race/room';
import { LAPS } from '~/lib/race/sim';
import { Tile, entry, type Running } from './shared';

// The running order, one row per car, best first. Rows slide to their new
// place instead of jumping, so an overtake is something you see happen.

const ROW = 40;

export function Tower({
	running,
	ids,
	bets
}: {
	running: Running | null;
	ids: string[];
	bets: Bet[];
}) {
	// before the first snapshot, the grid
	const order = running?.order ?? ids;
	const backed = new Set(bets.flatMap((bet) => bet.outcome.split('>')));
	return (
		<section aria-label="Running order">
			<p className="pb-2 text-sm text-muted-foreground">Running order</p>
			<ol className="relative" style={{ height: ids.length * ROW }}>
				{ids.map((id) => {
					const place = order.indexOf(id);
					const car = running?.cars[id];
					return (
						<li
							key={id}
							className="absolute inset-x-0 top-0 flex items-center gap-2.5 px-3 transition-transform duration-300 ease-out motion-reduce:transition-none"
							style={{ height: ROW, transform: `translateY(${place * ROW}px)` }}
						>
							<span className="w-3 text-center text-sm text-muted-foreground tabular-nums">
								{place + 1}
							</span>
							<Tile id={id} />
							<span className="w-16 text-base font-medium">{entry(id).name}</span>
							<span className="relative h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
								<span
									className={`absolute inset-y-0 left-0 rounded-full ${car?.retired ? 'bg-foreground/25' : 'bg-foreground/70'}`}
									style={{ width: `${Math.round((car?.fraction ?? 0) * 100)}%` }}
								/>
							</span>
							<span className="w-16 text-right text-sm text-muted-foreground tabular-nums">
								{car?.retired
									? 'Out'
									: car?.finished
										? 'Home'
										: `Lap ${Math.min(LAPS, Math.max(1, (car?.lap ?? -1) + 1))}`}
							</span>
							<span
								className={`w-1.5 text-xs ${backed.has(id) ? 'text-foreground' : 'text-transparent'}`}
								title={backed.has(id) ? 'You have a bet on this car' : undefined}
								aria-label={backed.has(id) ? 'Your bet' : undefined}
							>
								●
							</span>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
