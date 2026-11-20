import type { Bet, RoomState, Standing } from '~/lib/race/room';
import { Tile, chips, entry, signed } from './shared';

// The payoff: one number for how the race went for you, then how it ended.

export function Results({
	room,
	you,
	bets
}: {
	room: RoomState;
	you: Standing | null;
	bets: Bet[];
}) {
	const result = room.result;
	const settled = bets.length > 0 && bets.every((bet) => bet.payout !== null);
	const net = bets.reduce((sum, bet) => sum + (bet.payout ?? bet.stake) - bet.stake, 0);
	const backed = new Set(bets.flatMap((bet) => bet.outcome.split('>')));
	return (
		<section aria-label="Result" className="flex flex-col gap-5">
			<div aria-live="polite">
				<p className="text-sm text-muted-foreground">Your race</p>
				{bets.length === 0 ? (
					<p className="text-3xl leading-tight font-semibold text-muted-foreground">No bets</p>
				) : (
					<p
						className={`text-5xl leading-tight font-semibold tabular-nums motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 ${net < 0 ? 'text-destructive' : ''}`}
					>
						{settled ? signed(net) : '…'}
					</p>
				)}
				{you && (
					<p className="text-sm text-muted-foreground tabular-nums">
						Balance {chips(you.balance)}
						{settled && ` (was ${chips(you.balance - net)})`}
					</p>
				)}
			</div>

			{result && (
				<div>
					<p className="pb-2 text-sm text-muted-foreground">Finished</p>
					<ol className="flex flex-col">
						{result.order.map((id, place) => (
							<li
								key={id}
								className={`flex h-10 items-center gap-2.5 px-3 ${place < 3 ? '' : 'text-muted-foreground'}`}
							>
								<span
									className={`w-3 text-center text-sm tabular-nums ${place === 0 ? 'font-semibold' : ''}`}
								>
									{place + 1}
								</span>
								<Tile id={id} />
								<span className={place < 3 ? 'text-base font-medium' : 'text-base'}>
									{entry(id).name}
								</span>
								<span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
									{id === result.firstOut && <span>first out</span>}
									{id === result.fastest && <span>fastest lap</span>}
								</span>
								<span
									className={`w-1.5 text-xs ${backed.has(id) ? 'text-foreground' : 'text-transparent'}`}
									aria-label={backed.has(id) ? 'Your bet' : undefined}
								>
									●
								</span>
							</li>
						))}
					</ol>
				</div>
			)}
		</section>
	);
}
