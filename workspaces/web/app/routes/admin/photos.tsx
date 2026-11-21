import { arrayMove } from '@dnd-kit/sortable';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Columns2Icon, Columns3Icon, RectangleVerticalIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AdminHeader, ControlsRail, ProblemBadge } from '~/components/admin/AdminHeader';
import { BuildBadge, useBuildWatch } from '~/components/admin/BuildStatus';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { LATEST, VersionSelect } from '~/components/admin/VersionSelect';
import { AddPhotosCard, AltTextCard, GalleryCard } from '~/components/admin/photos/GallerySummary';
import { Preview, SortableGrid } from '~/components/admin/photos/PhotoGrid';
import {
	type Editing,
	EmptyInspector,
	Inspector,
	PhotoDialog
} from '~/components/admin/photos/PhotoInspector';
import { Button } from '~/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '~/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { getPhotos, getPhotoVersions, type PhotoEntry, savePhotos } from '~/lib/admin/api';
import { preparePhoto, type Prepared } from '~/lib/admin/files';
import { errorMessage } from '~/lib/admin/format';
import { requireAdmin } from '~/lib/admin/guard';
import { toPhotoFile } from '~/lib/admin/jpeg';
import { describeChanges, photoChanges } from '~/lib/admin/photo-changes';
import { clearUnsaved, readUnsaved, writeUnsaved } from '~/lib/admin/unsaved';

