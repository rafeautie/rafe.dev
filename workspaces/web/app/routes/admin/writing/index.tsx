import { createFileRoute } from '@tanstack/react-router';
import { ImageIcon, PlusIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '~/components/Link';
import { AdminHeader } from '~/components/admin/AdminHeader';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '~/components/ui/card';
import { rawUrl, WRITING_DIR } from '~/lib/admin/config';
import { requireAdmin } from '~/lib/admin/guard';
import { postGaps } from '~/lib/admin/post-stats';
import { timeAgo } from '~/lib/admin/time';
import { readUnsaved } from '~/lib/admin/unsaved';
import { listPostOverviews, type PostOverview } from '~/lib/admin/writing';
import { cn } from '~/lib/utils';

// Every post, as work to manage rather than as the site lists it: a line of
// counts, then drafts to finish, then what is on the site. Each post says what
// it still lacks and whether this browser holds edits not yet published.
export const Route = createFileRoute('/admin/writing/')({
	beforeLoad: requireAdmin,
	loader: () => listPostOverviews(),
	component: PostList
});

const SHORT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
// a post date (yyyy-mm-dd) as Sep 27, 2026: the list has less room than /writing
const shortDate = (date: string) => (date ? SHORT.format(new Date(date)) : '');

const changedAt = (post: PostOverview) => post.changed?.date ?? '';

function PostList() {
	const posts = Route.useLoaderData();
	const unsaved = useUnsavedEdits(posts);

	// drafts by what was worked on last, the site's posts newest first
	const drafts = posts
		.filter((post) => post.draft)
		.sort((a, b) => changedAt(b).localeCompare(changedAt(a)));
	const published = posts
		.filter((post) => !post.draft)
		.sort((a, b) => b.date.localeCompare(a.date));
	const needingWork = posts.filter((post) => postGaps(post, post).length).length;
	const draftsUnsaved =
		drafts.filter((post) => unsaved.slugs.has(post.slug)).length +
		(unsaved.inProgress === null ? 0 : 1);
	// a new post begun here counts as a draft, though only this browser has it
	const draftCount = drafts.length + (unsaved.inProgress === null ? 0 : 1);
	const latest = posts.reduce<PostOverview | null>(
		(newest, post) => (!newest || changedAt(post) > changedAt(newest) ? post : newest),
		null
	);

	return (
		<div className="@container mx-auto max-w-4xl">
			<AdminHeader
				path={[
					<Link key="rafe" href="/">
						rafe
					</Link>,
					<Link key="admin" href="/admin">
						admin
					</Link>,
					'writing'
				]}
			>
				<Button size="sm" className="px-3" render={<Link plain href="/admin/writing/new" />}>
					<PlusIcon />
					New post
				</Button>
			</AdminHeader>

			<div className="mt-8 flex flex-col gap-6 sm:mt-10">
				<Card size="sm">
					<CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-4">
						<Stat
							label="published"
							value={published.length}
							note={published[0]?.date ? `latest ${shortDate(published[0].date)}` : 'none yet'}
						/>
						<Stat
							label="drafts"
							value={draftCount}
							note={draftsUnsaved ? `${draftsUnsaved} with unsaved edits` : 'all saved'}
						/>
						<Stat
							label="need work"
							value={needingWork}
							note={needingWork ? 'missing a piece or two' : 'all complete'}
						/>
						<Stat
							label="last change"
							value={latest?.changed ? timeAgo(latest.changed.date) : '–'}
							note={latest ? latest.title || latest.slug : 'nothing yet'}
						/>
					</CardContent>
				</Card>

				<Card className="pb-0">
					<CardHeader>
						<CardTitle>drafts</CardTitle>
						<CardDescription>Saved to GitHub, off the site until published.</CardDescription>
						<CardAction>
							<Count n={draftCount} />
						</CardAction>
					</CardHeader>
					<CardContent className="px-0">
						{drafts.length || unsaved.inProgress ? (
							<ul className="divide-y divide-foreground/10 border-t border-foreground/10">
								{unsaved.inProgress !== null && (
									<li>
										<NewPostRow title={unsaved.inProgress} />
									</li>
								)}
								{drafts.map((post) => (
									<li key={post.slug}>
										<PostRow post={post} unsaved={unsaved.slugs.has(post.slug)} />
									</li>
								))}
							</ul>
						) : (
							<Empty>
								No drafts. <Link href="/admin/writing/new">Start one</Link>.
							</Empty>
						)}
					</CardContent>
				</Card>

				<Card className="pb-0">
					<CardHeader>
						<CardTitle>published</CardTitle>
						<CardDescription>On rafe.dev/writing, newest first.</CardDescription>
						<CardAction>
							<Count n={published.length} />
						</CardAction>
					</CardHeader>
					<CardContent className="px-0">
						{published.length ? (
							<ul className="divide-y divide-foreground/10 border-t border-foreground/10">
								{published.map((post) => (
									<li key={post.slug}>
										<PostRow post={post} unsaved={unsaved.slugs.has(post.slug)} />
									</li>
								))}
							</ul>
						) : (
							<Empty>Nothing published yet.</Empty>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

// Edits the editor kept in this browser and has not published: for which
// posts (only those made on the version GitHub has now, as the editor offers
// them back), and the title of a new post begun, if any.
function useUnsavedEdits(posts: PostOverview[]) {
	const [unsaved, setUnsaved] = useState<{ slugs: Set<string>; inProgress: string | null }>({
		slugs: new Set(),
		inProgress: null
	});
	useEffect(() => {
		const slugs = new Set(
			posts
				.filter((post) => readUnsaved(`post:${post.slug}`)?.sha === post.sha)
				.map((post) => post.slug)
		);
		const fresh = readUnsaved<{ fields?: { title?: string } }>('post:new');
		// browser storage is only readable once the page is running
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setUnsaved({
			slugs,
			inProgress: fresh ? fresh.value.fields?.title || 'untitled' : null
		});
	}, [posts]);
	return unsaved;
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note: string }) {
	return (
		<div className="min-w-0">
			<p className="text-foreground/50">{label}</p>
			<p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
			<p className="mt-0.5 truncate text-xs text-foreground/50">{note}</p>
		</div>
	);
}

function Count({ n }: { n: number }) {
	return <span className="text-sm text-foreground/50 tabular-nums">{n}</span>;
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="border-t border-foreground/10 px-4 py-4 text-foreground/50">{children}</p>;
}

const rowClass =
	'grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 px-4 py-3 transition-colors hover:bg-muted/50 @lg:grid-cols-[6.5rem_minmax(0,1fr)_auto]';

// One post: its link preview image, title, description, dates and length,
// then what it lacks. When it last changed sits at the right when there is
// room, and joins the dates when not.
function PostRow({ post, unsaved }: { post: PostOverview; unsaved: boolean }) {
	const gaps = postGaps(post, post);
	const changed = post.changed ? `changed ${timeAgo(post.changed.date)}` : '';
	const facts = [
		post.draft ? post.date && `dated ${shortDate(post.date)}` : shortDate(post.date) || 'no date',
		post.updated && `updated ${shortDate(post.updated)}`,
		`${post.words.toLocaleString('en-US')} ${post.words === 1 ? 'word' : 'words'}`
	].filter(Boolean);

	return (
		<Link plain href={`/admin/writing/${post.slug}`} className={rowClass}>
			<Cover slug={post.slug} image={post.image} alt={post.imageAlt} />
			<div className="min-w-0">
				<p className="truncate font-medium">{post.title || post.slug}</p>
				<p
					className={cn('truncate', post.description ? 'text-foreground/60' : 'text-foreground/40')}
				>
					{post.description || 'No description'}
				</p>
				<p className="mt-1 flex flex-wrap gap-x-2 text-xs text-foreground/50">
					{facts.map((fact, index) => (
						<span key={index}>
							{index > 0 && <span className="mr-2">·</span>}
							{fact}
						</span>
					))}
				</p>
				{changed && <p className="text-xs text-foreground/50 @lg:hidden">{changed}</p>}
				{(gaps.length > 0 || unsaved) && (
					<div className="mt-2 flex flex-wrap gap-1.5">
						{unsaved && <Badge variant="secondary">unsaved edits here</Badge>}
						{gaps.map((gap) => (
							<Badge key={gap} variant="outline" className="font-normal text-foreground/60">
								<span aria-hidden className="size-1.5 rounded-full bg-foreground/40" />
								{gap}
							</Badge>
						))}
					</div>
				)}
			</div>
			<p
				className="hidden text-xs whitespace-nowrap text-foreground/50 @lg:block"
				title={post.changed?.message}
			>
				{changed}
			</p>
		</Link>
	);
}

// A new post begun in this browser and never saved: only the editor's copy
// of it exists, so it is listed apart from the drafts on GitHub.
function NewPostRow({ title }: { title: string }) {
	return (
		<Link plain href="/admin/writing/new" className={rowClass}>
			<Cover />
			<div className="min-w-0">
				<p className="truncate font-medium">{title}</p>
				<p className="text-foreground/50">Begun in this browser, not yet saved.</p>
				<div className="mt-2">
					<Badge variant="secondary">unsaved edits here</Badge>
				</div>
			</div>
		</Link>
	);
}

// The link preview image, shaped as it is when shared (1200 by 630). Read
// from the repository, so it shows before the site has rebuilt.
function Cover({ slug, image, alt }: { slug?: string; image?: string; alt?: string }) {
	return (
		<div className="flex aspect-[1200/630] items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10">
			{slug && image ? (
				<img
					src={rawUrl(`${WRITING_DIR}/${slug}/${image}`)}
					alt={alt ?? ''}
					loading="lazy"
					className="size-full object-cover"
				/>
			) : (
				<ImageIcon aria-hidden className="size-4 text-foreground/30" />
			)}
		</div>
	);
}
