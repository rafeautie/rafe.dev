// Just enough of the JPEG format for the admin's photo uploads, which skip the
// sharp pipeline in scripts/photo-lib.mjs: the browser reads the capture date
// before re-encoding, and both sides check the result is what the pre-commit
// hook would have committed (a JPEG, no larger than MAX_EDGE, no metadata).

// scripts/photo-lib.mjs
export const MAX_EDGE = 2560;
export const JPEG_QUALITY = 0.9;

type Segment = { marker: number; start: number; length: number };

function* segments(bytes: Uint8Array): Generator<Segment> {
	let offset = 2;
	while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
		const marker = bytes[offset + 1];
		// start of scan: the image data follows, and no more headers
		if (marker === 0xda) return;
		const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
		yield { marker, start: offset + 4, length: length - 2 };
		offset += 2 + length;
	}
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

export function isJpeg(bytes: Uint8Array) {
	return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

// Start-of-frame markers, which carry the dimensions: C0 to CF, less DHT (C4),
// JPG (C8) and DAC (CC).
const isFrame = (marker: number) =>
	marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

export function inspectJpeg(bytes: Uint8Array) {
	let width = 0;
	let height = 0;
	let hasMetadata = false;
	for (const { marker, start, length } of segments(bytes)) {
		if (isFrame(marker)) {
			height = (bytes[start + 1] << 8) | bytes[start + 2];
			width = (bytes[start + 3] << 8) | bytes[start + 4];
		}
		// APP1 holds EXIF and XMP, APP13 holds IPTC: the three photo-lib checks
		if (marker === 0xed) hasMetadata = true;
		if (marker === 0xe1 && /^(Exif|http)/.test(ascii(bytes, start, Math.min(length, 4)))) {
			hasMetadata = true;
		}
	}
	return { width, height, hasMetadata };
}

export function isNormalized(bytes: Uint8Array) {
	if (!isJpeg(bytes)) return false;
	const { width, height, hasMetadata } = inspectJpeg(bytes);
	return width > 0 && height > 0 && Math.max(width, height) <= MAX_EDGE && !hasMetadata;
}

// DateTimeOriginal from the EXIF block, as yyyy-mm-dd, or '' when the camera
// recorded none. The camera's wall clock, like captureDate in photo-lib.mjs.
export function captureDate(bytes: Uint8Array): string {
	if (!isJpeg(bytes)) return '';
	for (const { marker, start } of segments(bytes)) {
		if (marker !== 0xe1 || ascii(bytes, start, 4) !== 'Exif') continue;
		try {
			return exifDate(new DataView(bytes.buffer, bytes.byteOffset + start + 6));
		} catch {
			return '';
		}
	}
	return '';
}

const EXIF_IFD = 0x8769;
const DATE_TIME_ORIGINAL = 0x9003;

function exifDate(tiff: DataView): string {
	const little = tiff.getUint16(0) === 0x4949;
	const u16 = (at: number) => tiff.getUint16(at, little);
	const u32 = (at: number) => tiff.getUint32(at, little);
	const find = (ifd: number, tag: number) => {
		const count = u16(ifd);
		for (let i = 0; i < count; i++) {
			const entry = ifd + 2 + i * 12;
			if (u16(entry) === tag) return entry;
		}
		return -1;
	};

	const pointer = find(u32(4), EXIF_IFD);
	if (pointer < 0) return '';
	const entry = find(u32(pointer + 8), DATE_TIME_ORIGINAL);
	if (entry < 0) return '';
	// "yyyy:mm:dd hh:mm:ss", 20 bytes, so stored at the offset in the entry
	const at = u32(entry + 8);
	let text = '';
	for (let i = 0; i < 10; i++) text += String.fromCharCode(tiff.getUint8(at + i));
	return /^\d{4}:\d{2}:\d{2}$/.test(text) ? text.replaceAll(':', '-') : '';
}

// photo-lib's toPhotoFile: the file name becomes a URL path segment.
export function toPhotoFile(name: string) {
	const stem = name
		.replace(/\.[^.]*$/, '')
		.replace(/[^a-zA-Z0-9._-]/g, '-')
		.replace(/^-+/, '');
	return `${stem || 'photo'}.jpg`;
}
