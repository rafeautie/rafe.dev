import { describe, expect, it } from 'vitest';
import { MANIFEST_KEY, newPhoto, reconcile, type Manifest } from '~/gallery-manifest';

const photo = (key: string, fields: Partial<ReturnType<typeof newPhoto>> = {}) => ({
	...newPhoto(key),
	...fields
});

const manifest = (...keys: string[]): Manifest => ({ photos: keys.map((key) => photo(key)) });

describe('reconcile', () => {
	it('keeps manifest order rather than bucket order', () => {
		const result = reconcile(manifest('c.jpg', 'a.jpg', 'b.jpg'), ['a.jpg', 'b.jpg', 'c.jpg']);

		expect(result.map((p) => p.key)).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
	});

	it('preserves metadata of photos that are still in the bucket', () => {
		const edited = { photos: [photo('a.jpg', { alt: 'a horse', hidden: true })] };

		const result = reconcile(edited, ['a.jpg']);

		expect(result[0]).toMatchObject({ alt: 'a horse', hidden: true });
	});

	it('drops entries whose object is gone from the bucket', () => {
		const result = reconcile(manifest('a.jpg', 'deleted.jpg', 'b.jpg'), ['a.jpg', 'b.jpg']);

		expect(result.map((p) => p.key)).toEqual(['a.jpg', 'b.jpg']);
	});

	it('appends bucket objects the manifest has never seen, with empty metadata', () => {
		const result = reconcile(manifest('a.jpg'), ['a.jpg', 'stray.jpg']);

		expect(result.map((p) => p.key)).toEqual(['a.jpg', 'stray.jpg']);
		expect(result[1]).toEqual(newPhoto('stray.jpg'));
	});

	// The manifest lives in the same bucket as the photos, so list() returns it
	// alongside them. Without this it would list itself as a photo.
	it('never treats the manifest object as a photo', () => {
		const result = reconcile(manifest('a.jpg'), ['a.jpg', MANIFEST_KEY]);

		expect(result.map((p) => p.key)).toEqual(['a.jpg']);
	});

	it('drops a manifest entry for the manifest object itself', () => {
		const result = reconcile(manifest(MANIFEST_KEY, 'a.jpg'), ['a.jpg', MANIFEST_KEY]);

		expect(result.map((p) => p.key)).toEqual(['a.jpg']);
	});

	it('seeds an empty manifest from the bucket in list() order', () => {
		const result = reconcile({ photos: [] }, ['b.jpg', 'a.jpg']);

		expect(result.map((p) => p.key)).toEqual(['b.jpg', 'a.jpg']);
	});
});
