import { describe, expect, it } from 'vitest';
import { CHAPTERS, LATEST, readChapter } from '.';
import { cleanNudge, nudgeTarget, pendingState, waiting } from './nudges';
import { buildChapter, splitFrontmatter } from './server/job';
import { countGrouping, mergeThemes } from './themes';
import { nextNoon, noonOn, pacificDate, previousNoon } from './time';

describe('noon in California', () => {
	it('is 19:00 UTC in summer and 20:00 UTC in winter', () => {
		expect(noonOn('2026-07-01').toISOString()).toBe('2026-07-01T19:00:00.000Z');
		expect(noonOn('2026-12-01').toISOString()).toBe('2026-12-01T20:00:00.000Z');
	});

	it('follows the clocks on the days they change', () => {
		expect(noonOn('2026-03-08').toISOString()).toBe('2026-03-08T19:00:00.000Z');
		expect(noonOn('2026-11-01').toISOString()).toBe('2026-11-01T20:00:00.000Z');
	});

	it('counts noon itself as passed', () => {
		const noon = new Date('2026-10-22T19:00:00Z');
		expect(nextNoon(noon).toISOString()).toBe('2026-10-23T19:00:00.000Z');
		expect(previousNoon(noon).toISOString()).toBe('2026-10-22T19:00:00.000Z');
		expect(nextNoon(new Date('2026-10-22T18:59:59Z')).toISOString()).toBe(
			'2026-10-22T19:00:00.000Z'
		);
	});

	it('crosses into winter time', () => {
		// 13:00 on Oct 31, PDT; the next noon is Nov 1, PST
		expect(nextNoon(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe(
			'2026-11-01T20:00:00.000Z'
		);
	});

	it('reads the California calendar, not UTC', () => {
		expect(pacificDate(new Date('2026-10-23T02:00:00Z'))).toBe('2026-10-22');
	});
});

describe('nudges', () => {
	it('go to the pending chapter, or the one after while it is being written', () => {
		expect(nudgeTarget(4, null)).toBe(5);
		expect(nudgeTarget(4, { chapter: 4, state: 'publishing' })).toBe(5);
		expect(nudgeTarget(4, { chapter: 5, state: 'writing' })).toBe(6);
		expect(nudgeTarget(4, { chapter: 5, state: 'late' })).toBe(5);
	});

	it('only show a status for the pending chapter', () => {
		expect(pendingState(4, { chapter: 4, state: 'publishing' })).toBe(null);
		expect(pendingState(4, { chapter: 5, state: 'reading' })).toBe('reading');
	});

	it('wait until the chapter they went into is out', () => {
		expect(waiting(5, 4)).toBe(true);
		expect(waiting(5, 5)).toBe(false);
		expect(waiting(null, 4)).toBe(false);
	});

	it('are folded, trimmed and capped', () => {
		expect(cleanNudge('  more   cello \n please ')).toBe('more cello please');
		expect(cleanNudge('   ')).toBe(null);
		expect(cleanNudge(42)).toBe(null);
		expect(cleanNudge('x'.repeat(200))).toHaveLength(200);
		expect(cleanNudge('x'.repeat(201))).toBe(null);
	});
});

describe('themes', () => {
	it('count each nudge once, and only nudges in the batch', () => {
		const themes = countGrouping(
			[
				{ label: 'Answer the signal', nudges: [1, 2, 3, 3] },
				{ label: 'More Pell', nudges: [3, 4, 99] },
				{ label: 'Empty', nudges: [] }
			],
			4
		);
		expect(themes).toEqual([
			{ label: 'Answer the signal', count: 3 },
			{ label: 'More Pell', count: 1 }
		]);
	});

	it('merge by adding counts, keeping the rest and the biggest eight', () => {
		const themes = [
			{ label: 'Answer it', count: 3 },
			{ label: 'Reply to the signal', count: 2 },
			{ label: 'Cello', count: 4 }
		];
		expect(mergeThemes(themes, [{ label: 'Answer the signal', from: [0, 1, 1, 7] }])).toEqual([
			{ label: 'Answer the signal', count: 5 },
			{ label: 'Cello', count: 4 }
		]);
		const many = Array.from({ length: 12 }, (_, i) => ({ label: `t${i}`, count: i + 1 }));
		expect(mergeThemes(many, [])).toHaveLength(8);
		expect(mergeThemes(many, [])[0]).toEqual({ label: 't11', count: 12 });
	});
});

describe('chapters', () => {
	it('are numbered from 1 with no gaps', () => {
		expect(LATEST).toBeGreaterThanOrEqual(1);
		CHAPTERS.forEach((chapter, i) => expect(chapter.chapter).toBe(i + 1));
	});

	it('need their frontmatter', () => {
		const good = { chapter: 2, title: 'A', date: '2026-10-23', summary: 'B' };
		expect(readChapter(good, 'x').themes).toEqual([]);
		expect(() => readChapter({ ...good, date: 'Oct 23' }, 'x')).toThrow(/date/);
		expect(() => readChapter({ ...good, themes: [{ label: 'a' }] }, 'x')).toThrow(/themes/);
	});

	const body = Array.from({ length: 800 }, () => 'word').join(' ');
	const draft = {
		title: 'The Relay',
		summary: 'Ellis talks.',
		body,
		notes: '# Notes',
		shaped: 'You asked; he answered.'
	};
	const themes = [{ label: 'Answer the signal', count: 3 }];

	it('are built from a draft into a file the site can read back', () => {
		const file = buildChapter(2, '2026-10-23', draft, 3, themes);
		const { frontmatter, body: read } = splitFrontmatter(file);
		expect(readChapter(frontmatter, 'built')).toEqual({
			chapter: 2,
			title: 'The Relay',
			date: '2026-10-23',
			summary: 'Ellis talks.',
			nudges: 3,
			themes,
			shaped: 'You asked; he answered.'
		});
		expect(read).toBe(body);
	});

	it('drop the shaped line when no one nudged', () => {
		const file = buildChapter(2, '2026-10-23', draft, 0, []);
		expect(splitFrontmatter(file).frontmatter.shaped).toBe(null);
	});

	it('turn away a draft that is too short or titled by number', () => {
		expect(() => buildChapter(2, '2026-10-23', { ...draft, body: 'Too short.' }, 0, [])).toThrow(
			/words/
		);
		expect(() => buildChapter(2, '2026-10-23', { ...draft, title: 'Chapter 2' }, 0, [])).toThrow(
			/title/
		);
	});
});
