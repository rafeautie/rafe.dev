import { CheckIcon, ExternalLinkIcon, ImageIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DatePicker } from '~/components/admin/DatePicker';
import { LATEST } from '~/components/admin/VersionSelect';
import { Button } from '~/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import type { PostFields } from '~/lib/admin/frontmatter';
import { readingMinutes, type PostStats } from '~/lib/admin/post-stats';
import { timeAgo } from '~/lib/admin/time';
import type { Commit } from '~/lib/admin/types';
import { cn } from '~/lib/utils';

// The cards beside a post in the editor, each one question about it: where
// it stands (status), how it looks when shared (link preview) and what it was
// before (versions). The post itself stays the widest thing on the page.

type SetField = <K extends keyof PostFields>(key: K, value: PostFields[K]) => void;

export function StatusCard({
	fields,
	setField,
	slug,
	address,
	stats,
	gaps,
	busy,
	onDelete
}: {
	fields: PostFields;
	setField: SetField;
	// the post's address once it has one; a new post names its own (address)
	slug: string | null;
	address?: ReactNode;
	stats: PostStats;
	gaps: string[];
	busy: boolean;
	onDelete?: () => void;
}) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>status</CardTitle>
				<CardDescription>
					{fields.draft ? (
						'A draft: saved to GitHub, off the site.'
					) : slug ? (
						<a
							href={`/writing/${slug}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex max-w-full items-center gap-1 hover:text-foreground"
						>
							<span className="truncate">rafe.dev/writing/{slug}</span>
							<ExternalLinkIcon className="size-3 shrink-0" />
						</a>
					) : (
						'Goes on the site when published.'
					)}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-1">
				<Row label="draft">
					<Switch
						aria-label="Draft"
						checked={fields.draft}
						onCheckedChange={(value) => setField('draft', value)}
					/>
				</Row>
				{address}
				<Row label="published">
					<DatePicker
						value={fields.date}
						onChange={(value) => setField('date', value)}
						placeholder={fields.draft ? 'not yet' : 'today, when published'}
						className="mx-0 -mr-2.5 min-w-0"
					/>
				</Row>
				<Row label="updated">
					<div className="-mr-2.5 flex min-w-0 items-center">
						<DatePicker
							value={fields.updated}
							onChange={(value) => setField('updated', value)}
							placeholder="never"
							className="mx-0 min-w-0"
						/>
						{fields.updated && (
							<Button
								variant="ghost"
								size="xs"
								className="text-foreground/50"
								onClick={() => setField('updated', '')}
							>
								Clear
							</Button>
						)}
					</div>
				</Row>
				<Row label="length">
					<span className="text-foreground/60 tabular-nums">
						{stats.words.toLocaleString('en-US')} {stats.words === 1 ? 'word' : 'words'}
						{stats.words > 0 && ` · ${readingMinutes(stats.words)} min`}
					</span>
				</Row>
				<div className="mt-2 border-t border-foreground/10 pt-3">
					{gaps.length ? (
						<>
							<p className="text-foreground/50">missing</p>
							<ul className="mt-1.5 flex flex-col gap-1">
								{gaps.map((gap) => (
									<li key={gap} className="flex items-center gap-2 text-foreground/70">
										<span aria-hidden className="size-1.5 shrink-0 rounded-full bg-foreground/40" />
										{gap}
									</li>
								))}
							</ul>
						</>
					) : (
						<p className="flex items-center gap-2 text-foreground/50">
							<CheckIcon className="size-3.5" />
							nothing missing
						</p>
					)}
				</div>
			</CardContent>
			{onDelete && (
				<CardFooter className="justify-end py-1.5 group-data-[size=sm]/card:py-1.5">
					<Button
						variant="ghost"
						size="sm"
						className="text-destructive"
						disabled={busy}
						onClick={onDelete}
					>
						Delete post
					</Button>
				</CardFooter>
			)}
		</Card>
	);
}

// A label on the left and its control on the right, one line each, so the
// status card reads down like a list.
export function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-h-8 items-center justify-between gap-3">
			<span className="shrink-0 text-foreground/50">{label}</span>
			{children}
		</div>
	);
}

const NO_IMAGE = 'none';

// The post as a link to it looks when shared: its image, title and
// description. Without an image of its own, a photo from the site stands in.
export function PreviewCard({
	fields,
	setField,
	images,
	imageSrc
}: {
	fields: PostFields;
	setField: SetField;
	// images in the post's folder to choose from
	images: string[];
	imageSrc: string;
}) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>link preview</CardTitle>
				<CardDescription>What a shared link to the post shows.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
					<div className="flex aspect-[1200/630] items-center justify-center bg-muted">
						{fields.image ? (
							<img src={imageSrc} alt={fields.imageAlt} className="size-full object-cover" />
						) : (
							<span className="flex items-center gap-1.5 text-xs text-foreground/40">
								<ImageIcon className="size-3.5" />a photo from the site
							</span>
						)}
					</div>
					<div className="border-t border-foreground/10 px-3 py-2">
						<p className="text-xs text-foreground/40">rafe.dev</p>
						<p className="truncate font-medium">{fields.title || 'Untitled'}</p>
						<p className="line-clamp-2 text-xs text-foreground/60">
							{fields.description || 'No description'}
						</p>
					</div>
				</div>
				<Select
					items={[
						{ value: NO_IMAGE, label: 'Site photo' },
						...images.map((name) => ({ value: name, label: name }))
					]}
					value={fields.image || NO_IMAGE}
					onValueChange={(value) =>
						setField('image', value && value !== NO_IMAGE ? String(value) : '')
					}
				>
					<SelectTrigger className="w-full" aria-label="Link preview image">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NO_IMAGE}>Site photo</SelectItem>
						{images.map((name) => (
							<SelectItem key={name} value={name}>
								{name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{fields.image && (
					<Input
						aria-label="Link preview alt text"
						placeholder="Describe the image"
						value={fields.imageAlt}
						onChange={(event) => setField('imageAlt', event.target.value)}
						className="h-8"
					/>
				)}
			</CardContent>
		</Card>
	);
}

// How many versions show before "show all": enough for the last few sittings.
const FEW = 5;

// Every version of the post, newest first, the first being what the site has
// now. Picking an older one shows it in the editor; publishing it makes it
// the newest. The same choice the photos page makes with VersionSelect, laid
// out as a list because here there is room to say what each one was.
export function VersionsCard({
	versions,
	value,
	disabled,
	onChange
}: {
	versions: Commit[];
	value: string;
	disabled?: boolean;
	onChange: (value: string) => void;
}) {
	const [all, setAll] = useState(false);
	const selectedAt = versions.findIndex((commit) => commit.sha === value);
	// an older version picked from further down stays in view when folded
	const shown = all ? versions : versions.slice(0, Math.max(FEW, selectedAt + 1));

	return (
		<Card size="sm" className="pb-0">
			<CardHeader>
				<CardTitle>versions</CardTitle>
				<CardDescription>
					{value === LATEST
						? 'Pick one to see it; publishing brings it back.'
						: 'Showing an older version. Publish to bring it back.'}
				</CardDescription>
				<CardAction>
					<span className="text-foreground/50 tabular-nums">{versions.length}</span>
				</CardAction>
			</CardHeader>
			<CardContent className="px-0 group-data-[size=sm]/card:px-0">
				<ul className="border-t border-foreground/10 py-1">
					{shown.map((commit, index) => {
						const key = index === 0 ? LATEST : commit.sha;
						const selected = key === value;
						return (
							<li key={commit.sha}>
								<button
									type="button"
									disabled={disabled}
									aria-pressed={selected}
									onClick={() => !selected && onChange(key)}
									title={`${commit.message} · ${new Date(commit.date).toLocaleString()}`}
									className={cn(
										'flex w-full cursor-pointer items-baseline gap-3 px-3 py-1.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-50',
										selected && 'bg-muted'
									)}
								>
									<span
										className={cn(
											'min-w-0 flex-1 truncate',
											selected ? 'text-foreground' : 'text-foreground/70'
										)}
									>
										{whatChanged(commit.message)}
									</span>
									<span className="shrink-0 text-xs text-foreground/50">
										{timeAgo(commit.date)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
				{versions.length > shown.length && (
					<div className="border-t border-foreground/10 px-1.5 py-1">
						<Button
							variant="ghost"
							size="sm"
							className="w-full text-foreground/50"
							onClick={() => setAll(true)}
						>
							Show all {versions.length}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// 'content: save draft post "A title"' -> 'save draft'. The admin's own
// messages all name the post, which this card is already about; the full
// message shows on hover. Commits made outside the admin show as written.
function whatChanged(message: string) {
	const text = message.replace(/^content:\s*/, '');
	return text.replace(/(?: of)? post ".*"$/, '') || text;
}
