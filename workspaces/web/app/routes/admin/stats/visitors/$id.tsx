import { createFileRoute } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail } from '~/components/admin/AdminHeader';
import { DATE, duration, NUMBER } from '~/components/admin/stats/format';
import { NumberCard } from '~/components/admin/stats/Metrics';
import { Ranking, StatsCard } from '~/components/admin/stats/Cards';
import { TimeChart } from '~/components/admin/stats/TimeChart';
import { VisitList } from '~/components/admin/stats/Visits';
import { ScrollArea } from '~/components/ui/scroll-area';
import { requireAdmin } from '~/lib/admin/guard';
import { timeAgo } from '~/lib/admin/time';
import { getVisitor } from '~/lib/stats/report';

// One visitor: every visit their browser has made, what they read, and where
// and on what. A browser that opted out of the id has only the one visit.
// Laid out like /admin/stats: the numbers first, then who they are beside
// when they came, then their visits beside the pages they read.
export const Route = createFileRoute('/admin/stats/visitors/$id')({
	beforeLoad: requireAdmin,
	loader: ({ params }) => getVisitor({ data: { id: params.id } }),
	component: VisitorPage
});

function VisitorPage() {
	const visitor = Route.useLoaderData();
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
					<Link key="stats" href="/admin/stats">
						stats
					</Link>,
					'visitor'
				]}
			/>
			<ControlsRail
				status={
					visitor ? (
						<span suppressHydrationWarning>
							first seen {DATE.format(visitor.first)} · last seen{' '}
							{timeAgo(new Date(visitor.last).toISOString())}
							{visitor.anonymous && ' · not tracked, so this is one visit'}
						</span>
					) : (
						<span>no such visitor</span>
					)
				}
			/>

			{visitor ? (
				// the widths are the column's own, as on /admin/stats
				<div className="@container mt-10 flex flex-col gap-4">
					<div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
						<NumberCard label="visits" value={NUMBER.format(visitor.visits.length)} />
						<NumberCard label="page views" value={NUMBER.format(visitor.views)} />
						<NumberCard label="time reading" value={duration(visitor.engaged)} />
						<NumberCard label="pages read" value={NUMBER.format(visitor.pages.length)} />
					</div>

					<div className="grid gap-4 @2xl:grid-cols-5">
						<StatsCard title="who" className="@2xl:col-span-2">
							<dl className="flex flex-col gap-3">
								{[
									['from', visitor.places.length ? visitor.places : ['Somewhere unknown']],
									['on', visitor.devices],
									['came via', visitor.sources.length ? visitor.sources : ['Direct']],
									['network', visitor.networks],
									['language', visitor.languages]
								]
									.filter(([, values]) => values.length)
									.map(([label, values]) => (
										<div key={label as string} className="flex flex-col gap-0.5">
											<dt className="text-foreground/50">{label}</dt>
											<dd className="[overflow-wrap:anywhere]">
												{(values as string[]).join('; ')}
											</dd>
										</div>
									))}
							</dl>
						</StatsCard>
						<StatsCard
							title="page views by day"
							description="since their first visit"
							className="@2xl:col-span-3"
						>
							<TimeChart
								data={visitor.series}
								dataKey="views"
								label="page views"
								format={(value) => (value === null ? '–' : NUMBER.format(value))}
								className="-ml-2 aspect-auto h-48 w-[calc(100%+0.5rem)]"
							/>
						</StatsCard>
					</div>

					<div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
						<StatsCard title="visits" unit={NUMBER.format(visitor.visits.length)}>
							<ScrollArea fade className="-mx-2 -my-3" viewportClassName="max-h-[36rem]">
								<VisitList visits={visitor.visits} linkVisitor={false} />
							</ScrollArea>
						</StatsCard>
						<StatsCard title="pages read" unit="views">
							<Ranking rows={visitor.pages} by="views" />
						</StatsCard>
					</div>
				</div>
			) : (
				<p className="mt-10 text-foreground/50">
					There are no visits for this visitor. <Link href="/admin/stats">Back to stats</Link>
				</p>
			)}
		</div>
	);
}
