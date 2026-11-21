import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/utils';
import { Empty, Panel, StatCard } from '~/components/admin/cards';
import { Heading } from './parts';
import { NUMBER, PERCENT } from '~/lib/admin/format';
import { type View } from './format';

// The house's books: what has gone through it, what it kept, and what it gave
// away to keep players playing; then race by race, so a run of losses (odds
// set badly, a car tuned too strong) shows as a run of bars below the line.

type History = View['history'];

// memo: the page polls every few seconds, and the history rarely moves
export const Books = memo(function Books({ history }: { history: History }) {
	const { totals } = history;
	return (
		<div className="@container flex flex-col gap-4">
			<Heading>books</Heading>
			<div className="grid grid-cols-2 gap-4 @2xl:grid-cols-3">
				<StatCard label="races run" value={NUMBER.format(totals.run)} />
				<StatCard label="staked" value={NUMBER.format(totals.staked)} />
				<StatCard label="paid out" value={NUMBER.format(totals.paid)} />
				<StatCard
					label="house net"
					value={NUMBER.format(totals.net)}
					tone={totals.net < 0 ? 'bad' : undefined}
				/>
				<StatCard
					label="house margin"
					value={totals.staked ? PERCENT.format(totals.net / totals.staked) : '–'}
					hint="of every chip staked"
				/>
				<StatCard
					label="chips given"
					value={NUMBER.format(totals.bankruptcies + totals.resets)}
					hint={`${NUMBER.format(totals.bankruptcies)} bankrupt, ${NUMBER.format(totals.resets)} reset`}
				/>
			</div>
			<Panel title="net by race" description={`the last ${history.races.length}, oldest first`}>
				<NetChart races={history.races} />
			</Panel>
		</div>
	);
});

// One bar per race, up for what the house kept and down for what it paid
// beyond the stakes, on one scale so the two sides compare.
function NetChart({ races }: { races: History['races'] }) {
	if (!races.length) return <Empty>No races run yet.</Empty>;
	const run = [...races].reverse();
	const up = Math.max(0, ...run.map((race) => race.net));
	const down = Math.max(0, ...run.map((race) => -race.net));
	const span = up + down || 1;
	return (
		<div className="flex flex-col gap-2">
			<div className="flex h-32 gap-0.5" role="list" aria-label="House net by race">
				{run.map((race) => (
					<Tooltip key={race.round}>
						<TooltipTrigger
							render={<div role="listitem" />}
							aria-label={`Race ${race.round}: ${race.voided ? 'void' : NUMBER.format(race.net)}`}
							className="flex max-w-6 min-w-0 flex-1 flex-col hover:bg-foreground/5"
						>
							<span className="flex items-end" style={{ height: `${(up / span) * 100}%` }}>
								{race.net > 0 && (
									<span
										className="w-full rounded-t-[3px] bg-foreground/60"
										style={{ height: `${(race.net / up) * 100}%` }}
									/>
								)}
							</span>
							<span
								className={cn('h-px w-full', race.voided ? 'bg-foreground/20' : 'bg-foreground/30')}
							/>
							<span className="flex items-start" style={{ height: `${(down / span) * 100}%` }}>
								{race.net < 0 && (
									<span
										className="w-full rounded-b-[3px] bg-destructive"
										style={{ height: `${(-race.net / down) * 100}%` }}
									/>
								)}
							</span>
						</TooltipTrigger>
						<TooltipContent>
							race {race.round} ·{' '}
							{race.voided
								? 'void'
								: `staked ${NUMBER.format(race.staked)}, paid ${NUMBER.format(race.paid)}, net ${NUMBER.format(race.net)}`}
						</TooltipContent>
					</Tooltip>
				))}
			</div>
			<div className="flex justify-between text-foreground/50 tabular-nums">
				<span>race {run[0].round}</span>
				<span>
					best {NUMBER.format(up)} · worst {NUMBER.format(down ? -down : 0)}
				</span>
				<span>race {run.at(-1)!.round}</span>
			</div>
		</div>
	);
}
