import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { XIcon } from 'lucide-react';
import { lazy, Suspense, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail } from '~/components/admin/AdminHeader';
import { readSection, Subsections } from '~/components/admin/Subsections';
import {
	busiest,
	country,
	duration,
	formatMetric,
	NUMBER,
	place
} from '~/components/admin/stats/format';
import { FilterMenu } from '~/components/admin/stats/FilterMenu';
import { Heatmap } from '~/components/admin/stats/Heatmap';
import { MetricCards } from '~/components/admin/stats/Metrics';
import { Ranking, Shares, StatsCard } from '~/components/admin/stats/Cards';
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
import { arrivals } from '~/lib/stats/sources';
import { cn } from '~/lib/utils';

// Who visits the site and what they do there, from lib/stats. The range, the
// number on the chart, any filters and the section showing are in the URL, so
// a view can be bookmarked.
//
// The overview answers "how is the site doing": the headline numbers against
// the time before, their shape over the range, and the top few of what was
// read, where from and on what. Each of those has a section of its own with
// the whole lists.
const SECTIONS = ['overview', 'pages', 'sources', 'places', 'devices', 'visits'] as const;
type Section = (typeof SECTIONS)[number];
// sections that were folded into others, so old links still land somewhere
const MOVED: Record<string, Section> = { traffic: 'overview', times: 'visits' };
type Search = { range?: Range; metric?: Metric; section?: Section } & Filters;

