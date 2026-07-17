import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { env } from 'cloudflare:workers';
import { Button } from '~/components/ui/button';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { PhotoTable } from '~/components/admin/PhotoTable';
import { DeletePhotoDialog } from '~/components/admin/DeletePhotoDialog';
import { EditPhotoDialog } from '~/components/admin/EditPhotoDialog';
import { UploadButton } from '~/components/admin/UploadButton';
import { MANIFEST_KEY, type Photo } from '~/gallery-manifest';
import { loadPhotos, savePhotos } from '~/gallery-store';
import { requireAdmin } from '~/require-admin';

const listPhotosFn = createServerFn().handler(async () => {
	await requireAdmin();
	// Unfiltered: the admin edits hidden photos too.
	return { photos: await loadPhotos() };
});

const savePhotosFn = createServerFn({ method: 'POST' })
	.inputValidator((photos: Photo[]) => {
		if (!Array.isArray(photos)) throw new Error('Expected an array of photos');
		return photos;
	})
	.handler(async ({ data }) => {
		await requireAdmin();
		await savePhotos(data);
		return { photos: data };
	});

// R2 keys become URL path segments on images.rafe.dev, so anything outside this
// set is replaced rather than escaped at every read site.
function toKey(filename: string) {
	const base = filename.split(/[\\/]/).pop() ?? '';
	return base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+/, '');
}

const uploadPhotoFn = createServerFn({ method: 'POST' })
	.inputValidator((data: FormData) => {
		const file = data.get('file');
		if (!(file instanceof File)) throw new Error('Expected a file');
		return { file };
	})
	.handler(async ({ data }) => {
		await requireAdmin();

		const key = toKey(data.file.name);
		if (!key || key === MANIFEST_KEY) throw new Error(`Cannot upload a file named ${key}`);

		// Overwriting would silently replace a photo that is already in the
		// gallery under this key, so a collision is an error the user resolves
		// by renaming.
		if (await env.PHOTOS.head(key)) {
			throw new Error(`${key} already exists. Rename the file and try again.`);
		}

		await env.PHOTOS.put(key, await data.file.arrayBuffer(), {
			httpMetadata: { contentType: data.file.type }
		});

		// loadPhotos reconciles the new object in at the end of the order.
		const photos = await loadPhotos();
		await savePhotos(photos);
		return { photos };
	});

const deletePhotoFn = createServerFn({ method: 'POST' })
	.inputValidator((key: string) => {
		if (typeof key !== 'string' || !key) throw new Error('Expected a photo key');
		return key;
	})
	.handler(async ({ data }) => {
		await requireAdmin();
		if (data === MANIFEST_KEY) throw new Error('Cannot delete the manifest');

		await env.PHOTOS.delete(data);
		// reconcile drops the entry now that the object is gone.
		const photos = await loadPhotos();
		await savePhotos(photos);
		return { photos };
	});

export const Route = createFileRoute('/admin/')({
	loader: () => listPhotosFn(),
	component: AdminIndexPage
});

function AdminIndexPage() {
	const loaded = Route.useLoaderData();
	const [photos, setPhotos] = useState<Photo[]>(loaded.photos);
	const [saved, setSaved] = useState<Photo[]>(loaded.photos);
	const [busy, setBusy] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<Photo | null>(null);
	const [editing, setEditing] = useState<Photo | null>(null);

	const dirty = JSON.stringify(photos) !== JSON.stringify(saved);

	const accept = (next: Photo[]) => {
		setPhotos(next);
		setSaved(next);
	};

	const withBusy = async (action: () => Promise<void>, message: string) => {
		setBusy(true);
		try {
			await action();
			toast.success(message);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Something went wrong');
		} finally {
			setBusy(false);
		}
	};

	const save = () =>
		withBusy(async () => accept((await savePhotosFn({ data: photos })).photos), 'Saved');

	// Upload and delete rewrite the manifest server-side and hand back the new
	// list, which would drop unsaved edits. Saving first keeps them.
	const mutate = (action: () => Promise<{ photos: Photo[] }>, message: string) =>
		withBusy(async () => {
			if (dirty) await savePhotosFn({ data: photos });
			accept((await action()).photos);
		}, message);

	const hiddenCount = photos.filter((photo) => photo.hidden).length;

	return (
		<div className="flex w-full flex-col gap-8">
			<SlashNav className="text-xl font-medium">
				<Link href="/">rafe</Link>
				admin
			</SlashNav>

			<div className="flex flex-wrap items-center gap-3">
				<UploadButton
					disabled={busy}
					onUpload={(file) => {
						const body = new FormData();
						body.set('file', file);
						return mutate(() => uploadPhotoFn({ data: body }), `Uploaded ${file.name}`);
					}}
				/>
				<span className="text-sm text-muted-foreground">
					{photos.length} photo{photos.length === 1 ? '' : 's'}
					{hiddenCount > 0 && `, ${hiddenCount} hidden`}
				</span>
				<Button className="ml-auto" disabled={!dirty || busy} onClick={save}>
					{dirty ? 'Save changes' : 'Saved'}
				</Button>
			</div>

			<PhotoTable
				photos={photos}
				disabled={busy}
				onChange={setPhotos}
				onEdit={setEditing}
				onDelete={setPendingDelete}
			/>

			<EditPhotoDialog
				photo={editing}
				onCancel={() => setEditing(null)}
				onApply={(updated) => {
					setPhotos(photos.map((photo) => (photo.key === updated.key ? updated : photo)));
					setEditing(null);
				}}
			/>

			<DeletePhotoDialog
				photo={pendingDelete}
				onCancel={() => setPendingDelete(null)}
				onConfirm={(key) => {
					setPendingDelete(null);
					return mutate(() => deletePhotoFn({ data: key }), 'Deleted');
				}}
			/>
		</div>
	);
}
