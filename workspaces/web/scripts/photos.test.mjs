// The backstop for the pre-commit hook, which a commit made with --no-verify or
// from the GitHub web editor skips. By the time this fails the offending file
// may already be in history, so the fix is to rewrite that commit, not just
// to add another on top.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	PHOTOS_DIR,
	PHOTO_EXT,
	inspect,
	isImageFile,
	isNormalized,
	readManifest
} from './photo-lib.mjs';

const manifest = readManifest();
const files = readdirSync(PHOTOS_DIR).filter(isImageFile);

describe('photos.json', () => {
	it('lists every photo exactly once', () => {
		const listed = manifest.map(({ file }) => file);
		expect(new Set(listed).size).toBe(listed.length);
		expect([...listed].sort()).toEqual([...files].sort());
	});

	it('gives every entry the full set of fields', () => {
		for (const entry of manifest) {
			expect(Object.keys(entry).sort()).toEqual(['alt', 'caption', 'date', 'file', 'location']);
			expect(entry.date).toMatch(/^(\d{4}-\d{2}-\d{2})?$/);
		}
	});
});

describe.each(files)('%s', (file) => {
	it(`is a normalized ${PHOTO_EXT}: resized, re-encoded and stripped of metadata`, async () => {
		expect(file.endsWith(PHOTO_EXT)).toBe(true);
		expect(isNormalized(await inspect(readFileSync(join(PHOTOS_DIR, file))))).toBe(true);
	});
});