export const Route = createFileRoute('/admin/stats/')({
	validateSearch: (search: Record<string, unknown>): Search => ({
		...(isRange(search.range) && { range: search.range }),
		...(isMetric(search.metric) && { metric: search.metric }),
		...readFilters(search),
		...readSection(SECTIONS, {
			section: MOVED[search.section as string] ?? search.section
		})
	}),
	beforeLoad: requireAdmin,
	loaderDeps: ({ search }) => ({
		range: search.range ?? '7d',
		filters: readFilters(search as Record<string, unknown>)
	}),
	loader: ({ deps }) => getStats({ data: deps }),
	// switching sections or the chart's number asks nothing new; a new range or filter does
	shouldReload: ({ cause }) => cause !== 'stay',
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
	return <div aria-hidden className="mx-auto aspect-square max-w-80" />;
}

function filterLabel(key: FilterKey, value: string) {
	const name = { page: 'page', source: 'from', country: 'in', region: 'in', city: 'in' }[
		key as string
	];
	const shown = key === 'country' ? country(value) : value;
	return `${name ?? DIMENSIONS[key].title.replace(/s$/, '')} ${shown}`;
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

	const header = (
		<>
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
									aria-label={`Stop filtering by ${DIMENSIONS[key].title}`}
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
		</>
	);

	return (
		<TooltipProvider>
			{stats.totals.views ? (
				<Report
					stats={stats}
					section={search.section}
					onSection={(next) =>
						navigate({
							search: (prev) => ({
								...prev,
								section: next === 'overview' ? undefined : (next as Section)
							})
						})
					}
					metric={metric}
					onMetric={(next) =>
						navigate({
							search: (prev) => ({ ...prev, metric: next === 'visitors' ? undefined : next })
						})
					}
					onFilter={setFilter}
				>
					{header}
				</Report>
			) : (
				<div className="mx-auto max-w-4xl">
					{header}
					<p className="mt-10 text-foreground/50">
						{filters.length
							? 'No visits match these filters in this range.'
							: 'Nobody has visited in this range. Visits count from when this page went live, and yours are left out while you are signed in.'}
					</p>
				</div>
			)}
		</TooltipProvider>
	);
}

// Each section's cards, in one column on a phone or a narrow column and side
// by side when there is room. The widths are the column's own (a container
// query), since beside two sidebars a wide window can still leave it narrow.
function SectionBody({ id, children }: { id: Section; children: ReactNode }) {
	return (
		// clear of the sticky controls rail when scrolled to
		<div id={`stats-${id}`} className="@container flex scroll-mt-24 flex-col gap-4">
			{children}
		</div>
	);
}

function Report({
	children,
	stats,
	section,
	onSection,
	metric,
	onMetric,
	onFilter
}: {
	children: ReactNode;
	stats: Stats;
	section: Section | undefined;
	onSection: (section: string) => void;
	metric: Metric;
	onMetric: (metric: Metric) => void;
	onFilter: (key: FilterKey, value: string) => void;
}) {
	const hydrated = useHydrated();
	const hourly = stats.bucket < 24 * 60 * 60 * 1000;
	const { breakdowns: b, filters, totals } = stats;
	const before = `the ${RANGES[stats.range].label.toLowerCase()} before`;

	// "all pages" and the like: on a wide screen the section takes the
	// overview's place, from its top; on a phone, where every section is on
	// the one page, it scrolls down to it
	const open = (key: Section) => () => {
		onSection(key);
		if (window.matchMedia('(min-width: 64rem)').matches) window.scrollTo({ top: 0 });
		else document.getElementById(`stats-${key}`)?.scrollIntoView({ behavior: 'smooth' });
	};

	// a ranking that filters by its own dimension
	const ranking = (
		key: FilterKey,
		rows: Row[],
		options: { format?: (row: Row) => string; limit?: number; empty?: string; height?: string } = {}
	) => (
		<Ranking
			rows={rows}
			active={filters[key]}
			onPick={(row) => onFilter(key, row.key)}
			{...options}
		/>
	);
	const shares = (key: FilterKey, rows: Row[]) => (
		<Shares rows={rows} active={filters[key]} onPick={(row) => onFilter(key, row.key)} />
	);

	// visitors with no place: Cloudflare could not tell, or (on this machine)
	// there is no Cloudflare to ask
	const placed = b.country.reduce((sum, row) => sum + row.visitors, 0);
	const unplaced = Math.max(0, (totals.visitors ?? 0) - placed);
	const noPlaces = 'No places known. They come from Cloudflare, so visits here have none.';
	const countryName = (row: Row) => country(row.key);

	const when = busiest(stats.heatmap);

	return (
		<Subsections
			title="stats"
			value={section}
			onChange={onSection}
			sections={[
				{
					key: 'overview',
					label: 'overview',
					content: (
						<SectionBody id="overview">
							<MetricCards
								totals={totals}
								previous={stats.previous}
								series={stats.series}
								compared={before}
								value={metric}
								onChange={onMetric}
							/>

							<StatsCard
								title={`${METRICS[metric].label} ${hourly ? 'by hour' : 'by day'}`}
								description={
									stats.previous
										? `the last ${RANGES[stats.range].label.toLowerCase()}; the arrows compare with ${before}`
										: 'since the first visit'
								}
							>
								<TimeChart
									key={metric}
									data={stats.series}
									dataKey={metric}
									label={METRICS[metric].label}
									hourly={hourly}
									format={(value) => formatMetric(metric, value)}
									className="-ml-2 aspect-auto h-56 w-[calc(100%+0.5rem)]"
								/>
							</StatsCard>

							<div className="grid gap-4 @xl:grid-cols-2">
								<StatsCard
									title="top pages"
									unit="visitors"
									more={{ label: `all ${stats.pages.length} pages`, onClick: open('pages') }}
								>
									<Ranking
										rows={stats.pages}
										limit={5}
										active={filters.page}
										onPick={(row) => onFilter('page', row.key)}
									/>
								</StatsCard>
								<StatsCard
									title="top sources"
									unit="visitors"
									more={{ label: 'all sources and campaigns', onClick: open('sources') }}
								>
									{ranking('source', b.source, { limit: 5 })}
								</StatsCard>
								<StatsCard
									title="where from"
									unit="visitors"
									more={{ label: `all ${b.country.length} countries`, onClick: open('places') }}
								>
									{ranking('country', b.country, {
										limit: 5,
										format: countryName,
										empty: noPlaces
									})}
								</StatsCard>
								<StatsCard
									title="devices"
									unit="visitors"
									more={{ label: 'browsers, systems, screens', onClick: open('devices') }}
								>
									{shares('device', b.device)}
								</StatsCard>
							</div>

							<StatsCard
								title="latest visits"
								more={{
									label: `all ${stats.recent.length} latest visits`,
									onClick: open('visits')
								}}
							>
								<div className="-mx-2 -my-3">
									<VisitList visits={stats.recent.slice(0, 3)} />
								</div>
							</StatsCard>
						</SectionBody>
					)
				},
				{
					key: 'pages',
					label: 'pages',
					content: (
						<SectionBody id="pages">
							<StatsCard title="pages" description="what was read, for how long, and how far down">
								<PageTable
									rows={stats.pages}
									active={filters.page}
									onPick={(row) => onFilter('page', row.key)}
								/>
							</StatsCard>
							<div className="grid gap-4 @xl:grid-cols-2">
								<StatsCard title="entry pages" description="where visits start" unit="visitors">
									{ranking('page', b.entry)}
								</StatsCard>
								<StatsCard title="links followed" description="where visits leave to" unit="clicks">
									<Ranking
										rows={stats.clicks}
										by="views"
										format={(row) => row.label.replace(/^https?:\/\//, '').replace(/\/$/, '')}
										empty="No links followed off the site."
									/>
								</StatsCard>
							</div>
						</SectionBody>
					)
				},
				{
					key: 'sources',
					label: 'sources',
					content: (
						<SectionBody id="sources">
							<StatsCard
								title="how people arrive"
								description="typed in or bookmarked, searched for, shared on social sites, or linked from others"
								unit="visitors"
							>
								<Shares rows={arrivals(b.source)} />
							</StatsCard>
							<div className="grid items-start gap-4 @xl:grid-cols-2">
								<StatsCard
									title="sources"
									description="the site each visit came from"
									unit="visitors"
								>
									{ranking('source', b.source)}
								</StatsCard>
								<StatsCard
									title="campaigns"
									description="links shared with ?ref= or utm tags"
									unit="visitors"
								>
									<Ranking
										rows={b.campaign}
										empty="No campaign links used. Add ?ref=name to a link you share."
									/>
								</StatsCard>
							</div>
						</SectionBody>
					)
				},
				{
					key: 'places',
					label: 'places',
					content: (
						<SectionBody id="places">
							<StatsCard
								title="countries"
								description={
									unplaced > 0 && placed > 0
										? `and ${NUMBER.format(unplaced)} ${unplaced === 1 ? 'visitor' : 'visitors'} from places unknown`
										: undefined
								}
								unit="visitors"
							>
								<div className="grid items-start gap-6 @2xl:grid-cols-2">
									{/* the sea is drawn in the page's colour; here the page is the card */}
									<div style={{ '--background': 'var(--card)' } as CSSProperties}>
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
									</div>
									{ranking('country', b.country, {
										format: countryName,
										empty: noPlaces,
										height: 'max-h-80'
									})}
								</div>
							</StatsCard>
							<div className="grid items-start gap-4 @xl:grid-cols-2">
								<StatsCard title="regions" unit="visitors">
									{ranking('region', b.region, { limit: 10, empty: noPlaces })}
								</StatsCard>
								<StatsCard title="cities" unit="visitors">
									{ranking('city', b.city, { limit: 10, empty: noPlaces })}
								</StatsCard>
							</div>
						</SectionBody>
					)
				},
				{
					key: 'devices',
					label: 'devices',
					content: (
						<SectionBody id="devices">
							<div className="grid items-start gap-4 @xl:grid-cols-2">
								<StatsCard title="devices" unit="visitors">
									{shares('device', b.device)}
								</StatsCard>
								<StatsCard title="light or dark" unit="visitors">
									{shares('theme', b.theme)}
								</StatsCard>
								{(['browser', 'os', 'screen', 'language'] as const).map((key) => (
									<StatsCard key={key} title={DIMENSIONS[key].title} unit="visitors">
										{ranking(key, b[key], { limit: 8 })}
									</StatsCard>
								))}
								<StatsCard
									title="networks"
									description="who runs the connection: a home provider, a phone network, a company"
									unit="visitors"
									className="@xl:col-span-2"
								>
									{ranking('network', b.network, {
										limit: 10,
										empty: 'No networks known. They come from Cloudflare, so visits here have none.'
									})}
								</StatsCard>
							</div>
						</SectionBody>
					)
				},
				{
					key: 'visits',
					label: 'visits',
					content: (
						<SectionBody id="visits">
							<StatsCard
								title="when people visit"
								description={when ? `busiest on ${when}, in your time` : undefined}
								unit="visitors"
							>
								<Heatmap cells={stats.heatmap} />
							</StatsCard>
							<div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
								<StatsCard title="latest visits" unit={`${stats.recent.length} shown`}>
									<ScrollArea fade className="-mx-2 -my-3" viewportClassName="max-h-[36rem]">
										<VisitList visits={stats.recent} />
									</ScrollArea>
								</StatsCard>
								<StatsCard title="regulars" description="who comes back most" unit="visits">
									<ScrollArea fade className="-mx-2 -my-3" viewportClassName="max-h-[36rem]">
										<VisitorList visitors={stats.visitors} />
									</ScrollArea>
								</StatsCard>
							</div>
						</SectionBody>
					)
				}
			]}
		>
			{children}
		</Subsections>
	);
}

// Pages with how long they were read and how far down, under a heading row
// that names the columns.
function PageTable({
	rows,
	active,
	onPick
}: {
	rows: PageRow[];
	active?: string;
	onPick: (row: PageRow) => void;
}) {
	if (!rows.length) return <p className="py-2 text-foreground/50">Nothing yet.</p>;
	const max = Math.max(1, ...rows.map((row) => row.visitors));
	const columns =
		'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 @lg:grid-cols-[minmax(0,1fr)_4rem_4.5rem_4rem]';
	return (
		<div>
			<div className={cn(columns, 'pb-2 text-xs text-foreground/50')} aria-hidden>
				<span className="pl-2">page</span>
				<span className="text-right @max-lg:pr-2">visitors</span>
				<span className="hidden text-right @lg:block">read for</span>
				<span className="hidden pr-2 text-right @lg:block">scrolled</span>
			</div>
			<ScrollArea fade viewportClassName="max-h-[30rem]">
				<ol className="pr-3">
					{rows.map((row) => (
						<li key={row.key}>
							<button
								type="button"
								onClick={() => onPick(row)}
								title={`Show only ${row.label}`}
								className={cn(
									columns,
									'group/row relative w-full cursor-pointer py-1.5 text-left tabular-nums',
									active === row.key && 'font-medium'
								)}
							>
								<span
									aria-hidden
									className="absolute inset-y-1 left-0 rounded-[4px] bg-foreground/[0.05] transition-colors group-hover/row:bg-foreground/[0.09]"
									style={{ width: `${Math.max((row.visitors / max) * 100, 0.5)}%` }}
								/>
								<span className="relative truncate pl-2">{row.label}</span>
								<span className="relative text-right @max-lg:pr-2">
									{NUMBER.format(row.visitors)}
								</span>
								<span className="relative hidden text-right text-foreground/60 @lg:block">
									{duration(row.engaged)}
								</span>
								<span className="relative hidden pr-2 text-right text-foreground/60 @lg:block">
									{row.scroll === null ? '–' : `${Math.round(row.scroll)}%`}
								</span>
							</button>
						</li>
					))}
				</ol>
			</ScrollArea>
		</div>
	);
}

// The people who come most often, each opening their own page.
function VisitorList({ visitors }: { visitors: Stats['visitors'] }) {
	if (!visitors.length) return <p className="px-2 py-3 text-foreground/50">No visitors yet.</p>;
	return (
		<ol className="divide-y divide-foreground/5">
			{visitors.map((visitor) => (
				<li key={visitor.visitor}>
					<a
						href={`/admin/stats/visitors/${visitor.visitor}`}
						className="flex items-baseline justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-foreground/[0.03]"
					>
						<span className="flex min-w-0 flex-col gap-1">
							<span className="truncate">
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
