import { describe, expect, it } from 'vitest';
import { keepsMarkdown } from './post-schema';

describe('keepsMarkdown', () => {
	it('accepts what the editor can show', () => {
		const post = [
			'Some **bold** and _italic_ text with a [link](https://example.com).',
			'## A heading',
			'- one\n- two',
			'1. first\n2. second',
			'> a quote',
			'![Half Dome](half-dome.jpg)',
			'<div class="note">\n  raw html\n</div>',
			'```ts\nconst x = 1;\n```',
			'---',
			'`code` and ~~struck~~'
		].join('\n\n');
		expect(keepsMarkdown(post)).toBe(true);
		expect(keepsMarkdown('')).toBe(true);
	});

	it('refuses what it would lose', () => {
		expect(keepsMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')).toBe(false);
		expect(keepsMarkdown('<video controls src="a.mp4"></video>')).toBe(false);
		expect(keepsMarkdown('Press <kbd>K</kbd> now.')).toBe(false);
		expect(keepsMarkdown('- [ ] a task')).toBe(false);
	});
});

describe('the posts on the site', () => {
	const posts = import.meta.glob<string>('/content/writing/*/index.md', {
		query: '?raw',
		import: 'default',
		eager: true
	});
	for (const [file, source] of Object.entries(posts)) {
		it(`${file} opens in the visual editor`, () => {
			const body = source.replace(/^---\n[\s\S]*?\n---\n?/, '');
			expect(keepsMarkdown(body)).toBe(true);
		});
	}
});
