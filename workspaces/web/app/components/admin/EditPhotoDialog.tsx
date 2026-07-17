import { useState } from 'react';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import type { Photo } from '~/gallery-manifest';
import { getImageUrl } from '~/utils';
import { cn } from '~/lib/utils';

// Edits land in the draft here and only reach the photos array on Apply, so
// closing the dialog is always a clean cancel.
export function EditPhotoDialog({
	photo,
	onCancel,
	onApply
}: {
	photo: Photo | null;
	onCancel: () => void;
	onApply: (photo: Photo) => void;
}) {
	return (
		<Dialog open={photo !== null} onOpenChange={(open) => !open && onCancel()}>
			<DialogContent className="sm:max-w-lg">
				{/* Keyed remount resets the draft whenever a different photo opens. */}
				{photo && <EditPhotoForm key={photo.key} photo={photo} onApply={onApply} />}
			</DialogContent>
		</Dialog>
	);
}

function EditPhotoForm({ photo, onApply }: { photo: Photo; onApply: (photo: Photo) => void }) {
	const [draft, setDraft] = useState(photo);
	const set = (fields: Partial<Photo>) => setDraft((current) => ({ ...current, ...fields }));

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				onApply(draft);
			}}
		>
			<DialogHeader>
				<DialogTitle>Edit photo</DialogTitle>
				<DialogDescription className="truncate" title={photo.key}>
					{photo.key}
				</DialogDescription>
			</DialogHeader>

			<img
				src={getImageUrl(photo.key, 640)}
				alt=""
				className="max-h-56 w-full rounded-lg bg-muted object-contain"
			/>

			<div className="grid gap-3 sm:grid-cols-2">
				<Field
					label="Alt text"
					className="sm:col-span-2"
					value={draft.alt}
					onChange={(alt) => set({ alt })}
				/>
				<Field
					label="Caption"
					className="sm:col-span-2"
					value={draft.caption}
					onChange={(caption) => set({ caption })}
				/>
				<Field label="Location" value={draft.location} onChange={(location) => set({ location })} />
				<Field label="Date" type="date" value={draft.date} onChange={(date) => set({ date })} />
			</div>

			{/* Checkbox renders a button, which a wrapping label would not toggle,
			    so the label is associated by id instead. */}
			<div className="flex items-center gap-2">
				<Checkbox
					id="hidden"
					checked={draft.hidden}
					onCheckedChange={(checked) => set({ hidden: checked === true })}
				/>
				<label htmlFor="hidden" className="text-sm">
					Hidden from the public gallery
				</label>
			</div>

			<DialogFooter>
				<DialogClose asChild>
					<Button type="button" variant="outline">
						Cancel
					</Button>
				</DialogClose>
				<Button type="submit">Apply</Button>
			</DialogFooter>
		</form>
	);
}

function Field({
	label,
	value,
	type,
	className,
	onChange
}: {
	label: string;
	value: string;
	type?: string;
	className?: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className={cn('flex flex-col gap-1', className)}>
			<span className="text-xs text-muted-foreground">{label}</span>
			<Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
		</label>
	);
}
