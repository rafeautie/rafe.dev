import { captureDate, isNormalized, JPEG_QUALITY, MAX_EDGE } from './jpeg';

// Preparing files in the browser before they are committed, since the Worker
// cannot run sharp. Photos get what scripts/photo-lib.mjs would do to them;
// post images are only stripped of metadata and capped in size, as the build
// makes the sizes it serves.

export type Prepared = { name: string; base64: string; url: string; width: number; height: number };

export function toBase64(bytes: Uint8Array) {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

// A safe file name: it ends up in a URL.
export function safeName(name: string, extension: string) {
	const stem = name
		.replace(/\.[^.]*$/, '')
		.replace(/[^a-zA-Z0-9._-]/g, '-')
		.replace(/^-+/, '');
	return `${stem || 'image'}.${extension}`;
}

// Draws the image upright (EXIF orientation applied), no larger than MAX_EDGE,
// and re-encodes it. A canvas writes no metadata, so GPS and the rest are gone.
async function reencode(file: Blob, type: 'image/jpeg' | 'image/png') {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
		throw new Error('This browser cannot open that image. Try a JPEG or PNG.');
	});
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Could not process the image');
	context.imageSmoothingQuality = 'high';
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined)
	);
	if (!blob) throw new Error('Could not process the image');
	return { blob, bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

// A gallery photo: a JPEG at most 2560px on its long edge, no metadata, and
// the capture date read before that is stripped.
export async function preparePhoto(file: File, name: string) {
	const original = new Uint8Array(await file.arrayBuffer());
	const date = captureDate(original);
	const { blob, bytes, width, height } = await reencode(file, 'image/jpeg');
	if (!isNormalized(bytes)) throw new Error(`${file.name} could not be prepared`);
	const prepared: Prepared = {
		name,
		base64: toBase64(bytes),
		url: URL.createObjectURL(blob),
		width,
		height
	};
	return { prepared, date };
}

// An image for a post. GIFs go up as they are (a canvas would flatten an
// animation); PNGs stay PNGs for their transparency; the rest become JPEGs.
// SVGs are refused: served from rafe.dev, one could run script as the site.
export async function preparePostImage(file: File, taken: (name: string) => boolean) {
	if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
		throw new Error(`${file.name}: SVG images aren't supported, export it as a PNG`);
	}
	const keep = /\.gif$/i.test(file.name);
	const png = file.type === 'image/png';
	const extension = keep ? file.name.split('.').pop()!.toLowerCase() : png ? 'png' : 'jpg';

	let name = safeName(file.name, extension);
	for (let n = 2; taken(name); n++)
		name = safeName(`${file.name.replace(/\.[^.]*$/, '')}-${n}`, extension);

	if (keep) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		return { name, base64: toBase64(bytes), url: URL.createObjectURL(file), width: 0, height: 0 };
	}
	const { blob, bytes, width, height } = await reencode(file, png ? 'image/png' : 'image/jpeg');
	return { name, base64: toBase64(bytes), url: URL.createObjectURL(blob), width, height };
}
