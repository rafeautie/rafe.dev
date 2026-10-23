import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors
} from '@dnd-kit/core';
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { ImagePlusIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link } from '~/components/Link';
import { PhotoPicture } from '~/components/PhotoPicture';
import { AdminHeader } from '~/components/admin/AdminHeader';
import { BuildLine, useBuildWatch } from '~/components/admin/BuildStatus';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { DatePicker } from '~/components/admin/DatePicker';
import { LATEST, VersionSelect } from '~/components/admin/VersionSelect';
import { COLUMN_CLASS, COLUMNS_CLASS, toColumns } from '~/components/photo-grid';
import { Button } from '~/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { getPhotos, getPhotoVersions, type PhotoEntry, savePhotos } from '~/lib/admin/api';
import { PHOTOS_DIR, rawUrl } from '~/lib/admin/config';
import { preparePhoto, type Prepared } from '~/lib/admin/files';
import { requireAdmin } from '~/lib/admin/guard';
import { toPhotoFile } from '~/lib/admin/jpeg';
import { clearUnsaved, readUnsaved, writeUnsaved } from '~/lib/admin/unsaved';
import { cn } from '~/lib/utils';
import { PHOTOS } from '~/photos';

// The gallery's order and captions, and new photos. The order is edited as
// what it is, a list, on equal squares that hold still while dragging; the
// real gallery deals that list into 1, 2 or 3 columns of uneven heights, which
// "preview" shows without letting it be dragged.
export const Route = createFileRoute('/admin/photos')({
	validateSearch: (search: Record<string, unknown>): { built?: string } =>
		typeof search.built === 'string' ? { built: search.built } : {},
	beforeLoad: requireAdmin,
	loader: async (): Promise<Loaded> => {
		const [photos, versions] = await Promise.all([getPhotos({ data: {} }), getPhotoVersions()]);
		return { ...photos, versions };
	},
	component: PhotosPage
});

const STORAGE_KEY = 'photos';
const BUILT = new Map(PHOTOS.map((photo) => [photo.file, photo]));

function PhotosPage() {
	const loaded = Route.useLoaderData();
	return <PhotosEditor key={loaded.sha ?? 'none'} loaded={loaded} />;
}

type Loaded = Awaited<ReturnType<typeof getPhotos>> & {
	versions: Awaited<ReturnType<typeof getPhotoVersions>>;
};

