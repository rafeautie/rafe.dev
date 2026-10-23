import { createFileRoute } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail } from '~/components/admin/AdminHeader';
import { DATE, duration, NUMBER } from '~/components/admin/stats/format';
import { Panel, Ranking } from '~/components/admin/stats/Panel';
import { TimeChart } from '~/components/admin/stats/TimeChart';
import { VisitList } from '~/components/admin/stats/Visits';
import { ScrollArea } from '~/components/ui/scroll-area';
import { requireAdmin } from '~/lib/admin/guard';
import { timeAgo } from '~/lib/admin/time';
import { getVisitor } from '~/lib/stats/report';
import { useState } from 'react';

// One visitor: every visit their browser has made, what they read, and where
// and on what. A browser that opted out of the id has only the one visit.
export const Route = createFileRoute('/admin/stats/visitors/$id')({
	beforeLoad: requireAdmin,
	loader: ({ params }) => getVisitor({ data: { id: params.id } }),
	component: VisitorPage
});

function VisitorPage() {
	const visitor = Route.useLoaderData();
	const [tab, setTab] = useState('visits');
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
						<span>
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
				<>
					<dl className="mt-8 grid grid-cols-2 gap-1 sm:grid-cols-4">
						{[
							['Visits', NUMBER.format(visitor.visits.length)],
							['Page views', NUMBER.format(visitor.views)],
							['Time reading', duration(visitor.engaged)],
							['Pages read', NUMBER.format(visitor.pages.length)]
						].map(([label, value]) => (
							<div key={label} className="flex flex-col gap-1 px-3 py-2.5">
								<dt className="text-sm text-foreground/50">{label}</dt>
								<dd className="text-2xl font-medium tracking-tight tabular-nums">{value}</dd>
							</div>
						))}
					</dl>

					<dl className="mt-6 grid gap-x-12 gap-y-4 px-3 text-sm sm:grid-cols-2">
						{[
							['From', visitor.places],
							['On', visitor.devices],
							['Came via', visitor.sources.length ? visitor.sources : ['Direct']],
							['Network', visitor.networks],
							['Language', visitor.languages]
						]
							.filter(([, values]) => values.length)
							.map(([label, values]) => (
								<div key={label as string} className="flex flex-col gap-1">
									<dt className="text-foreground/50">{label}</dt>
									<dd>{(values as string[]).join('; ')}</dd>
								</div>
							))}
					</dl>

					<section className="mt-10">
						<h2 className="border-b border-foreground/10 pb-3 text-sm text-foreground/50">
							Page views by day
						</h2>
						<TimeChart
							data={visitor.series}
							dataKey="views"
							label="Page views"
							format={(value) => (value === null ? '–' : NUMBER.format(value))}
							className="mt-4 aspect-auto h-40 w-full"
						/>
					</section>

					<Panel
						className="mt-12"
						value={tab}
						onChange={setTab}
						views={[
							{
								key: 'visits',
								title: 'Visits',
								unit: `${visitor.visits.length}`,
								content: (
									<ScrollArea fade viewportClassName="max-h-[32rem]">
										<VisitList visits={visitor.visits} linkVisitor={false} />
									</ScrollArea>
								)
							},
							{
								key: 'pages',
								title: 'Pages',
								unit: 'views',
								content: <Ranking rows={visitor.pages} by="views" />
							}
						]}
					/>
				</>
			) : (
				<p className="mt-10 text-foreground/50">
					There are no visits for this visitor. <Link href="/admin/stats">Back to stats</Link>
				</p>
			)}
		</div>
	);
}
