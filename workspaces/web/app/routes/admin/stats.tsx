import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail } from '~/components/admin/AdminHeader';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { requireAdmin } from '~/lib/admin/guard';
import { timeAgo } from '~/lib/admin/time';
import {
	getStats,
	isRange,
	RANGES,
	type PageRow,
	type Range,
	type Row,
	type Visit
} from '~/lib/stats/report';
import { cn } from '~/lib/utils';

// Who visits the site and what they do there, from lib/stats. The range is in
// the URL, so a view can be bookmarked.
export const Route = createFileRoute('/admin/stats')({
	validateSearch: (search: Record<string, unknown>): { range?: Range } =>
		isRange(search.range) ? { range: search.range } : {},
	beforeLoad: requireAdmin,
	loaderDeps: ({ search }) => ({ range: search.range ?? '7d' }),
	loader: ({ deps }) => getStats({ data: deps }),
	component: StatsPage
});

type Stats = Awaited<ReturnType<typeof getStats>>;

const NUMBER = new Intl.NumberFormat('en-US');
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const HOUR = new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: 'UTC' });
const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' });

function country(code: string | null) {
	if (!code) return '';
	try {
		return REGIONS.of(code) ?? code;
	} catch {
		return code;
	}
}

// 45s, 3m 12s, 1h 5m
function duration(ms: number | null) {
	if (ms === null || !Number.isFinite(ms)) return '–';
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function ordinal(n: number) {
	const suffix = ['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th';
	return `${n}${suffix}`;
}

function StatsPage() {
	const stats = Route.useLoaderData();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
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
					<span>
						{stats.last
							? `last visit ${timeAgo(new Date(stats.last).toISOString())}`
							: 'no visits yet'}
					</span>
				}
			>
				<ToggleGroup
					variant="outline"
					spacing={0}
					aria-label="Time range"
					value={[stats.range]}
					onValueChange={(value) => {
						const range = value[0];
						if (isRange(range)) navigate({ search: range === '7d' ? {} : { range } });
					}}
				>
					{(Object.keys(RANGES) as Range[]).map((range) => (
						<ToggleGroupItem
							key={range}
							value={range}
							title={RANGES[range].label}
							className="px-2.5 font-normal"
						>
							{range === 'all' ? 'all' : range}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</ControlsRail>

			{stats.views ? <Report stats={stats} /> : <Empty />}
		</div>
	);
}

function Empty() {
	return (
		<p className="mt-10 text-foreground/50">
			Nobody has visited in this range. Visits are counted from the moment this page went live, and
			yours are left out while you are signed in.
		</p>
	);
}

function Report({ stats }: { stats: Stats }) {
	return (
		<>
			<dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
				<Figure label="Visitors" value={NUMBER.format(stats.visitors)} />
				<Figure label="Visits" value={NUMBER.format(stats.visits)} />
				<Figure label="Page views" value={NUMBER.format(stats.views)} />
				<Figure label="Visit length" value={duration(stats.visitLength)} />
				<Figure
					label="Left after one page"
					value={stats.bounceRate === null ? '–' : PERCENT.format(stats.bounceRate)}
				/>
				<Figure
					label="Returning"
					value={stats.returningRate === null ? '–' : PERCENT.format(stats.returningRate)}
				/>
			</dl>

			<Chart stats={stats} />

			<Pages rows={stats.pages} />

			<div className="mt-14 grid gap-x-12 gap-y-14 sm:grid-cols-2">
				<List title="Sources" rows={stats.sources} unit="visits" by="views" />
				{stats.campaigns.length > 0 && (
					<List title="Campaigns" rows={stats.campaigns} unit="visits" by="views" />
				)}
				<List
					title="Countries"
					rows={stats.countries.map((row) => ({ ...row, label: country(row.label) }))}
				/>
				<List title="Cities" rows={stats.cities} />
				<List title="Networks" rows={stats.networks} />
				<List title="Devices" rows={stats.devices} />
				<List title="Browsers" rows={stats.browsers} />
				<List title="Systems" rows={stats.systems} />
				<List title="Screens" rows={stats.screens} />
				<List title="Languages" rows={stats.languages} />
				<List title="Theme" rows={stats.themes} />
				<List
					title="Links followed"
					rows={stats.clicks.map((row) => ({
						...row,
						label: row.label.replace(/^https?:\/\//, '')
					}))}
					unit="clicks"
					by="views"
					empty="No links followed off the site yet."
				/>
			</div>

			<Visits visits={stats.recent} />
		</>
	);
}

function Figure({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-sm text-foreground/50">{label}</dt>
			<dd className="text-2xl font-medium tracking-tight tabular-nums">{value}</dd>
		</div>
	);
}

// Visitors in each hour or day of the range, as bars. Hover for the numbers.
function Chart({ stats }: { stats: Stats }) {
	const [hover, setHover] = useState<number | null>(null);
	const max = Math.max(1, ...stats.series.map((point) => point.visitors));
	const hourly = stats.bucket < 24 * 60 * 60 * 1000;
	const label = (at: number) => (hourly ? HOUR.format(at) : DAY.format(at));
	const point = hover === null ? null : stats.series[hover];
	const first = stats.series[0];
	const last = stats.series.at(-1);
	return (
		<section className="mt-12">
			<h2 className="flex items-baseline justify-between gap-4 border-b border-foreground/10 pb-3 text-sm text-foreground/50">
				<span>Visitors {hourly ? 'by hour' : 'by day'}</span>
				<span className="tabular-nums">
					{point
						? `${hourly ? HOUR.format(point.at) : DAY.format(point.at)} · ${NUMBER.format(point.visitors)} ${point.visitors === 1 ? 'visitor' : 'visitors'} · ${NUMBER.format(point.views)} ${point.views === 1 ? 'view' : 'views'}`
						: `peak ${NUMBER.format(max)}`}
				</span>
			</h2>
			<div
				className="relative mt-4 flex h-40 items-end gap-0.5"
				onMouseLeave={() => setHover(null)}
				role="img"
				aria-label={`Visitors ${hourly ? 'by hour' : 'by day'}, peaking at ${max}`}
			>
				{stats.series.map((point, index) => (
					<div
						key={point.at}
						className="flex h-full min-w-0 flex-1 items-end"
						onMouseEnter={() => setHover(index)}
						onPointerDown={() => setHover(index)}
					>
						<div
							className={cn(
								'mx-auto w-full max-w-12 rounded-t-[4px] transition-colors',
								!point.visitors
									? 'bg-foreground/10'
									: hover === index
										? 'bg-foreground/70'
										: 'bg-foreground/25'
							)}
							style={{ height: point.visitors ? `${(point.visitors / max) * 100}%` : '1px' }}
						/>
					</div>
				))}
			</div>
			{first && last && (
				<div className="mt-2 flex justify-between text-xs text-foreground/40 tabular-nums">
					<span>{label(first.at)}</span>
					<span>{label(last.at)}</span>
				</div>
			)}
		</section>
	);
}

// A row whose faint bar behind it shows its share of the largest.
function Bar({ share }: { share: number }) {
	return (
		<span
			aria-hidden
			className="absolute inset-y-1 left-0 rounded-[4px] bg-foreground/[0.05]"
			style={{ width: `${Math.max(share * 100, 0.5)}%` }}
		/>
	);
}

function Pages({ rows }: { rows: PageRow[] }) {
	const max = Math.max(1, ...rows.map((row) => row.views));
	return (
		<section className="mt-14">
			<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 border-b border-foreground/10 pb-3 text-sm text-foreground/50 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
				<h2>Pages</h2>
				<span className="w-14 text-right">visitors</span>
				<span className="w-14 text-right">views</span>
				<span className="hidden w-16 text-right sm:block">read for</span>
				<span className="hidden w-14 text-right sm:block">scrolled</span>
			</div>
			<ol>
				{rows.map((row) => (
					<li
						key={row.label}
						className="relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-6 py-2 tabular-nums sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]"
					>
						<Bar share={row.views / max} />
						<a href={row.label} className="relative truncate pl-2 hover:underline">
							{row.label}
						</a>
						<span className="relative w-14 text-right">{NUMBER.format(row.visitors)}</span>
						<span className="relative w-14 text-right text-foreground/60">
							{NUMBER.format(row.views)}
						</span>
						<span className="relative hidden w-16 text-right text-foreground/60 sm:block">
							{duration(row.engaged)}
						</span>
						<span className="relative hidden w-14 pr-2 text-right text-foreground/60 sm:block">
							{row.scroll === null ? '–' : `${Math.round(row.scroll)}%`}
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}

function List({
	title,
	rows,
	unit = 'visitors',
	by = 'visitors',
	empty = 'Nothing yet.'
}: {
	title: string;
	rows: Row[];
	unit?: string;
	by?: 'visitors' | 'views';
	empty?: string;
}) {
	const max = Math.max(1, ...rows.map((row) => row[by]));
	return (
		<section>
			<h2 className="flex justify-between border-b border-foreground/10 pb-3 text-sm text-foreground/50">
				<span>{title}</span>
				<span>{unit}</span>
			</h2>
			{rows.length ? (
				<ol>
					{rows.map((row) => (
						<li key={row.label} className="relative flex items-baseline justify-between gap-4 py-2">
							<Bar share={row[by] / max} />
							<span className="relative min-w-0 truncate pl-2" title={row.label}>
								{row.label}
							</span>
							<span className="relative pr-2 tabular-nums">{NUMBER.format(row[by])}</span>
						</li>
					))}
				</ol>
			) : (
				<p className="py-2 text-foreground/50">{empty}</p>
			)}
		</section>
	);
}

// The latest visits, one by one: who, from where, and the pages they read.
function Visits({ visits }: { visits: Visit[] }) {
	return (
		<section className="mt-16">
			<h2 className="border-b border-foreground/10 pb-3 text-sm text-foreground/50">
				Latest visits
			</h2>
			<ol className="divide-y divide-foreground/5">
				{visits.map((visit) => (
					<VisitRow key={visit.session} visit={visit} />
				))}
			</ol>
		</section>
	);
}

function VisitRow({ visit }: { visit: Visit }) {
	const place = [visit.city, visit.region, country(visit.country)].filter(Boolean).join(', ');
	const who =
		visit.returning === null
			? 'not tracked'
			: visit.returning
				? `returning${visit.visits && visit.visits > 1 ? `, ${ordinal(visit.visits)} visit` : ''}`
				: 'first visit';
	const details = [
		visit.source ? `from ${visit.source}` : 'direct',
		visit.campaign,
		who,
		duration(visit.engaged),
		[visit.device, visit.screen].filter(Boolean).join(' '),
		visit.language,
		visit.org
	].filter(Boolean);
	return (
		<li className="flex flex-col gap-1.5 py-4">
			<div className="flex items-baseline justify-between gap-4">
				<span className="min-w-0">
					{place || 'Somewhere'}
					<span className="text-foreground/50">
						{' '}
						· {visit.browser} on {visit.os}
					</span>
				</span>
				<time
					dateTime={new Date(visit.start).toISOString()}
					className="shrink-0 text-sm text-foreground/50"
				>
					{timeAgo(new Date(visit.start).toISOString())}
				</time>
			</div>
			<p className="text-sm text-foreground/50">{details.join(' · ')}</p>
			<p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
				{visit.views.map((view, index) => (
					<span key={index} className="flex items-baseline gap-2">
						{index > 0 && <span className="text-foreground/30">→</span>}
						<span title={`${duration(view.engaged)} · scrolled ${view.scroll}%`}>{view.path}</span>
					</span>
				))}
				{visit.clicks.map((href, index) => (
					<span key={`click-${index}`} className="flex items-baseline gap-2 text-foreground/50">
						<span className="text-foreground/30">↗</span>
						{href.replace(/^https?:\/\//, '').replace(/\/$/, '')}
					</span>
				))}
			</p>
		</li>
	);
}
