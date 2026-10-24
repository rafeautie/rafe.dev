import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail } from '~/components/admin/AdminHeader';
import { country, duration, formatMetric, NUMBER, place } from '~/components/admin/stats/format';
import { FilterMenu } from '~/components/admin/stats/FilterMenu';
import { Heatmap } from '~/components/admin/stats/Heatmap';
import { Panel, Ranking, type View } from '~/components/admin/stats/Panel';
import { TimeChart } from '~/components/admin/stats/TimeChart';
import { VisitList } from '~/components/admin/stats/Visits';
import { Badge } from '~/components/ui/badge';
import { ScrollArea } from '~/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { TooltipProvider } from '~/components/ui/tooltip';
import { requireAdmin } from '~/lib/admin/guard';
import { timeAgo } from '~/lib/admin/time';
import {
	DIMENSIONS,
	FILTER_KEYS,
	type FilterKey,
	type Filters,
	isMetric,
	isRange,
	type Metric,
	METRICS,
	type Range,
	RANGES,
	readFilters
} from '~/lib/stats/dimensions';
import { getStats, type PageRow, type Row } from '~/lib/stats/report';
import { cn } from '~/lib/utils';

// Who visits the site and what they do there, from lib/stats. The range, the
// number on the chart and any filters are in the URL, so a view can be
// bookmarked; which tab each section shows is remembered in this browser.
type Search = { range?: Range; metric?: Metric } & Filters;

export const Route = createFileRoute('/admin/stats/')({
	validateSearch: (search: Record<string, unknown>): Search => ({
		...(isRange(search.range) && { range: search.range }),
		...(isMetric(search.metric) && { metric: search.metric }),
		...readFilters(search)
	}),
	beforeLoad: requireAdmin,
	loaderDeps: ({ search }) => ({
		range: search.range ?? '7d',
		filters: readFilters(search as Record<string, unknown>)
	}),
	loader: ({ deps }) => getStats({ data: deps }),
	component: StatsPage
});

type Stats = Awaited<ReturnType<typeof getStats>>;

// The globe draws in the browser only, so the server's bundle leaves it and
// its outlines out; the page holds its space until it loads.
const Globe = import.meta.env.SSR
	? null
	: lazy(() =>
			import('~/components/admin/stats/Globe').then((module) => ({ default: module.Globe }))
		);
const noop = () => () => undefined;
const useHydrated = () =>
	useSyncExternalStore(
		noop,
		() => true,
		() => false
	);

function GlobeSpace() {
	return (
		<div aria-hidden>
			<div className="h-9" />
			<div className="mx-auto aspect-square max-w-80" />
		</div>
	);
}

// A section's chosen tab, remembered in this browser. The server, which has no
// storage, renders the default, and the browser switches once hydrated.
const choiceListeners = new Set<() => void>();

function readChoice(key: string) {
	try {
		return localStorage.getItem(`rafe-admin:stats:${key}`);
	} catch {
		return null;
	}
}

function useChoice(key: string, initial: string) {
	const saved = useSyncExternalStore(
		(listener) => {
			choiceListeners.add(listener);
			return () => choiceListeners.delete(listener);
		},
		() => readChoice(key),
		() => null
	);
	const [value, setValue] = useState<string | null>(null);
	return [
		value ?? saved ?? initial,
		(next: string) => {
			setValue(next);
			try {
				localStorage.setItem(`rafe-admin:stats:${key}`, next);
			} catch {
				// storage blocked: remembered until the page closes
			}
		}
	] as const;
}

function filterLabel(key: FilterKey, value: string) {
	const name = { page: 'page', source: 'from', country: 'in', region: 'in', city: 'in' }[
		key as string
	];
	const shown = key === 'country' ? country(value) : value;
	return `${name ?? DIMENSIONS[key].title.toLowerCase().replace(/s$/, '')} ${shown}`;
}

