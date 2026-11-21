import type { Prepared } from '~/lib/admin/files';
import { PHOTOS } from '~/photos';

// Where the photos page gets a photo's picture and facts from: the site's
// own build when the photo is published, the prepared file when it is new.

export type Source = { file: string; upload?: Prepared; ref: string };

export const BUILT = new Map(PHOTOS.map((photo) => [photo.file, photo]));

// The photo's size in pixels, when the page knows it: from the build, or from
// the file just picked. Photos only on GitHub are not measured.
export function dimensions(source: Source) {
	if (source.upload) return { width: source.upload.width, height: source.upload.height };
	const built = BUILT.get(source.file);
	return built ? { width: built.picture.img.w, height: built.picture.img.h } : null;
}
