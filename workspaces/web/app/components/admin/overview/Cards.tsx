import { CameraIcon, FileTextIcon, GitCommitHorizontalIcon } from 'lucide-react';
import { PhotoPicture } from '~/components/PhotoPicture';
import { NUMBER } from '~/components/admin/stats/format';
import type { getOverview } from '~/lib/admin/api';
import { PHOTOS_DIR, rawUrl } from '~/lib/admin/config';
import type { getPhotosSummary, getWritingSummary } from '~/lib/admin/overview';
import { timeAgo } from '~/lib/admin/time';
import { PHOTOS } from '~/photos';
import { Area, Empty, Figure, type Loaded, PageLink, Shortlist, ShortlistRow } from './Area';

// The overview's widgets from the content pages: writing and photos, and the
// feed of what changed in them lately.

type Writing = Awaited<ReturnType<typeof getWritingSummary>>;
type Photos = Awaited<ReturnType<typeof getPhotosSummary>>;
export type Changes = Awaited<ReturnType<typeof getOverview>>;

// a post's date is a day, not a moment, so it is read as UTC as /writing does
const POST_DATE = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC'
});

const plural = (n: number, one: string, many = `${one}s`) =>
	`${NUMBER.format(n)} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- writing

export function WritingCard({
	loaded,
	className
}: {
	loaded: Loaded<Writing>;
	className?: string;
}) {
	return (
		<Area
			title="writing"
			href="/admin/writing"
			loaded={loaded}
			className={className}
			action={
				<PageLink to="/admin/writing/new" className="text-foreground/60 hover:text-foreground">
					new post
				</PageLink>
			}
		>
			{(writing) => (
				<>
					<div className="flex flex-wrap gap-x-6 gap-y-4">
						<Figure value={NUMBER.format(writing.published)} label="published" />
						<Figure
							value={NUMBER.format(writing.drafts)}
							label={writing.drafts === 1 ? 'draft' : 'drafts'}
						/>
						{writing.daysSincePost !== null && (
							<Figure value={NUMBER.format(writing.daysSincePost)} label="days since a post" />
						)}
					</div>
					{writing.recentDrafts.length > 0 && (
						<Shortlist title="to finish">
							{writing.recentDrafts.map((draft) => (
								<ShortlistRow
									key={draft.slug}
									aside={draft.edited ? `edited ${timeAgo(draft.edited)}` : ''}
								>
									<PageLink
										to={`/admin/writing/${draft.slug}`}
										className="hover:text-foreground/70"
									>
										{draft.title}
									</PageLink>
								</ShortlistRow>
							))}
						</Shortlist>
					)}
					{writing.recentPosts.length ? (
						<Shortlist title="recently published">
							{writing.recentPosts.map((post) => (
								<ShortlistRow
									key={post.slug}
									aside={<time dateTime={post.date}>{POST_DATE.format(new Date(post.date))}</time>}
								>
									<PageLink to={`/admin/writing/${post.slug}`} className="hover:text-foreground/70">
										{post.title}
									</PageLink>
								</ShortlistRow>
							))}
						</Shortlist>
					) : (
						<Empty>Nothing published yet.</Empty>
					)}
				</>
			)}
		</Area>
	);
}

// ---------------------------------------------------------------- photos

export function PhotosCard({ loaded, className }: { loaded: Loaded<Photos>; className?: string }) {
	return (
		<Area title="photos" href="/admin/photos" loaded={loaded} className={className}>
			{(photos) =>
				photos.count ? (
					<>
						<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
							<Figure
								value={NUMBER.format(photos.count)}
								label={
									photos.changed ? (
										<>photos · last changed {timeAgo(photos.changed.date)}</>
									) : (
										'photos'
									)
								}
							/>
							{photos.missingAlt > 0 && (
								<PageLink
									to="/admin/photos"
									className="flex items-center gap-2 pb-0.5 text-foreground/60 hover:text-foreground"
								>
									<span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
									{plural(photos.missingAlt, 'photo')} {photos.missingAlt === 1 ? 'has' : 'have'} no
									alt text
								</PageLink>
							)}
						</div>
						<div>
							<h3 className="text-xs text-foreground/50">latest added</h3>
							<ul className="mt-2 grid grid-cols-4 gap-2 @4xl:grid-cols-8">
								{photos.latest.map((photo) => (
									<li key={photo.file}>
										<Thumbnail file={photo.file} alt={photo.alt} commit={photos.ref} />
									</li>
								))}
							</ul>
						</div>
					</>
				) : (
					<Empty>No photos yet.</Empty>
				)
			}
		</Area>
	);
}

// A photo the live site already has comes from the build's small sizes; one
// added since comes from the repo, at full size, as /admin/photos shows it.
function Thumbnail({ file, alt, commit }: { file: string; alt: string; commit: string }) {
	const className = 'aspect-square w-full rounded-md bg-muted object-cover';
	const built = PHOTOS.find((photo) => photo.file === file);
	if (built) {
		return (
			<PhotoPicture
				picture={built.picture}
				sizes="10rem"
				alt={alt}
				loading="lazy"
				decoding="async"
				className={className}
			/>
		);
	}
	return (
		<img
			src={rawUrl(`${PHOTOS_DIR}/${file}`, commit)}
			alt={alt}
			loading="lazy"
			decoding="async"
			className={className}
		/>
	);
}

// ---------------------------------------------------------------- activity

export function ActivityCard({
	loaded,
	className
}: {
	loaded: Loaded<Changes>;
	className?: string;
}) {
	return (
		<Area title="recent changes" loaded={loaded} className={className}>
			{({ changes }) =>
				changes.length ? (
					<ol className="-my-2 divide-y divide-foreground/5">
						{changes.map((change) => {
							const what = change.message.replace(/^content:\s*/, '');
							const Icon = change.link?.startsWith('/admin/photos')
								? CameraIcon
								: change.link
									? FileTextIcon
									: GitCommitHorizontalIcon;
							return (
								<li key={change.sha} className="flex items-baseline gap-3 py-2.5">
									<Icon
										className="size-3.5 shrink-0 translate-y-0.5 text-foreground/40"
										aria-hidden
									/>
									<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
										<ChangeLink link={change.link}>{what}</ChangeLink>
									</span>
									<time dateTime={change.date} className="shrink-0 text-foreground/50">
										{timeAgo(change.date)}
									</time>
								</li>
							);
						})}
					</ol>
				) : (
					<Empty>Nothing yet.</Empty>
				)
			}
		</Area>
	);
}

// Where a change is edited, if anywhere: a post's editor or the photos page.
function ChangeLink({ link, children }: { link: string | null; children: string }) {
	if (!link) return children;
	return (
		<PageLink to={link} className="hover:text-foreground/70">
			{children}
		</PageLink>
	);
}
