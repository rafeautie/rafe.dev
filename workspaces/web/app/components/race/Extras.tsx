import { CoinsIcon, TrophyIcon } from 'lucide-react';
import { MARKET_NAMES } from '~/lib/race/betting';
import type { Standing } from '~/lib/race/room';
import { Empty, Label, chips, type Tick } from './shared';

// What is there but should never compete with the race: the other players'
// bets and the leaderboard.

export function Extras({
	you,
	board,
	ticker
}: {
	you: Standing | null;
	board: Standing[];
	ticker: Tick[];
}) {
	return (
		<div className="grid gap-4 text-sm lg:grid-cols-2">
			<section
				aria-label="Recent bets"
				className="flex flex-col gap-1 rounded-lg bg-foreground/[0.02] p-4"
			>
				<h2 className="pb-1 text-sm text-muted-foreground">Recent bets</h2>
				<div className="flex h-35 flex-col gap-1 overflow-hidden">
					{ticker.length === 0 && (
						<Empty
							icon={CoinsIcon}
							title="Nobody has bet yet"
							hint="Bets show up here as they land"
						/>
					)}
					{ticker.slice(0, 5).map((tick, index) => (
						<p key={index} className="truncate">
							{tick.name} <span className="tabular-nums">{chips(tick.stake)}</span> on{' '}
							<Label market={tick.market} outcome={tick.outcome} />
							<span className="text-muted-foreground">
								{' '}
								· {MARKET_NAMES[tick.market].toLowerCase()}
							</span>
						</p>
					))}
				</div>
			</section>
			<section
				aria-label="Leaderboard"
				className="flex flex-col gap-1 rounded-lg bg-foreground/[0.02] p-4"
			>
				<h2 className="pb-1 text-sm text-muted-foreground">Leaderboard</h2>
				<div className="flex h-35 flex-col gap-1 overflow-hidden">
					{board.length === 0 && (
						<Empty
							icon={TrophyIcon}
							title="Nobody is playing"
							hint="Players show up here while they watch"
						/>
					)}
					{board.slice(0, 6).map((player, place) => (
						<p
							key={player.id}
							className={`flex gap-2 tabular-nums ${player.id === you?.id ? 'font-medium' : ''}`}
						>
							<span className="w-3 text-center text-muted-foreground">{place + 1}</span>
							<span className="min-w-0 flex-1 truncate">{player.name}</span>
							<span>{chips(player.balance)}</span>
						</p>
					))}
				</div>
			</section>
		</div>
	);
}
