import { env } from 'cloudflare:workers';
import { MANIFEST_KEY, reconcile, type Manifest, type Photo } from '~/gallery-manifest';

// list() returns at most 1000 keys per call. A truncated listing would look to
// reconcile() like every un-listed photo had been deleted, and it would drop
// them from the manifest, so every page is read before reconciling.
async function listAllKeys(): Promise<string[]> {
	const keys: string[] = [];
	let cursor: string | undefined;

	do {
		const page = await env.PHOTOS.list({ cursor });
		keys.push(...page.objects.map(({ key }) => key));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);

	return keys;
}

async function readManifest(): Promise<Manifest> {
	const object = await env.PHOTOS.get(MANIFEST_KEY);
	if (!object) return { photos: [] };

	// A corrupt manifest throws rather than falling back to empty: an empty
	// manifest reconciles to "every photo is new", and the next save would
	// write that over the real order and metadata.
	const parsed = (await object.json()) as Manifest;
	if (!Array.isArray(parsed?.photos)) {
		throw new Error(`${MANIFEST_KEY} is malformed: expected a photos array`);
	}
	return parsed;
}

export async function loadPhotos(): Promise<Photo[]> {
	const [manifest, keys] = await Promise.all([readManifest(), listAllKeys()]);
	return reconcile(manifest, keys);
}

export async function savePhotos(photos: Photo[]): Promise<void> {
	await env.PHOTOS.put(MANIFEST_KEY, JSON.stringify({ photos } satisfies Manifest), {
		httpMetadata: { contentType: 'application/json' }
	});
}