// The gallery's order and captions, and new photos. Laid out around curating
// it: what the gallery holds and still needs at the top, the order in the
// middle with each photo's details under it, and the photo being edited in a
// panel beside it (a dialog on narrower screens).
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
const PREVIEW_OPTIONS = [
	{ columns: 1, icon: <RectangleVerticalIcon /> },
	{ columns: 2, icon: <Columns2Icon /> },
	{ columns: 3, icon: <Columns3Icon /> }
];
// The panel sits beside the grid from Tailwind's @4xl container size: below
// it the grid would be squeezed to two narrow columns. CSS lays the panel out;
// this tells the page whether to edit in it or in a dialog.
const INSPECTOR_WIDTH = 896;

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
	// edited by hand since the version on screen loaded; only then does showing
	// another version need a confirm
	const [edited, setEdited] = useState(false);
	const [saving, setSaving] = useState(false);
	const [preparing, setPreparing] = useState(0);
	const [selected, setSelected] = useState<string | null>(null);
	const [preview, setPreview] = useState<number | null>(null);
	const [pendingVersion, setPendingVersion] = useState<string | null>(null);
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	// what last went wrong, shown in the rail until dismissed or the next publish
	const [problem, setProblem] = useState<string | null>(null);
	const [draggingFiles, setDraggingFiles] = useState(false);
	const dragDepth = useRef(0);
	const watch = useBuildWatch();
	const [body, wide] = useWiderThan(INSPECTOR_WIDTH);

	useEffect(() => {
		if (built) watch.start(built);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [built]);

	// the latest photos and uploads, for an add that finishes after other changes
	const latest = useRef({ photos, uploads });
	useLayoutEffect(() => {
		latest.current = { photos, uploads };
	});

	function update(next: PhotoEntry[], nextUploads = uploads) {
		setPhotos(next);
		setDirty(true);
		setEdited(true);
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
		setEdited(false);
		setProblem(null);
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
		setEdited(true);
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
			setEdited(false);
			setProblem(null);
			clearUnsaved(STORAGE_KEY);
		} catch (error) {
			setProblem(errorMessage(error));
		}
	}

	async function add(files: File[]) {
		const images = files.filter((file) => file.type.startsWith('image/'));
		if (!images.length) return;
		setPreparing((count) => count + images.length);
		for (const file of images) {
			const name = toPhotoFile(file.name);
			try {
				if (latest.current.photos.some((photo) => photo.file === name))
					throw new Error(`${name} is already in the gallery. Rename it and try again.`);
				const { prepared, date } = await preparePhoto(file, name);
				// read the page as it is now: other photos or edits may have
				// landed while this one was being prepared
				const now = latest.current;
				if (now.photos.some((photo) => photo.file === name))
					throw new Error(`${name} is already in the gallery. Rename it and try again.`);
				const nextUploads = new Map(now.uploads).set(name, prepared);
				// new photos go to the end, as `pnpm add-photo` adds them
				const next = [...now.photos, { file: name, alt: '', caption: '', location: '', date }];
				latest.current = { photos: next, uploads: nextUploads };
				setUploads(nextUploads);
				update(next, nextUploads);
			} catch (error) {
				setProblem(errorMessage(error));
			} finally {
				setPreparing((count) => count - 1);
			}
		}
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
		setSelected(null);
	}

	function move(from: string, to: string) {
		update(
			arrayMove(
				photos,
				photos.findIndex((photo) => photo.file === from),
				photos.findIndex((photo) => photo.file === to)
			)
		);
	}

	// The next photo without alt text after the one open, round to the start.
	function nextMissing() {
		const start = photos.findIndex((photo) => photo.file === selected);
		for (let step = 1; step <= photos.length; step++) {
			const photo = photos[(start + step) % photos.length];
			if (!photo.alt.trim()) return setSelected(photo.file);
		}
	}

	async function publish() {
		setProblem(null);
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
			await router.navigate({ to: '/admin/photos', search: { built: commit }, replace: true });
			await router.invalidate();
		} catch (error) {
			setProblem(errorMessage(error));
		} finally {
			setSaving(false);
		}
	}

	// worked out again only when the photos change, not on every key typed in a caption
	const changes = useMemo(() => photoChanges(loaded.photos, photos), [loaded.photos, photos]);
	const summary = describeChanges(changes);
	const source = (file: string) => ({ file, upload: uploads.get(file), ref: viewRef });
	const index = photos.findIndex((photo) => photo.file === selected);
	const editing: Editing | null =
		index < 0
			? null
			: {
					photo: photos[index],
					source: source(photos[index].file),
					position: index + 1,
					total: photos.length,
					onChange: (fields) => edit(photos[index].file, fields),
					onRemove: () => remove(photos[index].file),
					onStep: (by) => setSelected(photos[index + by]?.file ?? selected),
					onClose: () => setSelected(null)
				};
	const missingAlt = photos.filter((photo) => !photo.alt.trim()).length;

	return (
		<div
			className="mx-auto max-w-6xl"
			onDragEnter={(event) => {
				if (!event.dataTransfer.types.includes('Files')) return;
				dragDepth.current++;
				setDraggingFiles(true);
			}}
			onDragLeave={() => {
				dragDepth.current = Math.max(0, dragDepth.current - 1);
				if (dragDepth.current === 0) setDraggingFiles(false);
			}}
			onDragOver={(event) => {
				if (event.dataTransfer.types.includes('Files')) event.preventDefault();
			}}
			onDrop={(event) => {
				dragDepth.current = 0;
				setDraggingFiles(false);
				if (!event.dataTransfer.files.length) return;
				event.preventDefault();
				add([...event.dataTransfer.files]);
			}}
		>
			<AdminHeader path={['photos']} />
			<ControlsRail
				status={
					<>
						<BuildBadge build={watch.build} />
						<span>
							{preparing > 0
								? `Preparing ${preparing} ${preparing === 1 ? 'photo' : 'photos'}…`
								: dirty
									? `Unpublished: ${summary || 'no changes from the site'}`
									: 'Matches the site'}
						</span>
						<ProblemBadge text={problem} onDismiss={() => setProblem(null)} />
					</>
				}
			>
				<VersionSelect
					versions={loaded.versions}
					value={version}
					disabled={saving}
					onChange={(next) => (edited ? setPendingVersion(next) : showVersion(next))}
				/>
				{dirty && (
					<Button
						variant="ghost"
						disabled={saving || preparing > 0}
						onClick={() => setConfirmDiscard(true)}
					>
						Discard
					</Button>
				)}
				<Button onClick={publish} disabled={!dirty || saving || preparing > 0} className="px-3.5">
					Publish
				</Button>
			</ControlsRail>

			<div ref={body} className="@container/page mt-6 grid gap-4">
				<div className="grid grid-cols-2 gap-4 @3xl/page:grid-cols-3">
					<GalleryCard photos={photos} />
					<AltTextCard photos={photos} onNext={nextMissing} />
					<AddPhotosCard
						onAdd={add}
						preparing={preparing}
						dragging={draggingFiles}
						className="col-span-2 @3xl/page:col-span-1"
					/>
				</div>

				<div className="grid items-start gap-4 @4xl/page:grid-cols-[minmax(0,1fr)_20rem]">
					<Card className="@container/grid">
						<CardHeader>
							<CardTitle>order</CardTitle>
							<CardDescription>
								{preview
									? 'As the gallery lays it out. Turn preview off to reorder.'
									: 'Drag to reorder, click to edit.'}
							</CardDescription>
							<CardAction>
								<ToggleGroup
									variant="outline"
									size="sm"
									spacing={0}
									aria-label="Preview the gallery in columns"
									value={preview ? [String(preview)] : []}
									onValueChange={(value) => setPreview(value.length ? Number(value[0]) : null)}
								>
									{PREVIEW_OPTIONS.map(({ columns, icon }) => (
										<ToggleGroupItem
											key={columns}
											value={String(columns)}
											aria-label={`${columns} ${columns === 1 ? 'column' : 'columns'}`}
											title={`Preview in ${columns} ${columns === 1 ? 'column' : 'columns'}`}
										>
											{icon}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</CardAction>
						</CardHeader>
						<CardContent>
							{preview ? (
								<Preview photos={photos} columns={preview} source={source} />
							) : (
								<SortableGrid
									photos={photos}
									source={source}
									selected={selected}
									state={(file) =>
										uploads.has(file) ? 'new' : changes.editedFiles.has(file) ? 'edited' : null
									}
									onSelect={setSelected}
									onMove={move}
								/>
							)}
						</CardContent>
					</Card>

					{/* under the controls rail, and scrolling on its own when taller
					    than the window */}
					<aside className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl @4xl/page:block">
						{wide && editing ? (
							<Inspector editing={editing} />
						) : (
							<EmptyInspector missing={missingAlt} onStart={nextMissing} />
						)}
					</aside>
				</div>
			</div>

			<PhotoDialog editing={wide ? null : editing} />
			<ConfirmDialog
				open={pendingVersion !== null}
				onOpenChange={(open) => !open && setPendingVersion(null)}
				title="Show another version?"
				description="Your unpublished changes will be replaced by that version."
				confirm="Show it"
				onConfirm={() => pendingVersion && showVersion(pendingVersion)}
			/>
			<ConfirmDialog
				open={confirmDiscard}
				onOpenChange={setConfirmDiscard}
				title="Discard your changes?"
				description="The photos go back to how they are on GitHub, and the copy kept in this browser is deleted."
				confirm="Discard"
				destructive
				onConfirm={discard}
			/>
		</div>
	);
}

// Whether an element is at least `width` pixels wide, kept current as the
// window or the sidebar beside it changes size. False until measured, so the
// server and the first paint edit in a dialog.
function useWiderThan(width: number) {
	const [element, setElement] = useState<HTMLElement | null>(null);
	const [wider, setWider] = useState(false);
	useEffect(() => {
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setWider(entry.contentRect.width >= width));
		observer.observe(element);
		return () => observer.disconnect();
	}, [element, width]);
	return [setElement, wider] as const;
}
