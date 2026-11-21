import { describe, expect, it } from 'vitest';
import type { PhotoEntry } from './api';
import { describeChanges, photoChanges } from './photo-changes';

const photo = (file: string, fields: Partial<PhotoEntry> = {}): PhotoEntry => ({
	file,
	alt: '',
	caption: '',
	location: '',
	date: '',
	...fields
});

const list = (...files: string[]) => files.map((file) => photo(file));

describe('photoChanges', () => {
	it('finds nothing in the same list', () => {
		const changes = photoChanges(list('a', 'b', 'c'), list('a', 'b', 'c'));
		expect(describeChanges(changes)).toBe('');
	});

	it('counts one drag as one move, however far it goes', () => {
		expect(photoChanges(list('a', 'b', 'c', 'd', 'e'), list('b', 'c', 'd', 'e', 'a')).moved).toBe(
			1
		);
		expect(photoChanges(list('a', 'b', 'c', 'd'), list('b', 'a', 'd', 'c')).moved).toBe(2);
	});

	it('does not count adding or removing as moving', () => {
		const changes = photoChanges(list('a', 'b', 'c'), list('a', 'c', 'new'));
		expect(changes).toMatchObject({ added: 1, removed: 1, moved: 0, edited: 0 });
		expect(describeChanges(changes)).toBe('1 added · 1 removed');
	});

	it('notices edited fields', () => {
		const changes = photoChanges(list('a', 'b'), [photo('a', { alt: 'A hill' }), photo('b')]);
		expect(changes.edited).toBe(1);
		expect([...changes.editedFiles]).toEqual(['a']);
	});
});
