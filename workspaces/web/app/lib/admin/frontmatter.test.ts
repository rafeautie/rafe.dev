import { describe, expect, it } from 'vitest';
import { joinPost, readFields, splitPost } from './frontmatter';

describe('frontmatter', () => {
	const source = [
		'---',
		'title: A post',
		'description: About it',
		'date: 2026-01-02',
		'image: cover.jpg',
		'imageAlt: A cover',
		'custom: kept',
		'---',
		'',
		'Body.',
		''
	].join('\n');

	it('reads the fields the admin edits', () => {
		expect(readFields(splitPost(source).yaml)).toEqual({
			title: 'A post',
			description: 'About it',
			date: '2026-01-02',
			updated: '',
			draft: false,
			image: 'cover.jpg',
			imageAlt: 'A cover'
		});
	});

	it('writes them back and keeps keys it does not know', () => {
		const { yaml, body } = splitPost(source);
		const fields = { ...readFields(yaml), updated: '2026-02-03', image: '', imageAlt: 'A cover' };
		const out = joinPost(yaml, fields, body);
		expect(out).toContain('updated: 2026-02-03');
		expect(out).toContain('custom: kept');
		// no image, so no alt text either
		expect(out).not.toContain('image');
		expect(out.endsWith('\nBody.\n')).toBe(true);
	});

	it('collapses runs of blank lines outside code', () => {
		const body = 'One.\n\n\n\nTwo.\n\n```\na\n\n\nb\n```\n';
		const out = joinPost('title: T', readFields('title: T'), body);
		expect(out).toContain('One.\n\nTwo.');
		expect(out).toContain('a\n\n\nb');
	});
});