function StatsPage() {
	const stats = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const metric = search.metric ?? 'visitors';
	const filters = Object.entries(stats.filters) as [FilterKey, string][];
	const setFilter = (key: FilterKey, value: string | undefined) =>
		navigate({ search: (prev) => ({ ...prev, [key]: value }) });
	// what each filter can be, from what is in view
	const values = Object.fromEntries(
		FILTER_KEYS.map((key) => [key, key === 'page' ? stats.pages : stats.breakdowns[key]])
	) as Record<FilterKey, Row[]>;

	return (
		<TooltipProvider>
			<div className="mx-auto max-w-4xl">
				<AdminHeader
					path={[
						<Link key="rafe" href="/">
							rafe
						</Link>,
						<Link key="admin" href="/admin">
							admin
						</Link>,
						'stats'
					]}
				/>

				<ControlsRail
					status={
						<>
							<span suppressHydrationWarning>
								{stats.last
									? `last visit ${timeAgo(new Date(stats.last).toISOString())}`
									: 'no visits yet'}
							</span>
							{filters.map(([key, value]) => (
								<Badge key={key} variant="secondary" className="h-auto py-1 pr-1 font-normal">
									{filterLabel(key, value)}
									<button
										type="button"
										aria-label={`Stop filtering by ${DIMENSIONS[key].title.toLowerCase()}`}
										onClick={() => setFilter(key, undefined)}
										className="cursor-pointer rounded-full p-0.5 hover:bg-foreground/10"
									>
										<XIcon className="size-3" />
									</button>
								</Badge>
							))}
						</>
					}
				>
					<FilterMenu values={values} filters={stats.filters} onFilter={setFilter} />
					<ToggleGroup
						variant="outline"
						spacing={0}
						aria-label="Time range"
						value={[stats.range]}
						onValueChange={(value) => {
							const range = value[0];
							if (isRange(range)) {
								navigate({
									search: (prev) => ({ ...prev, range: range === '7d' ? undefined : range })
								});
							}
						}}
					>
						{(Object.keys(RANGES) as Range[]).map((range) => (
							<ToggleGroupItem
								key={range}
								value={range}
								title={RANGES[range].label}
								className="px-2.5 font-normal"
							>
								{range}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</ControlsRail>

				{stats.totals.views ? (
					<Report
						stats={stats}
						metric={metric}
						onMetric={(next) =>
							navigate({
								search: (prev) => ({ ...prev, metric: next === 'visitors' ? undefined : next })
							})
						}
						onFilter={setFilter}
					/>
				) : (
					<p className="mt-10 text-foreground/50">
						{filters.length
							? 'No visits match these filters in this range.'
							: 'Nobody has visited in this range. Visits count from when this page went live, and yours are left out while you are signed in.'}
					</p>
				)}
			</div>
		</TooltipProvider>
	);
}

function Report({
	stats,
	metric,
	onMetric,
	onFilter
}: {
	stats: Stats;
	metric: Metric;
	onMetric: (metric: Metric) => void;
	onFilter: (key: FilterKey, value: string) => void;
}) {
	const [pagesTab, setPagesTab] = useChoice('pages', 'page');
	const [sourcesTab, setSourcesTab] = useChoice('sources', 'source');
	const [placesTab, setPlacesTab] = useChoice('places', 'country');
	const [moreTab, setMoreTab] = useChoice('more', 'device');
	const [visitsTab, setVisitsTab] = useChoice('visits', 'latest');
	const hydrated = useHydrated();
	const hourly = stats.bucket < 24 * 60 * 60 * 1000;
	const { breakdowns: b, filters } = stats;

	// a ranking that filters by its own dimension
	const ranking = (key: FilterKey, rows: Row[], format?: (row: Row) => string) => (
		<Ranking
			rows={rows}
			active={filters[key]}
			onPick={(row) => onFilter(key, row.key)}
			format={format}
		/>
	);

	const more: View[] = (
		['device', 'browser', 'os', 'screen', 'language', 'network', 'theme'] as const
	).map((key) => ({
		key,
		title: DIMENSIONS[key].title,
		unit: 'visitors',
		content: ranking(key, b[key])
	}));

	return (
		<>
			{/* the headline numbers; choosing one charts it over time */}
			<div
				role="tablist"
				aria-label="Chart"
				className="mt-8 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6"
			>
				{(Object.keys(METRICS) as Metric[]).map((key) => (
					<button
						key={key}
						type="button"
						role="tab"
						aria-selected={metric === key}
						onClick={() => onMetric(key)}
						className={cn(
							'flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]',
							metric === key && 'bg-foreground/[0.05] hover:bg-foreground/[0.05]'
						)}
					>
						<span className="text-sm text-foreground/50">{METRICS[key].label}</span>
						<span className="text-2xl font-medium tracking-tight tabular-nums">
							{formatMetric(key, stats.totals[key])}
						</span>
					</button>
				))}
			</div>

			<section className="mt-6">
				<TimeChart
					key={metric}
					data={stats.series}
					dataKey={metric}
					label={METRICS[metric].label}
					hourly={hourly}
					format={(value) => formatMetric(metric, value)}
				/>
			</section>

			<div className="mt-12 grid gap-x-12 gap-y-12 sm:grid-cols-2">
				<Panel
					className="sm:col-span-2"
					value={pagesTab}
					onChange={setPagesTab}
					views={[
						{
							key: 'page',
							title: 'Pages',
							unit: (
								<>
									visitors
									<span className="max-sm:hidden"> · read for · scrolled</span>
								</>
							),
							content: (
								<PageTable
									rows={stats.pages}
									active={filters.page}
									onPick={(row) => onFilter('page', row.key)}
								/>
							)
						},
						{
							key: 'entry',
							title: 'Entry pages',
							unit: 'visitors',
							content: ranking('page', b.entry)
						},
						{
							key: 'clicks',
							title: 'Links followed',
							unit: 'clicks',
							content: (
								<Ranking
									rows={stats.clicks}
									by="views"
									format={(row) => row.label.replace(/^https?:\/\//, '').replace(/\/$/, '')}
									empty="No links followed off the site."
								/>
							)
						}
					]}
				/>
				<div className="grid items-start gap-x-12 gap-y-6 sm:col-span-2 sm:grid-cols-2">
					<section>
						{Globe && hydrated ? (
							<Suspense fallback={<GlobeSpace />}>
								<Globe
									countries={b.country}
									cities={stats.places.cities}
									active={filters}
									onPick={onFilter}
								/>
							</Suspense>
						) : (
							<GlobeSpace />
						)}
					</section>
					<Panel
						value={placesTab}
						onChange={setPlacesTab}
						views={[
							{
								key: 'country',
								title: 'Countries',
								unit: 'visitors',
								content: ranking('country', b.country, (row) => country(row.key))
							},
							{
								key: 'region',
								title: 'Regions',
								unit: 'visitors',
								content: ranking('region', b.region)
							},
							{ key: 'city', title: 'Cities', unit: 'visitors', content: ranking('city', b.city) }
						]}
					/>
				</div>
				<Panel
					value={sourcesTab}
					onChange={setSourcesTab}
					views={[
						{
							key: 'source',
							title: 'Sources',
							unit: 'visitors',
							content: ranking('source', b.source)
						},
						{
							key: 'campaign',
							title: 'Campaigns',
							unit: 'visitors',
							content: (
								<Ranking
									rows={b.campaign}
									empty="No campaign links used. Add ?ref=name to a link you share."
								/>
							)
						}
					]}
				/>
				<Panel menu value={moreTab} onChange={setMoreTab} views={more} />
				<section className="sm:col-span-2">
					<h2 className="flex min-h-10 items-center border-b border-foreground/10 pb-2 text-sm text-foreground/50">
						When people visit
					</h2>
					<div className="pt-4">
						<Heatmap cells={stats.heatmap} />
					</div>
				</section>
			</div>

			<Panel
				className="mt-12"
				value={visitsTab}
				onChange={setVisitsTab}
				views={[
					{
						key: 'latest',
						title: 'Latest visits',
						unit: `${stats.recent.length} shown`,
						content: (
							<ScrollArea fade viewportClassName="max-h-[32rem]">
								<VisitList visits={stats.recent} />
							</ScrollArea>
						)
					},
					{
						key: 'visitors',
						title: 'Visitors',
						unit: 'visits',
						content: (
							<ScrollArea fade viewportClassName="max-h-[32rem]">
								<VisitorList visitors={stats.visitors} />
							</ScrollArea>
						)
					}
				]}
			/>
		</>
	);
}

function PageTable({
	rows,
	active,
	onPick
}: {
	rows: PageRow[];
	active?: string;
	onPick: (row: PageRow) => void;
}) {
	if (!rows.length) return <p className="py-3 text-foreground/50">Nothing yet.</p>;
	const max = Math.max(1, ...rows.map((row) => row.visitors));
	return (
		<ScrollArea fade viewportClassName="max-h-[22.5rem]">
			<ol className="py-1 pr-3">
				{rows.map((row) => (
					<li key={row.key}>
						<button
							type="button"
							onClick={() => onPick(row)}
							title={`Show only ${row.label}`}
							className={cn(
								'group/row relative grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 py-2 text-left tabular-nums sm:grid-cols-[minmax(0,1fr)_3.5rem_4rem_3.5rem]',
								active === row.key && 'font-medium'
							)}
						>
							<span
								aria-hidden
								className="absolute inset-y-1 left-0 rounded-[4px] bg-foreground/[0.05] transition-colors group-hover/row:bg-foreground/[0.09]"
								style={{ width: `${Math.max((row.visitors / max) * 100, 0.5)}%` }}
							/>
							<span className="relative truncate pl-2">{row.label}</span>
							<span className="relative text-right max-sm:pr-2">{NUMBER.format(row.visitors)}</span>
							<span className="relative hidden text-right text-foreground/60 sm:block">
								{duration(row.engaged)}
							</span>
							<span className="relative hidden pr-2 text-right text-foreground/60 sm:block">
								{row.scroll === null ? '–' : `${Math.round(row.scroll)}%`}
							</span>
						</button>
					</li>
				))}
			</ol>
		</ScrollArea>
	);
}

// The people who come most often, each opening their own page.
function VisitorList({ visitors }: { visitors: Stats['visitors'] }) {
	if (!visitors.length) return <p className="py-3 text-foreground/50">No visitors yet.</p>;
	return (
		<ol className="divide-y divide-foreground/5">
			{visitors.map((visitor) => (
				<li key={visitor.visitor}>
					<a
						href={`/admin/stats/visitors/${visitor.visitor}`}
						className="flex items-baseline justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-foreground/[0.03]"
					>
						<span className="flex min-w-0 flex-col gap-1">
							<span>
								{place(visitor) || 'Somewhere'}
								<span className="text-foreground/50">
									{' '}
									· {visitor.browser} on {visitor.os}
								</span>
							</span>
							<span suppressHydrationWarning className="text-sm text-foreground/50">
								{[
									`${NUMBER.format(visitor.views)} ${visitor.views === 1 ? 'page' : 'pages'}`,
									duration(visitor.engaged),
									`last seen ${timeAgo(new Date(visitor.last).toISOString())}`,
									visitor.anonymous ? 'not tracked' : null
								]
									.filter(Boolean)
									.join(' · ')}
							</span>
						</span>
						<span className="shrink-0 tabular-nums">{NUMBER.format(visitor.visits)}</span>
					</a>
				</li>
			))}
		</ol>
	);
}
