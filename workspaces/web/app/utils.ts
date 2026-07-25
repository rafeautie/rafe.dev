// Width is not optional in practice. Cloudflare Images refuses to transcode a
// source above its size ceiling, and rather than erroring it passes the
// original bytes through: `format=auto` and `quality` both become no-ops and
// the response carries `warning: cf-images 299 "image too large for AVIF"`.
// The camera originals in R2 are all over that ceiling, so an uncapped call
// ships the full multi-megabyte JPEG. Every call site must pass a width.
export function getImageUrl(imageKey: string, width: number) {
	const options = ['format=auto', 'quality=75', `width=${width}`];
	return `https://images.rafe.dev/cdn-cgi/image/${options.join(',')}/${imageKey}`;
}

// Social scrapers render cards at roughly 1200px wide, and several enforce a
// payload limit well under the size of an untransformed original.
export const SOCIAL_IMAGE_WIDTH = 1200;
