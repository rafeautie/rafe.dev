import { describe, expect, it } from 'vitest';
import { postGaps, postStats, readingMinutes } from './post-stats';

describe('postStats', () => {
	it('counts prose, not code, image paths or link targets', () => {
		const body = [
			"It's a well-known [link](https://example.com/a-long-path) here.",
			'',
			'![a cat](cat.jpg)',
			'',
			'```js',
			'const notWords = 1;',
			'```'
		].join('\n');
		expect(postStats(body).words).toBe(5);
	});

	it('finds images without alt text, in Markdown and HTML', () => {
		const body =
			'![](a.jpg) ![ ](b.jpg) ![fine](c.jpg) <img src="d.jpg"> <img alt="ok" src="e.jpg">';
		expect(postStats(body).imagesWithoutAlt).toBe(3);
	});

	it('is empty for an empty body', () => {
		expect(postStats('')).toEqual({ words: 0, imagesWithoutAlt: 0 });
	});
});

describe('readingMinutes', () => {
	it('is at least a minute', () => {
		expect(readingMinutes(0)).toBe(1);
		expect(readingMinutes(1150)).toBe(5);
	});
});

describe('postGaps', () => {
	const fields = { title: 'A post', description: 'About it', image: '', imageAlt: '' };

	it('is empty for a finished post', () => {
		expect(postGaps(fields, { words: 300, imagesWithoutAlt: 0 })).toEqual([]);
	});

	it('names each missing piece', () => {
		expect(
			postGaps(
				{ title: ' ', description: '', image: 'cover.jpg', imageAlt: '' },
				{ words: 0, imagesWithoutAlt: 2 }
			)
		).toEqual([
			'no title',
			'no description',
			'nothing written',
			'no preview alt',
			'2 images without alt'
		]);
	});
});
