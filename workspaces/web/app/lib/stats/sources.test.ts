import { describe, expect, it } from 'vitest';
import { arrivalOf, arrivals } from './sources';

describe('arrivalOf', () => {
	it('knows a visit with no referrer', () => {
		expect(arrivalOf('Direct')).toBe('direct');
	});

	it('knows search engines in any country', () => {
		expect(arrivalOf('google.com')).toBe('search');
		expect(arrivalOf('google.co.uk')).toBe('search');
		expect(arrivalOf('search.brave.com')).toBe('search');
		expect(arrivalOf('duckduckgo.com')).toBe('search');
	});

	it('knows social sites and the hosts under them', () => {
		expect(arrivalOf('t.co')).toBe('social');
		expect(arrivalOf('old.reddit.com')).toBe('social');
		expect(arrivalOf('news.ycombinator.com')).toBe('social');
	});

	it('does not take a site for one it only ends like', () => {
		expect(arrivalOf('notx.com')).toBe('link');
		expect(arrivalOf('github.com')).toBe('link');
	});
});

describe('arrivals', () => {
	it('adds the sources up by kind, most first', () => {
		const row = (key: string, visitors: number) => ({ key, label: key, visitors, views: visitors });
		expect(
			arrivals([row('Direct', 5), row('google.com', 4), row('bing.com', 3), row('github.com', 1)])
		).toEqual([
			{ key: 'search', label: 'search', visitors: 7, views: 7 },
			{ key: 'direct', label: 'direct', visitors: 5, views: 5 },
			{ key: 'link', label: 'other sites', visitors: 1, views: 1 }
		]);
	});
});
