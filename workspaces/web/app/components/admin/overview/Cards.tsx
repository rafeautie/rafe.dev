import {
	CameraIcon,
	FileTextIcon,
	GitCommitHorizontalIcon,
	TrendingDownIcon,
	TrendingUpIcon
} from 'lucide-react';
import { PhotoPicture } from '~/components/PhotoPicture';
import { NUMBER } from '~/components/admin/stats/format';
import { rawUrl, PHOTOS_DIR } from '~/lib/admin/config';
import type {
	getPhotosSummary,
	getRaceSummary,
	getVisitsSummary,
	getWritingSummary
} from '~/lib/admin/overview';
import type { getOverview } from '~/lib/admin/api';
import { timeAgo } from '~/lib/admin/time';
import { cn } from '~/lib/utils';
import { PHOTOS } from '~/photos';
import { Area, Empty, Figure, type Loaded, PageLink, Shortlist, ShortlistRow } from './Area';

// The overview's cards, one per area of the site, and the feed of what
// changed in it lately.

type Writing = Awaited<ReturnType<typeof getWritingSummary>>;
type Photos = Awaited<ReturnType<typeof getPhotosSummary>>;
type Visits = Awaited<ReturnType<typeof getVisitsSummary>>;
type Race = Awaited<ReturnType<typeof getRaceSummary>>;
export type Changes = Awaited<ReturnType<typeof getOverview>>;

const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
// a day's `at` is its midnight read as UTC (lib/admin/overview.ts)
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' });
// a post's date is a day, not a moment, so it is read as UTC as /writing does
const POST_DATE = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC'
});
const WEEKDAY_LONG = new Intl.DateTimeFormat('en-US', {
	weekday: 'long',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});