function PhotosEditor({ loaded }: { loaded: Loaded }) {
	const router = useRouter();
	const { built } = Route.useSearch();
	const [photos, setPhotos] = useState<PhotoEntry[]>(loaded.photos);
	const [uploads, setUploads] = useState<Map<string, Prepared>>(new Map());
	const [version, setVersion] = useState(LATEST);
	const [viewRef, setViewRef] = useState(loaded.ref);
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [preparing, setPreparing] = useState(0);
	const [editing, setEditing] = useState<string | null>(null);
	const [preview, setPreview] = useState<number | null>(null);
	const [pendingVersion, setPendingVersion] = useState<string | null>(null);
	const picker = useRef<HTMLInputElement>(null);
	const watch = useBuildWatch();

	useEffect(() => {
		if (built) watch.start(built);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [built]);

	function update(next: PhotoEntry[], nextUploads = uploads) {
		setPhotos(next);
		setDirty(true);
		if (nextUploads.size === 0) writeUnsaved(STORAGE_KEY, { sha: loaded.sha, value: next });
		else clearUnsaved(STORAGE_KEY);
	}

	function discard() {
		clearUnsaved(STORAGE_KEY);
		setPhotos(loaded.photos);
		setUploads(new Map());
		setVersion(LATEST);
		setViewRef(loaded.ref);
		setDirty(false);
	}

	// an unpublished order or captions from last time, on this same version
	useEffect(() => {
		const saved = readUnsaved<PhotoEntry[]>(STORAGE_KEY);
		if (!saved || saved.sha !== loaded.sha) return;
		const files = new Set(loaded.photos.map((photo) => photo.file));
		// only photos that are on GitHub; uploads are not kept between visits
		if (!saved.value.every((photo) => files.has(photo.file))) return;
		// browser storage is only readable once the page is running
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setPhotos(saved.value);
		setDirty(true);
		toast('Brought back your unsaved changes', {
			action: { label: 'Discard', onClick: discard }
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function showVersion(next: string) {
		try {
			const result = await getPhotos({ data: { ref: next === LATEST ? undefined : next } });
			setPhotos(result.photos);
			setUploads(new Map());
			setVersion(next);
			setViewRef(result.ref);
			setDirty(next !== LATEST);
			clearUnsaved(STORAGE_KEY);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function add(files: File[]) {
		const images = files.filter((file) => file.type.startsWith('image/'));
		if (!images.length) return;
		setPreparing((count) => count + images.length);
		const taken = new Set(photos.map((photo) => photo.file));
		const nextUploads = new Map(uploads);
		const added: PhotoEntry[] = [];
		for (const file of images) {
			const name = toPhotoFile(file.name);
			try {
				if (taken.has(name))
					throw new Error(`${name} is already in the gallery. Rename it and try again.`);
				const { prepared, date } = await preparePhoto(file, name);
				nextUploads.set(name, prepared);
				taken.add(name);
				// new photos go to the end, as `pnpm add-photo` adds them
				added.push({ file: name, alt: '', caption: '', location: '', date });
			} catch (error) {
				toast.error(message(error));
			} finally {
				setPreparing((count) => count - 1);
			}
		}
		if (!added.length) return;
		setUploads(nextUploads);
		update([...photos, ...added], nextUploads);
		toast.success(
			`Added ${added.length} ${added.length === 1 ? 'photo' : 'photos'}. Fill in their details, then publish.`
		);
	}

	function edit(file: string, fields: Partial<PhotoEntry>) {
		update(photos.map((photo) => (photo.file === file ? { ...photo, ...fields } : photo)));
	}

	function remove(file: string) {
		const nextUploads = new Map(uploads);
		nextUploads.delete(file);
		setUploads(nextUploads);
		update(
			photos.filter((photo) => photo.file !== file),
			nextUploads
		);
		setEditing(null);
	}

	async function publish() {
		setSaving(true);
		try {
			const listed = new Set(photos.map((photo) => photo.file));
			const { commit } = await savePhotos({
				data: {
					photos,
					expected: loaded.sha,
					uploads: [...uploads.values()]
						.filter((upload) => listed.has(upload.name))
						.map(({ name, base64 }) => ({ name, base64 })),
					restoreFrom: version === LATEST ? undefined : version
				}
			});
			clearUnsaved(STORAGE_KEY);
			toast.success('Published');
			await router.navigate({ to: '/admin/photos', search: { built: commit }, replace: true });
			await router.invalidate();
		} catch (error) {
			toast.error(message(error));
		} finally {
			setSaving(false);
		}
	}

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
		// press and hold, so a swipe still scrolls the page
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	function onDragEnd({ active, over }: DragEndEvent) {
		if (!over || active.id === over.id) return;
		const from = photos.findIndex((photo) => photo.file === active.id);
		const to = photos.findIndex((photo) => photo.file === over.id);
		update(arrayMove(photos, from, to));
	}

	const source = (file: string) => ({ file, upload: uploads.get(file), ref: viewRef });
	const editingPhoto = photos.find((photo) => photo.file === editing);

	return (
		<div
			className="mx-auto max-w-4xl"
			onDragOver={(event) => {
				if (event.dataTransfer.types.includes('Files')) event.preventDefault();
			}}
			onDrop={(event) => {
				if (!event.dataTransfer.files.length) return;
				event.preventDefault();
				add([...event.dataTransfer.files]);
			}}
		>
			<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
				<AdminHeader
					path={[
						<Link key="rafe" href="/">
							rafe
						</Link>,
						<Link key="admin" href="/admin">
							admin
						</Link>,
						'photos'
					]}
				/>
				<div className="flex flex-col items-end gap-1.5">
					<div className="flex flex-wrap items-center justify-end gap-3">
						<div className="flex items-center gap-1 text-sm text-foreground/50">
							preview
							<ToggleGroup
								size="sm"
								value={preview ? [String(preview)] : []}
								onValueChange={(value) => setPreview(value.length ? Number(value[0]) : null)}
							>
								{[1, 2, 3].map((count) => (
									<ToggleGroupItem
										key={count}
										value={String(count)}
										aria-label={`${count} columns`}
									>
										{count}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
						<VersionSelect
							versions={loaded.versions}
							value={version}
							disabled={saving}
							onChange={(next) => (dirty ? setPendingVersion(next) : showVersion(next))}
						/>
						<Button
							onClick={publish}
							disabled={!dirty || saving || preparing > 0}
							className="px-3.5"
						>
							Publish
						</Button>
					</div>
					<BuildLine build={watch.build} liveHref="/photography" />
				</div>
			</div>

			<div className="mt-12 sm:mt-16">
				{preview ? (
					<Preview photos={photos} columns={preview} source={source} />
				) : (
					<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
						<SortableContext
							items={photos.map((photo) => photo.file)}
							strategy={rectSortingStrategy}
						>
							<ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
								{photos.map((photo) => (
									<Tile
										key={photo.file}
										photo={photo}
										source={source(photo.file)}
										onOpen={() => setEditing(photo.file)}
									/>
								))}
							</ol>
						</SortableContext>
					</DndContext>
				)}
			</div>

			<div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-foreground/50">
				<p>
					{preparing > 0
						? `Preparing ${preparing} ${preparing === 1 ? 'photo' : 'photos'}…`
						: preview
							? 'The gallery as it will look at this width. Turn preview off to reorder.'
							: 'Drag to reorder, click to edit. Drop photos anywhere to add them.'}
				</p>
				<input
					ref={picker}
					type="file"
					accept="image/*"
					multiple
					hidden
					onChange={(event) => {
						const files = [...(event.target.files ?? [])];
						event.target.value = '';
						add(files);
					}}
				/>
				<Button
					variant="ghost"
					size="sm"
					className="-mx-2.5"
					onClick={() => picker.current?.click()}
				>
					<ImagePlusIcon />
					add photos
				</Button>
			</div>

			<PhotoDialog
				photo={editingPhoto}
				source={editingPhoto ? source(editingPhoto.file) : null}
				onChange={(fields) => editingPhoto && edit(editingPhoto.file, fields)}
				onRemove={() => editingPhoto && remove(editingPhoto.file)}
				onClose={() => setEditing(null)}
			/>
			<ConfirmDialog
				open={pendingVersion !== null}
				onOpenChange={(open) => !open && setPendingVersion(null)}
				title="Show another version?"
				description="Your unpublished changes will be replaced by that version."
				confirm="Show it"
				onConfirm={() => pendingVersion && showVersion(pendingVersion)}
			/>
		</div>
	);
}

type Source = { file: string; upload?: Prepared; ref: string };

// A photo as the browser can show it: the build's own sizes when the site has
// it, the file just picked when it is new, and the file on GitHub otherwise.
function Thumb({
	source,
	sizes,
	className
}: {
	source: Source;
	sizes: string;
	className?: string;
}) {
	const built = BUILT.get(source.file);
	if (source.upload) {
		return (
			<img
				src={source.upload.url}
				width={source.upload.width}
				height={source.upload.height}
				alt=""
				className={className}
			/>
		);
	}
	if (built) {
		return (
			<PhotoPicture
				picture={built.picture}
				sizes={sizes}
				alt=""
				loading="lazy"
				className={className}
			/>
		);
	}
	return (
		<img
			src={rawUrl(`${PHOTOS_DIR}/${source.file}`, source.ref)}
			alt=""
			loading="lazy"
			className={className}
		/>
	);
}

function Tile({
	photo,
	source,
	onOpen
}: {
	photo: PhotoEntry;
	source: Source;
	onOpen: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: photo.file
	});

	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn('relative touch-manipulation', isDragging && 'z-10')}
		>
			<button
				type="button"
				onClick={onOpen}
				aria-label={`${photo.alt || photo.file}. Drag to move, or open to edit.`}
				className={cn(
					'block aspect-square w-full cursor-grab overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing',
					isDragging && 'opacity-80 shadow-lg ring-2 ring-foreground/20'
				)}
				{...attributes}
				{...listeners}
			>
				<Thumb
					source={source}
					sizes="(min-width: 768px) 180px, 33vw"
					className="pointer-events-none size-full object-cover select-none"
				/>
			</button>
			{!photo.alt && (
				<span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-sm bg-background/80 px-1 text-[0.7rem] text-foreground/60">
					no alt text
				</span>
			)}
		</li>
	);
}

// The real gallery's layout (photo-grid.ts), read-only.
function Preview({
	photos,
	columns,
	source
}: {
	photos: PhotoEntry[];
	columns: number;
	source: (file: string) => Source;
}) {
	const dealt = toColumns(photos, columns);
	return (
		<div
			className={cn(
				COLUMNS_CLASS,
				columns === 1 && 'mx-auto max-w-sm',
				columns === 2 && 'mx-auto max-w-2xl'
			)}
		>
			{dealt.map((column, index) => (
				<div key={index} className={COLUMN_CLASS}>
					{column.map((photo) => (
						<Thumb
							key={photo.file}
							source={source(photo.file)}
							sizes={`${Math.round(100 / columns)}vw`}
							className="block h-auto w-full"
						/>
					))}
				</div>
			))}
		</div>
	);
}

function PhotoDialog({
	photo,
	source,
	onChange,
	onRemove,
	onClose
}: {
	photo: PhotoEntry | undefined;
	source: Source | null;
	onChange: (fields: Partial<PhotoEntry>) => void;
	onRemove: () => void;
	onClose: () => void;
}) {
	const [confirmRemove, setConfirmRemove] = useState(false);
	return (
		<Dialog open={!!photo} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				{photo && source && (
					<>
						<DialogHeader>
							<DialogTitle>{photo.file}</DialogTitle>
						</DialogHeader>
						<Thumb
							source={source}
							sizes="28rem"
							className="max-h-56 w-full rounded-md object-contain"
						/>
						<div className="grid gap-4">
							<div className="grid gap-2">
								<Label htmlFor="photo-alt">Alt text</Label>
								<Input
									id="photo-alt"
									placeholder="What the photo shows, for screen readers"
									value={photo.alt}
									onChange={(event) => onChange({ alt: event.target.value })}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="photo-caption">Caption</Label>
								<Textarea
									id="photo-caption"
									value={photo.caption}
									onChange={(event) => onChange({ caption: event.target.value })}
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div className="grid gap-2">
									<Label htmlFor="photo-location">Location</Label>
									<Input
										id="photo-location"
										value={photo.location}
										onChange={(event) => onChange({ location: event.target.value })}
									/>
								</div>
								<div className="grid gap-2">
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
						<DialogFooter>
							<Button
								variant="destructive"
								className="sm:mr-auto"
								onClick={() => setConfirmRemove(true)}
							>
								Remove photo
							</Button>
							<Button onClick={onClose}>Done</Button>
						</DialogFooter>
						<ConfirmDialog
							open={confirmRemove}
							onOpenChange={setConfirmRemove}
							title="Remove this photo?"
							description="It comes out of the gallery when you publish. Earlier versions keep it."
							confirm="Remove"
							destructive
							onConfirm={onRemove}
						/>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function message(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong';
}
