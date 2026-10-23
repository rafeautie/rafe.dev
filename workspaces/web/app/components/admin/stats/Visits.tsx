import { timeAgo } from '~/lib/admin/time';
import type { Visit } from '~/lib/stats/report';
import { duration, ordinal, place } from './format';

// Visits one by one: where from, on what, and the pages read in order, with
// links followed off the site at the end. Each opens its visitor's page.
export function VisitList({
	visits,
	linkVisitor = true
}: {
	visits: Visit[];
	linkVisitor?: boolean;
}) {
	if (!visits.length) return <p className="py-3 text-foreground/50">No visits yet.</p>;
	return (
		<ol className="divide-y divide-foreground/5">
			{visits.map((visit) => (
				<li key={visit.session}>
					{linkVisitor ? (
						<a
							href={`/admin/stats/visitors/${visit.visitor}`}
							className="block rounded-md px-2 transition-colors hover:bg-foreground/[0.03]"
						>
							<VisitRow visit={visit} />
						</a>
					) : (
						<div className="px-2">
							<VisitRow visit={visit} />
						</div>
					)}
				</li>
			))}
		</ol>
	);
}

function VisitRow({ visit }: { visit: Visit }) {
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
		<div className="flex flex-col gap-1.5 py-4">
			<div className="flex items-baseline justify-between gap-4">
				<span className="min-w-0">
					{place(visit) || 'Somewhere'}
					<span className="text-foreground/50">
						{' '}
						· {visit.browser} on {visit.os}
					</span>
				</span>
				{/* "x minutes ago" can tick over between the server and the browser */}
				<time
					suppressHydrationWarning
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
		</div>
	);
}
