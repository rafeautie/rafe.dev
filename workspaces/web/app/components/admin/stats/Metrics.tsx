import { Card } from '~/components/ui/card';
import { type Metric, METRICS } from '~/lib/stats/dimensions';
import type { Point } from '~/lib/stats/report';
import { cn } from '~/lib/utils';
import { formatMetric } from './format';

// The headline numbers, a card each: the number for the range, how it moved
// against the time just before, and its shape over the range. Choosing one
// puts it on the big chart.

// Shares of visits (bounce, returning) move by points, not by a percentage
// of themselves: 40% to 44% is up 4 points, not up 10%.
const RATES: Metric[] = ['bounce', 'returning'];
// a bounce going up is a bad sign, unlike the rest
const LOWER_IS_BETTER: Metric[] = ['bounce'];

function change(metric: Metric, now: number | null, before: number | null) {
	if (now === null || before === null) return null;
	if (RATES.includes(metric)) {
		const points = Math.round((now - before) * 100);
		return { text: `${Math.abs(points)} pts`, direction: Math.sign(points) };
	}
	if (!before) return now ? { text: 'new', direction: 1 } : null;
	const percent = Math.round(((now - before) / before) * 100);
	return { text: `${Math.abs(percent)}%`, direction: Math.sign(percent) };
}

export function MetricCards({
	totals,
	previous,
	series,
	compared,
	value,
	onChange
}: {
	totals: Record<Metric, number | null>;
	previous: Record<Metric, number | null> | null;
	series: Point[];
	// what the change is against, for its tooltip: "the 7 days before"
	compared: string;
	value: Metric;
	onChange: (metric: Metric) => void;
}) {
	return (
		<div role="tablist" aria-label="Chart" className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
			{(Object.keys(METRICS) as Metric[]).map((key) => {
				const moved = previous && change(key, totals[key], previous[key]);
				const good = moved && (LOWER_IS_BETTER.includes(key) ? -1 : 1) * moved.direction;
				const selected = value === key;
				return (
					<Card
						key={key}
						size="sm"
						className={cn(
							'relative gap-1 transition-[box-shadow,background-color] has-[button:hover]:bg-foreground/[0.02]',
							selected && 'ring-2 ring-foreground/60'
						)}
					>
						{/* the whole card is the button; its label is the card's text */}
						<button
							type="button"
							role="tab"
							aria-selected={selected}
							onClick={() => onChange(key)}
							className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							<span className="sr-only">Chart {METRICS[key].label}</span>
						</button>
						<span className="truncate px-3 text-sm text-foreground/50">{METRICS[key].label}</span>
						<span className="flex items-baseline justify-between gap-2 px-3">
							<span className="text-2xl font-medium tracking-tight tabular-nums">
								{formatMetric(key, totals[key])}
							</span>
							{moved && (
								<span
									title={`${formatMetric(key, previous[key])} in ${compared}`}
									className={cn(
										'shrink-0 text-xs tabular-nums',
										good === 1 ? 'text-foreground/80' : 'text-foreground/45'
									)}
								>
									{moved.direction > 0 ? '↑' : moved.direction < 0 ? '↓' : '→'} {moved.text}
								</span>
							)}
						</span>
						<Sparkline
							values={series.map((point) => point[key])}
							className={cn('mt-1 h-7 px-3', selected ? 'text-foreground' : 'text-foreground/35')}
						/>
					</Card>
				);
			})}
		</div>
	);
}

// A number's shape over the range, too small for an axis. Gaps (no visits
// that hour) are skipped over rather than drawn as zero.
export function Sparkline({
	values,
	className
}: {
	values: (number | null)[];
	className?: string;
}) {
	const known = values.filter((value): value is number => value !== null);
	if (known.length < 2) return <div className={className} />;
	const max = Math.max(...known);
	const min = Math.min(0, ...known);
	const span = max - min || 1;
	const step = 100 / Math.max(1, values.length - 1);
	const points = values
		.map((value, index) =>
			value === null
				? null
				: `${(index * step).toFixed(2)},${(22 - ((value - min) / span) * 20).toFixed(2)}`
		)
		.filter(Boolean);
	return (
		<div className={className} aria-hidden>
			<svg viewBox="0 0 100 24" preserveAspectRatio="none" className="size-full overflow-visible">
				<polyline
					points={points.join(' ')}
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					strokeLinejoin="round"
					strokeLinecap="round"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</div>
	);
}
