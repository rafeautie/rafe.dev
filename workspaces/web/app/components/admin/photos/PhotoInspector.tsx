import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { DatePicker } from '~/components/admin/DatePicker';
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import type { PhotoEntry } from '~/lib/admin/api';
import { Thumb } from './Thumb';
import { dimensions, type Source } from './photo-source';

// Where one photo is edited. Beside the grid when the page is wide enough, so
// Rafe can work down the gallery without a dialog opening and closing over it;
// in a dialog on narrower screens, with the same fields and the same stepping
// from photo to photo.

export type Editing = {
	photo: PhotoEntry;
	source: Source;
	position: number;
	total: number;
	onChange: (fields: Partial<PhotoEntry>) => void;
	onRemove: () => void;
	onStep: (by: -1 | 1) => void;
	onClose: () => void;
};

export function Inspector({ editing }: { editing: Editing }) {
	const { photo, source, onClose } = editing;
	return (
		<Card>
			<CardHeader className="border-b">
				<CardTitle>
					photo {editing.position} of {editing.total}
				</CardTitle>
				<CardDescription className="truncate">{about(photo, source)}</CardDescription>
				<CardAction className="flex items-center">
					<Stepper editing={editing} />
					<Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
						<XIcon />
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-4">
				<Thumb
					source={source}
					sizes="20rem"
					className="max-h-56 w-full rounded-md bg-muted object-contain"
				/>
				<PhotoFields photo={photo} onChange={editing.onChange} />
			</CardContent>
			<CardFooter>
				<RemoveButton onRemove={editing.onRemove} />
			</CardFooter>
		</Card>
	);
}

// With nothing selected, the panel points at the work left to do.
export function EmptyInspector({ missing, onStart }: { missing: number; onStart: () => void }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>details</CardTitle>
				<CardDescription>
					Pick a photo to edit its alt text, caption, place and date.
				</CardDescription>
			</CardHeader>
			{missing > 0 && (
				<CardContent>
					<Button variant="outline" className="w-full" onClick={onStart}>
						Start with the first without alt text
					</Button>
				</CardContent>
			)}
		</Card>
	);
}

export function PhotoDialog({ editing }: { editing: Editing | null }) {
	return (
		<Dialog open={!!editing} onOpenChange={(open) => !open && editing?.onClose()}>
			<DialogContent className="sm:max-w-md">
				{editing && (
					<>
						<DialogHeader>
							<DialogTitle>
								photo {editing.position} of {editing.total}
							</DialogTitle>
							<DialogDescription className="truncate">
								{about(editing.photo, editing.source)}
							</DialogDescription>
						</DialogHeader>
						<Thumb
							source={editing.source}
							sizes="28rem"
							className="max-h-56 w-full rounded-md bg-muted object-contain"
						/>
						<PhotoFields photo={editing.photo} onChange={editing.onChange} />
						<DialogFooter className="flex-row items-center">
							<RemoveButton onRemove={editing.onRemove} />
							<Stepper editing={editing} />
							<Button onClick={editing.onClose}>Done</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

// "DSCF0631.jpg · 2560 × 1707"
function about(photo: PhotoEntry, source: Source) {
	const size = dimensions(source);
	return [photo.file, size && `${size.width} × ${size.height}`].filter(Boolean).join(' · ');
}

function Stepper({ editing }: { editing: Editing }) {
	return (
		<>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Previous photo"
				disabled={editing.position === 1}
				onClick={() => editing.onStep(-1)}
			>
				<ChevronLeftIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Next photo"
				disabled={editing.position === editing.total}
				onClick={() => editing.onStep(1)}
			>
				<ChevronRightIcon />
			</Button>
		</>
	);
}

function PhotoFields({
	photo,
	onChange
}: {
	photo: PhotoEntry;
	onChange: (fields: Partial<PhotoEntry>) => void;
}) {
	return (
		<div className="grid gap-4">
			<div className="grid gap-2">
				<Label htmlFor="photo-alt">
					Alt text
					{!photo.alt && <span className="font-normal text-destructive">missing</span>}
				</Label>
				<Input
					id="photo-alt"
					placeholder="What it shows, for screen readers"
					value={photo.alt}
					onChange={(event) => onChange({ alt: event.target.value })}
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="photo-caption">Caption</Label>
				<Textarea
					id="photo-caption"
					placeholder="Shown under the photo in the lightbox"
					value={photo.caption}
					onChange={(event) => onChange({ caption: event.target.value })}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="grid min-w-0 gap-2">
					<Label htmlFor="photo-location">Location</Label>
					<Input
						id="photo-location"
						value={photo.location}
						onChange={(event) => onChange({ location: event.target.value })}
					/>
				</div>
				<div className="grid min-w-0 gap-2">
					<Label>Date</Label>
					<DatePicker
						value={photo.date}
						onChange={(date) => onChange({ date })}
						placeholder="Unknown"
						className="mx-0 justify-start border border-input px-2.5 text-foreground"
					/>
				</div>
			</div>
		</div>
	);
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
	const [confirm, setConfirm] = useState(false);
	return (
		<>
			<Button variant="ghost" className="mr-auto text-destructive" onClick={() => setConfirm(true)}>
				Remove photo
			</Button>
			<ConfirmDialog
				open={confirm}
				onOpenChange={setConfirm}
				title="Remove this photo?"
				description="It comes out of the gallery when you publish. Earlier versions keep it."
				confirm="Remove"
				destructive
				onConfirm={onRemove}
			/>
		</>
	);
}