const plural = (n: number, one: string, many = `${one}s`) =>
	`${NUMBER.format(n)} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- writing

export function WritingCard({ loaded }: { loaded: Loaded<Writing> }) {
	return (
		<Area
			title="writing"
			href="/admin/writing"
			loaded={loaded}
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
						{/* how long the site has gone without something new */}
						{writing.latest && (
							<Figure value={NUMBER.format(writing.latest.daysAgo)} label="days since a post" />
						)}
					</div>
					{writing.recentDrafts.length > 0 && (
						<Shortlist title="pick back up">
							{writing.recentDrafts.map((draft) => (
								<ShortlistRow key={draft.slug} aside={draft.edited ? timeAgo(draft.edited) : ''}>
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
					{writing.latest ? (
						<Shortlist title="last published">
							<ShortlistRow
								aside={
									<time dateTime={writing.latest.date}>
										{POST_DATE.format(new Date(writing.latest.date))}
									</time>
								}
							>
								<PageLink
									to={`/admin/writing/${writing.latest.slug}`}
									className="hover:text-foreground/70"
								>
									{writing.latest.title}
								</PageLink>
							</ShortlistRow>
						</Shortlist>
					) : (
						<Empty>Nothing published yet.</Empty>
					)}
				</>
			)}
		</Area>
	);
}

// ---------------------------------------------------------------- visits

export function VisitsCard({ loaded }: { loaded: Loaded<Visits> }) {
	return (
		<Area
			title="stats"
			href="/admin/stats"
			loaded={loaded}
			action={
				loaded.ok && loaded.value.here > 0 ? (
					<span className="flex items-center gap-1.5 text-foreground/60">
						<span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
						{NUMBER.format(loaded.value.here)} here now
					</span>
				) : undefined
			}
		>
			{(visits) => (
				<>
					<div className="flex flex-col gap-2">
						<Figure
							value={NUMBER.format(visits.visitors)}
							label={
								<>
									visitors, last 7 days{visits.views > 0 && <> · {plural(visits.views, 'view')}</>}
								</>
							}
						/>
						<Trend now={visits.visitors} before={visits.previous} />
					</div>
					<DayBars days={visits.days} />
					{visits.pages.length ? (
						<Shortlist title="most read">
							{visits.pages.map((page) => (
								<ShortlistRow key={page.path} aside={NUMBER.format(page.visitors)}>
									{page.path}
								</ShortlistRow>
							))}
						</Shortlist>
					) : (
						<Empty>No visitors this week yet.</Empty>
					)}
				</>
			)}
		</Area>
	);
}

// This week against the week before.
function Trend({ now, before }: { now: number; before: number }) {
	if (!before) return null;
	const change = (now - before) / before;
	const Icon = change > 0 ? TrendingUpIcon : change < 0 ? TrendingDownIcon : null;
	return (
		<p className="flex items-center gap-1.5 text-sm text-foreground/50">
			{Icon && (
				<Icon
					className={cn('size-4', change > 0 && 'text-emerald-600 dark:text-emerald-500')}
					aria-hidden
				/>
			)}
			{change === 0
				? 'the same as the week before'
				: `${PERCENT.format(Math.abs(change))} ${change > 0 ? 'up' : 'down'} on the week before`}
		</p>
	);
}

// Visitors each day this week, today last and drawn strongest.
function DayBars({ days }: { days: Visits['days'] }) {
	const most = Math.max(1, ...days.map((day) => day.visitors));
	return (
		<ol className="grid grid-cols-7 gap-1.5" aria-label="Visitors each day">
			{days.map((day, index) => {
				const today = index === days.length - 1;
				const label = `${WEEKDAY_LONG.format(day.at)}: ${plural(day.visitors, 'visitor')}`;
				return (
					<li key={day.at} className="flex flex-col items-center gap-1.5" title={label}>
						<span className="sr-only">{label}</span>
						<div className="flex h-14 w-full items-end" aria-hidden>
							<div
								className={cn(
									'w-full rounded-sm',
									today ? 'bg-foreground/70' : 'bg-foreground/20',
									// an empty day still shows where it is
									!day.visitors && 'bg-foreground/8'
								)}
								style={{ height: `${Math.max(6, (day.visitors / most) * 100)}%` }}
							/>
						</div>
						<span
							className={cn('text-xs text-foreground/40', today && 'text-foreground/70')}
							aria-hidden
						>
							{WEEKDAY.format(day.at)}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

// ---------------------------------------------------------------- photos

export function PhotosCard({ loaded }: { loaded: Loaded<Photos> }) {
	return (
		<Area title="photos" href="/admin/photos" loaded={loaded}>
			{(photos) =>
				photos.count ? (
					<>
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
						<ul className="grid grid-cols-4 gap-2" aria-label="First on /photos">
							{photos.first.map((photo) => (
								<li key={photo.file}>
									<Thumbnail file={photo.file} alt={photo.alt} commit={photos.ref} />
								</li>
							))}
						</ul>
						{photos.missingAlt > 0 && (
							<p className="mt-auto flex items-center gap-2 text-foreground/60">
								<span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
								<span>
									{plural(photos.missingAlt, 'photo')} {photos.missingAlt === 1 ? 'has' : 'have'} no
									alt text
								</span>
							</p>
						)}
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
				sizes="8rem"
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

// ---------------------------------------------------------------- race

const PHASES: Record<Race['phase'], string> = {
	idle: 'waiting for someone to watch',
	betting: 'betting open',
	racing: 'racing',
	results: 'showing results'
};

export function RaceCard({ loaded }: { loaded: Loaded<Race> }) {
	return (
		<Area title="race" href="/admin/race" loaded={loaded}>
			{(race) => (
				<>
					<p className="flex items-center gap-2 text-foreground/60">
						<span
							className={cn(
								'size-1.5 shrink-0 rounded-full',
								race.paused
									? 'bg-amber-500'
									: race.phase === 'idle'
										? 'bg-foreground/30'
										: 'animate-pulse bg-emerald-500'
							)}
							aria-hidden
						/>
						{race.paused ? 'paused' : PHASES[race.phase]}
						{race.round > 0 && (
							<span className="text-foreground/40">· round {NUMBER.format(race.round)}</span>
						)}
					</p>
					<div className="flex flex-wrap gap-x-6 gap-y-4">
						<Figure value={NUMBER.format(race.watching)} label="watching" />
						<Figure
							value={race.playersThisWeek >= 100 ? '100+' : NUMBER.format(race.playersThisWeek)}
							label="players this week"
						/>
						<Figure
							value={`${race.net > 0 ? '+' : ''}${NUMBER.format(race.net)}`}
							label="house net"
						/>
					</div>
					{race.recent.length ? (
						<NetBars races={race.recent} run={race.run} />
					) : (
						<Empty>No races yet. One starts when someone opens /race.</Empty>
					)}
				</>
			)}
		</Area>
	);
}

// What the house kept or paid out, race by race, from a middle line.
function NetBars({ races, run }: { races: Race['recent']; run: number }) {
	const most = Math.max(1, ...races.map((race) => Math.abs(race.net)));
	return (
		<div className="mt-auto">
			<ol className="flex h-12 items-center gap-0.5" aria-label="The house's take, race by race">
				{races.map((race) => {
					const label = `round ${race.round}: ${race.voided ? 'void' : `${race.net > 0 ? '+' : ''}${NUMBER.format(race.net)}`}`;
					const height = `${Math.max(4, (Math.abs(race.net) / most) * 50)}%`;
					return (
						<li key={race.round} className="relative h-full flex-1" title={label}>
							<span className="sr-only">{label}</span>
							<span
								aria-hidden
								className={cn(
									'absolute inset-x-0 rounded-[1px]',
									race.net >= 0 ? 'bottom-1/2 bg-foreground/30' : 'top-1/2 bg-destructive/60',
									race.voided && 'bg-foreground/10'
								)}
								style={{ height }}
							/>
						</li>
					);
				})}
			</ol>
			<p className="mt-1.5 text-xs text-foreground/40">
				last {plural(races.length, 'race')} · {plural(run, 'race')} run in all
			</p>
		</div>
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
