import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { Ranking } from '~/components/admin/stats/Panel';
import { TimeChart } from '~/components/admin/stats/TimeChart';
import { NUMBER } from '~/components/admin/stats/format';
import type { getVisitsSummary } from '~/lib/admin/overview';
import { cn } from '~/lib/utils';
import { Area, Figure, type Loaded, SubLead } from './Area';

// The overview's widgets from /admin/stats: the week's traffic over a month's
// chart, and what was read and where readers came from.

type Visits = Awaited<ReturnType<typeof getVisitsSummary>>;

const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const count = (value: number | null) => (value === null ? '–' : NUMBER.format(value));

export function TrafficCard({ loaded, className }: { loaded: Loaded<Visits>; className?: string }) {
	return (
		<Area
			title="traffic"
			href="/admin/stats"
			loaded={loaded}
			className={className}
			action={loaded.ok && loaded.value.here > 0 && <HereNow count={loaded.value.here} />}
		>
			{(visits) => (
				<>
					<div className="flex flex-wrap items-end gap-x-8 gap-y-4">
						<Figure value={NUMBER.format(visits.visitors)} label="visitors, last 7 days" />
						<Figure value={NUMBER.format(visits.views)} label="page views" />
						<Trend now={visits.visitors} before={visits.previous} />
					</div>
					{/* the chart takes whatever height its row leaves the card */}
					<div className="flex min-h-56 flex-1 flex-col">
						<TimeChart
							data={visits.days}
							dataKey="visitors"
							label="Visitors"
							format={count}
							className="aspect-auto min-h-0 w-full flex-1"
						/>
						<p className="mt-1 text-xs text-foreground/40">visitors a day, last 30 days</p>
					</div>
				</>
			)}
		</Area>
	);
}

function HereNow({ count }: { count: number }) {
	return (
		<span className="flex items-center gap-1.5 text-foreground/60">
			<span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
			{NUMBER.format(count)} here now
		</span>
	);
}

// This week against the week before.
function Trend({ now, before }: { now: number; before: number }) {
	if (!before) return null;
	const change = (now - before) / before;
	const Icon = change > 0 ? TrendingUpIcon : change < 0 ? TrendingDownIcon : null;
	return (
		<p className="flex items-center gap-1.5 pb-5 text-sm text-foreground/50">
			{Icon && (
				<Icon
					className={cn('size-4', change > 0 && 'text-emerald-600 dark:text-emerald-500')}
					aria-hidden
				/>
			)}
			{change === 0
				? 'the same as the week before'
				: `${PERCENT.format(Math.abs(change))} ${change > 0 ? 'up' : 'down'} on the week before`}
		</p>
	);
}

// The top pages and sources of the week, as /admin/stats ranks them.
export function ReadersCard({ loaded, className }: { loaded: Loaded<Visits>; className?: string }) {
	return (
		<Area title="readers" href="/admin/stats" section="pages" loaded={loaded} className={className}>
			{(visits) => (
				<>
					<div>
						<RankingHeading section="pages">most read</RankingHeading>
						<Ranking rows={visits.pages} empty="No pages read this week." />
					</div>
					<div>
						<RankingHeading section="sources">came from</RankingHeading>
						<Ranking rows={visits.sources} empty="No visits this week." />
					</div>
				</>
			)}
		</Area>
	);
}

function RankingHeading({ section, children }: { section: string; children: string }) {
	return (
		<h3 className="flex justify-between border-b border-foreground/10 pb-1.5 text-xs text-foreground/50">
			<SubLead to="/admin/stats" section={section}>
				{children}
			</SubLead>
			<span>visitors, 7 days</span>
		</h3>
	);
}
