import { MARKET_NAMES, pays, type Market, type Pools } from '~/lib/race/betting';
import type { Bet, RoomState } from '~/lib/race/room';
import { CoinsIcon } from 'lucide-react';
import { Empty, Label, Returns, SHORT, Tile, chips, signed, type Running } from './shared';

// Your bets on this race, in the same place in every phase: what you have
// riding while betting is open, whether each is in the money while the race
// runs, and what each paid once it is over.

/** Whether a bet would win if the race ended now, where the running order says. */
export function holding(bet: Bet, running: Running | null): boolean | null {
	if (!running || bet.payout !== null) return null;
	const [a, b] = bet.outcome.split('>');
	switch (bet.market) {
		case 'win':
			return running.order[0] === a;
		case 'podium':
			return running.order.slice(0, 3).includes(a);
		case 'exacta':
			return running.order[0] === a && running.order[1] === b;
		case 'clean':
			return bet.outcome === 'yes' ? !running.anyOut : running.anyOut;
		// who goes out first, and who sets the best lap, are not in the running order
		default:
			return null;
	}
}

function Outcome({ market, outcome }: { market: Market; outcome: string }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			{market !== 'clean' && outcome.split('>').map((id) => <Tile key={id} id={id} />)}
			<span className="truncate">
				<Label market={market} outcome={outcome} />
			</span>
		</span>
	);
}

export function Bets({
	room,
	pools,
	bets,
	running
}: {
	room: RoomState;
	pools: Pools;
	bets: Bet[];
	running: Running | null;
}) {
	const staked = bets.reduce((sum, bet) => sum + bet.stake, 0);
	return (
		<section aria-label="Your bets" className="flex-1 rounded-lg bg-foreground/[0.03] p-4">
			<p className="flex items-baseline justify-between pb-2 text-sm text-muted-foreground">
				<span>Your bets</span>
				<span className="tabular-nums">
					{bets.length === 0 ? 'none yet' : `${bets.length} · ${chips(staked)} staked`}
				</span>
			</p>
			<ul className="flex h-24 flex-col overflow-y-auto text-sm tabular-nums">
				{bets.length === 0 && (
					<li className="flex flex-1">
						{room.phase === 'betting' ? (
							<Empty icon={CoinsIcon} title="No bets yet" hint="Pick a car and place a bet" />
						) : (
							<Empty icon={CoinsIcon} title="No bets on this race" />
						)}
					</li>
				)}
				{bets.map((bet, index) => {
					const hold = holding(bet, running);
					const net = bet.payout === null ? 0 : bet.payout - bet.stake;
					return (
						<li
							key={index}
							className="grid grid-cols-[4.5rem_minmax(0,1fr)_4rem_7.5rem] items-center gap-2 border-b border-border/50 py-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
						>
							<span className="text-muted-foreground">{SHORT[bet.market]}</span>
							<Outcome market={bet.market} outcome={bet.outcome} />
							<span className="text-right">{chips(bet.stake)}</span>
							<span className="text-right">
								{bet.payout !== null ? (
									<span className={net < 0 ? 'text-destructive' : 'font-medium'}>
										{net === 0 ? 'Returned' : signed(net)}
									</span>
								) : room.phase === 'betting' ? (
									<span className="text-muted-foreground" title={MARKET_NAMES[bet.market]}>
										<Returns />{' '}
										{chips(
											Math.floor(bet.stake * pays(pools[bet.market], bet.market, bet.outcome))
										)}
									</span>
								) : hold === null ? (
									<span className="text-muted-foreground">Riding</span>
								) : (
									<span className={hold ? 'font-medium' : 'text-muted-foreground'}>
										{hold ? '● In the money' : '○ Out of it'}
									</span>
								)}
							</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
