import { createFileRoute } from '@tanstack/react-router';
import { GitHubIcon } from '~/components/GitHubIcon';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';
import { AdminHeader } from '~/components/admin/AdminHeader';
import { BuildLine } from '~/components/admin/BuildStatus';
import { Button } from '~/components/ui/button';
import { getOverview } from '~/lib/admin/api';
import { timeAgo } from '~/lib/admin/time';

// Signed out: the sign-in page. Signed in: the overview, which is the hub the
// writing and photos pages hang off.
export const Route = createFileRoute('/admin/')({
	validateSearch: (search: Record<string, unknown>): { signin?: string } =>
		typeof search.signin === 'string' ? { signin: search.signin } : {},
	loader: ({ context }) => (context.admin ? getOverview() : null),
	component: AdminHome
});

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

function Overview({ overview }: { overview: Awaited<ReturnType<typeof getOverview>> }) {
	const latest = overview.changes[0];
	return (
		<div className="mx-auto max-w-2xl">
			<AdminHeader
				path={[
					<Link key="rafe" href="/">
						rafe
					</Link>,
					'admin'
				]}
			>
				<Link href="/admin/writing">writing</Link>
				<Link href="/admin/photos">photos</Link>
				<form method="post" action="/admin/logout">
					<button
						type="submit"
						className="cursor-pointer text-foreground/50 transition-colors hover:text-foreground"
					>
						sign out
					</button>
				</form>
				<ThemeToggle />
			</AdminHeader>

			<div className="mt-16 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mt-24">
				<BuildLine
					build={overview.build}
					liveHref="https://rafe.dev"
					className="text-base font-semibold text-foreground"
				/>
				{latest && <p className="text-foreground/50">updated {timeAgo(latest.date)}</p>}
			</div>

			<section className="mt-14">
				<h2 className="border-b border-foreground/10 pb-3 text-sm text-foreground/50">
					Recent changes
				</h2>
				{overview.changes.length ? (
					<ol className="divide-y divide-foreground/5">
						{overview.changes.map((change) => {
							const what = change.message.replace(/^content:\s*/, '');
							return (
								<li key={change.sha} className="flex items-baseline justify-between gap-4 py-3">
									{change.link ? (
										<Link href={change.link} className="min-w-0">
											{what}
										</Link>
									) : (
										<span className="min-w-0">{what}</span>
									)}
									<time dateTime={change.date} className="shrink-0 text-sm text-foreground/50">
										{timeAgo(change.date)}
									</time>
								</li>
							);
						})}
					</ol>
				) : (
					<p className="py-3 text-foreground/50">Nothing yet.</p>
				)}
			</section>
		</div>
	);
}
