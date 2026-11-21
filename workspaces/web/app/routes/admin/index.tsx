import { createFileRoute } from '@tanstack/react-router';
import { GitHubIcon } from '~/components/GitHubIcon';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { AdminHeader, ControlsRail } from '~/components/admin/AdminHeader';
import { BuildBadge, useBuildWatch } from '~/components/admin/BuildStatus';
import { type Loaded, PageLink } from '~/components/admin/overview/Area';
import { ActivityCard, PhotosCard, WritingCard } from '~/components/admin/overview/Cards';
import { LoopCard, ResultsCard } from '~/components/admin/overview/Race';
import { useLiveRace } from '~/components/admin/overview/useLiveRace';
import { ReadersCard, TrafficCard } from '~/components/admin/overview/Stats';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { getOverview } from '~/lib/admin/api';
import {
	getPhotosSummary,
	getRaceSummary,
	getVisitsSummary,
	getWritingSummary
} from '~/lib/admin/overview';
import { timeAgo } from '~/lib/admin/time';

// Signed out: the sign-in page. Signed in: the overview, the admin's hub: how
// each area of the site is doing, each in its own card that leads to its page,
// what to pick up next, and what changed lately.
export const Route = createFileRoute('/admin/')({
	validateSearch: (search: Record<string, unknown>): { signin?: string } =>
		typeof search.signin === 'string' ? { signin: search.signin } : {},
	loader: ({ context }) => (context.admin ? loadOverview() : null),
	component: AdminHome
});

type OverviewData = Awaited<ReturnType<typeof loadOverview>>;

// Every area at once, each on its own: one that fails shows its error in its
// card and leaves the rest. A lapsed sign-in fails them all, so that goes to
// the admin's own error page, which offers to sign in again.
async function loadOverview() {
	const [changes, writing, photos, visits, race] = await Promise.all([
		settle(getOverview()),
		settle(getWritingSummary()),
		settle(getPhotosSummary()),
		settle(getVisitsSummary()),
		settle(getRaceSummary())
	]);
	const areas = [changes, writing, photos, visits, race];
	if (areas.some((area) => !area.ok && area.error === 'Not signed in')) {
		throw new Error('Not signed in');
	}
	return { changes, writing, photos, visits, race };
}

function settle<T>(promise: Promise<T>): Promise<Loaded<T>> {
	return promise.then(
		(value) => ({ ok: true, value }),
		(error: unknown) => ({
			ok: false,
			error: error instanceof Error ? error.message : 'Something went wrong'
		})
	);
}

function AdminHome() {
	const overview = Route.useLoaderData();
	return overview ? <Overview overview={overview} /> : <SignIn />;
}

const SIGN_IN_ERRORS: Record<string, string> = {
	denied: 'That GitHub account cannot edit this site.',
	failed: 'Signing in did not finish. Try again.'
};

function SignIn() {
	const { signin } = Route.useSearch();
	return (
		<div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center gap-6 text-center">
			<SlashNav className="text-xl font-medium">
				<Link href="/">rafe</Link>
				admin
			</SlashNav>
			<Button size="lg" className="px-4" render={<a href="/admin/login" />}>
				<GitHubIcon className="size-4" />
				Sign in with GitHub
			</Button>
			{signin && SIGN_IN_ERRORS[signin] && (
				<p className="text-sm text-foreground/50">{SIGN_IN_ERRORS[signin]}</p>
			)}
		</div>
	);
}

function Overview({ overview }: { overview: OverviewData }) {
	const { changes, writing, photos, visits, race } = overview;
	const latest = changes.ok ? changes.value.changes[0] : undefined;
	// the race widgets and the rail's paused badge follow the room as it runs
	const live = useLiveRace(race);
	// keeps checking while the latest commit is still building
	const watch = useBuildWatch(
		changes.ok
			? {
					sha: changes.value.head,
					build: changes.value.build,
					since: latest?.date ? Date.parse(latest.date) : undefined
				}
			: undefined
	);
	// wider than the other pages' column: a dashboard needs room for its grid
	return (
		<div className="mx-auto max-w-6xl">
			<AdminHeader
				path={[
					<Link key="rafe" href="/">
						rafe
					</Link>,
					'admin'
				]}
			/>

			<ControlsRail
				status={
					<>
						<BuildBadge build={watch.build} />
						{latest && <span>updated {timeAgo(latest.date)}</span>}
						{live.race.ok && live.race.value.paused && (
							<Badge
								variant="outline"
								className="text-foreground/70"
								render={<PageLink to="/admin/race" />}
							>
								<span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
								race paused
							</Badge>
						)}
					</>
				}
			/>

			{/* The widgets follow the page's own width, sidebar open or folded:
			    one column on a phone, two on a tablet, a six-column grid of
			    wide and narrow cards beyond. */}
			<div className="@container mt-8">
				<div className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-6">
					{/* what is happening now, then how the week went, then the content */}
					<TrafficCard loaded={visits} className="@2xl:col-span-2 @4xl:col-span-4" />
					<LoopCard loaded={live.race} now={live.now} className="@4xl:col-span-2" />
					<ReadersCard loaded={visits} className="@4xl:col-span-2" />
					<ResultsCard loaded={live.race} className="@2xl:col-span-2 @4xl:col-span-4" />
					<WritingCard loaded={writing} className="@4xl:col-span-2" />
					<ActivityCard loaded={changes} className="@4xl:col-span-4" />
					<PhotosCard loaded={photos} className="@2xl:col-span-2 @4xl:col-span-6" />
				</div>
			</div>
		</div>
	);
}
