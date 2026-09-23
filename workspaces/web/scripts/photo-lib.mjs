// Shared by `pnpm add-photo`, the pre-commit hook and the photo test, so all
// three agree on what a committed photo looks like.
//
// The repo is public and git history is permanent, so a photo has to be in its
// final form before its first commit: camera JPEGs carry EXIF (GPS, the body's
// serial number) and are far larger than anything the site serves. The build
// derives every served size from these masters; they are never served as-is.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import exifReader from 'exif-reader';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const PHOTOS_DIR = join(root, 'app/photos');
export const MANIFEST_PATH = join(PHOTOS_DIR, 'photos.json');

// Comfortably above the largest variant the build emits (2048), so it never
// upscales, while keeping each master around 1-2MB.
export const MAX_EDGE = 2560;
const QUALITY = 90;

export const PHOTO_EXT = '.jpg';
export const isImageFile = (file) => /\.(jpe?g|png|webp|avif|heic|heif|tiff?)$/i.test(file);

export async function inspect(input) {
	const meta = await sharp(input).metadata();
	// autoOrient reports the dimensions as displayed, after EXIF rotation.
	const { width, height } = meta.autoOrient ?? meta;
	return {
		format: meta.format,
		width,
		height,
		hasMetadata: Boolean(meta.exif || meta.xmp || meta.iptc)
	};
}

// Idempotent by design: re-encoding an already-normalized JPEG would lose
// quality on every commit that touches it.
export function isNormalized(info) {
	return (
		info.format === 'jpeg' && Math.max(info.width, info.height) <= MAX_EDGE && !info.hasMetadata
	);
}

// sharp drops all metadata unless asked to keep it, and converts to sRGB.
// Orientation is applied to the pixels first, since the tag that described it
// is about to be stripped.
export function normalize(input) {
	return sharp(input)
		.autoOrient()
		.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: QUALITY, mozjpeg: true })
		.toBuffer();
}

// Read before normalizing, which strips the EXIF this comes from. yyyy-mm-dd,
// or '' when the camera recorded nothing.
export async function captureDate(input) {
	const { exif } = await sharp(input).metadata();
	if (!exif) return '';
	try {
		const taken = exifReader(exif).Photo?.DateTimeOriginal;
		// exif-reader builds the Date from the camera's wall clock as if it were
		// UTC, so the UTC date is the date the photo was taken locally.
		return taken instanceof Date && !Number.isNaN(taken.getTime())
			? taken.toISOString().slice(0, 10)
			: '';
	} catch {
		return '';
	}
}

// File names become URL path segments in the build output.
export function toPhotoFile(source) {
	const stem = basename(source, extname(source))
		.replace(/[^a-zA-Z0-9._-]/g, '-')
		.replace(/^-+/, '');
	return `${stem}${PHOTO_EXT}`;
}

export function readManifest() {
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

export function writeManifest(photos) {
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(photos, null, '\t')}\n`);
}

export function newEntry(file, date = '') {
	return { file, alt: '', caption: '', location: '', date };
}
