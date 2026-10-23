import { describe, expect, it } from 'vitest';
import { captureDate, inspectJpeg, isNormalized, toPhotoFile } from './jpeg';

// A minimal JPEG header: SOI, an optional APP1, then a baseline frame.
function jpeg({ width, height, exif }: { width: number; height: number; exif?: Uint8Array }) {
	const frame = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff];
	const app1 = exif ? [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif] : [];
	return new Uint8Array([0xff, 0xd8, ...app1, ...frame, ...new Array(12).fill(0), 0xff, 0xda]);
}

// "Exif\0\0", then a little-endian TIFF with IFD0 -> Exif IFD -> DateTimeOriginal.
function exifWithDate(date: string) {
	const tiff = new DataView(new ArrayBuffer(80));
	tiff.setUint16(0, 0x4949);
	tiff.setUint16(2, 42, true);
	tiff.setUint32(4, 8, true);
	// IFD0 at 8: one entry, the Exif IFD pointer
	tiff.setUint16(8, 1, true);
	tiff.setUint16(10, 0x8769, true);
	tiff.setUint16(12, 4, true);
	tiff.setUint32(14, 1, true);
	tiff.setUint32(18, 26, true);
	// Exif IFD at 26: one entry, DateTimeOriginal, 20 ASCII bytes at 44
	tiff.setUint16(26, 1, true);
	tiff.setUint16(28, 0x9003, true);
	tiff.setUint16(30, 2, true);
	tiff.setUint32(32, 20, true);
	tiff.setUint32(36, 44, true);
	[...date].forEach((char, i) => tiff.setUint8(44 + i, char.charCodeAt(0)));
	return new Uint8Array([...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat([...new Uint8Array(tiff.buffer)]));
}

describe('inspectJpeg', () => {
	it('reads the size and spots EXIF', () => {
		expect(inspectJpeg(jpeg({ width: 2560, height: 1707 }))).toEqual({
			width: 2560,
			height: 1707,
			hasMetadata: false
		});
		expect(inspectJpeg(jpeg({ width: 10, height: 10, exif: exifWithDate('2026:01:25 09:00:00') })).hasMetadata).toBe(true);
	});

	it('accepts only stripped JPEGs within the size limit', () => {
		expect(isNormalized(jpeg({ width: 2560, height: 1707 }))).toBe(true);
		expect(isNormalized(jpeg({ width: 2561, height: 1707 }))).toBe(false);
		expect(isNormalized(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
	});
});

describe('captureDate', () => {
	it('reads DateTimeOriginal as yyyy-mm-dd', () => {
		expect(captureDate(jpeg({ width: 1, height: 1, exif: exifWithDate('2026:01:25 09:00:00') }))).toBe(
			'2026-01-25'
		);
	});

	it('is empty without EXIF', () => {
		expect(captureDate(jpeg({ width: 1, height: 1 }))).toBe('');
	});
});

describe('toPhotoFile', () => {
	it('matches photo-lib', () => {
		expect(toPhotoFile('DSCF1234.JPG')).toBe('DSCF1234.jpg');
		expect(toPhotoFile('my photo (1).heic')).toBe('my-photo--1-.jpg');
	});
});
