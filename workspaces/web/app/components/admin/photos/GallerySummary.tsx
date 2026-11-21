import { ArrowRightIcon, CheckIcon, ImagePlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Spinner } from '~/components/ui/spinner';
import type { PhotoEntry } from '~/lib/admin/api';
import { cn } from '~/lib/utils';

// The top of the photos page: what the gallery holds, what it still needs,
// and where new photos come in.

const MONTH = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

// "Jan 2026", "Jan – Mar 2026" or "Dec 2025 – Feb 2026": when the photos were
// taken, from the ones that know.
function span(photos: PhotoEntry[]) {
	const dates = photos
		.map((photo) => photo.date)
		.filter(Boolean)
		.sort();
	if (!dates.length) return null;
	const [first, last] = [dates[0], dates.at(-1)!].map((date) => MONTH.format(new Date(date)));
	if (first === last) return first;
	const [firstMonth, firstYear] = first.split(' ');
	return firstYear === last.split(' ')[1] ? `${firstMonth} – ${last}` : `${first} – ${last}`;
}

export function GalleryCard({ photos }: { photos: PhotoEntry[] }) {
	const places = new Set(photos.map((photo) => photo.location.trim()).filter(Boolean)).size;
	const captioned = photos.filter((photo) => photo.caption.trim()).length;
	const taken = span(photos);
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>photos</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-1">
				<p className="text-3xl font-medium tabular-nums">{photos.length}</p>
				<p className="text-foreground/50">
					{[taken, `${places} ${places === 1 ? 'place' : 'places'}`, `${captioned} captioned`]
						.filter(Boolean)
						.join(' · ')}
				</p>
			</CardContent>
		</Card>
	);
}

// Alt text is what a screen reader says for a photo; without it the gallery
// is a list of blanks. It is the one field every photo should have.
export function AltTextCard({ photos, onNext }: { photos: PhotoEntry[]; onNext: () => void }) {
	const done = photos.filter((photo) => photo.alt.trim()).length;
	const missing = photos.length - done;
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>alt text</CardTitle>
				{missing > 0 && (
					<CardAction>
						<Button variant="ghost" size="sm" className="-my-1" onClick={onNext}>
							Next
							<ArrowRightIcon />
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent className="grid gap-1">
				<p className="text-3xl font-medium tabular-nums">
					{done}
					<span className="text-xl text-foreground/50"> / {photos.length}</span>
				</p>
				<div
					className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label="Photos with alt text"
					aria-valuemin={0}
					aria-valuemax={photos.length}
					aria-valuenow={done}
				>
					<div
						className="h-full rounded-full bg-foreground transition-[width]"
						style={{ width: `${photos.length ? (done / photos.length) * 100 : 0}%` }}
					/>
				</div>
				<p className="mt-1 text-foreground/50">
					{missing > 0 ? (
						<span className="text-destructive">{missing} missing</span>
					) : (
						<span className="inline-flex items-center gap-1">
							<CheckIcon className="size-3.5" />
							every photo has it
						</span>
					)}
				</p>
			</CardContent>
		</Card>
	);
}

// New photos come in here, or anywhere on the page they are dropped; while
// files are dragged over the page this lights up to say they will land.
export function AddPhotosCard({
	onAdd,
	preparing,
	dragging,
	className
}: {
	onAdd: (files: File[]) => void;
	preparing: number;
	dragging: boolean;
	className?: string;
}) {
	const picker = useRef<HTMLInputElement>(null);
	return (
		<Card size="sm" className={className}>
			<CardHeader>
				<CardTitle>add photos</CardTitle>
			</CardHeader>
			<CardContent>
				<input
					ref={picker}
					type="file"
					accept="image/*"
					multiple
					hidden
					onChange={(event) => {
						const files = [...(event.target.files ?? [])];
						event.target.value = '';
						onAdd(files);
					}}
				/>
				<button
					type="button"
					onClick={() => picker.current?.click()}
					className={cn(
						'group/drop grid w-full cursor-pointer justify-items-center gap-1 rounded-lg border border-dashed border-foreground/20 px-3 py-4 text-center transition-colors outline-none hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50',
						dragging && 'border-foreground/60 bg-muted text-foreground'
					)}
				>
					<span className="flex items-center gap-2 text-foreground/70 group-hover/drop:text-foreground">
						{preparing > 0 ? (
							<>
								<Spinner />
								Preparing {preparing} {preparing === 1 ? 'photo' : 'photos'}…
							</>
						) : (
							<>
								<ImagePlusIcon className="size-4 shrink-0" />
								{dragging ? 'Drop to add them' : 'Drop photos here, or browse'}
							</>
						)}
					</span>
					<span className="text-xs text-foreground/50">
						They go to the end, at most 2560px, metadata stripped.
					</span>
				</button>
			</CardContent>
		</Card>
	);
}
