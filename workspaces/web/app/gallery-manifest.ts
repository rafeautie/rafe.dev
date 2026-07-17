// Order and metadata for the photo gallery live in a single JSON object in the
// PHOTOS bucket rather than in R2 per-object customMetadata, because R2 has no
// metadata-only update: editing customMetadata means re-uploading the object,
// so a reorder would rewrite every photo.
export const MANIFEST_KEY = 'gallery.json';

export type Photo = {
	// R2 object key, the join to the actual file.
	key: string;
	alt: string;
	caption: string;
	location: string;
	// ISO yyyy-mm-dd.
	date: string;
	hidden: boolean;
};

export type Manifest = { photos: Photo[] };

export function newPhoto(key: string): Photo {
	return { key, alt: '', caption: '', location: '', date: '', hidden: false };
}

// The manifest and the bucket drift whenever a photo is added or removed
// outside the admin, so both routes read the gallery through here. Manifest
// order wins; objects the manifest has never seen land at the end.
export function reconcile(manifest: Manifest, bucketKeys: string[]): Photo[] {
	const present = new Set(bucketKeys);
	present.delete(MANIFEST_KEY);

	const kept = manifest.photos.filter((photo) => present.has(photo.key));
	const known = new Set(kept.map((photo) => photo.key));
	const added = bucketKeys.filter((key) => present.has(key) && !known.has(key)).map(newPhoto);

	return [...kept, ...added];
}
