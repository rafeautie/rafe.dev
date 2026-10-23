import { describe, expect, it } from 'vitest';
import { readBeacon, sourceOf } from './beacon';

const ID = '0b6c9e2a-6f1c-4a8e-9a43-0b1e2f3a4b5c';

describe('readBeacon', () => {
	it('keeps a page view, cut to size', () => {
		const view = readBeacon({
			type: 'view',
			id: ID,
			visitor: ID,
			session: ID,
			landing: true,
			newVisitor: true,
			path: '/writing',
			referrer: 'https://news.ycombinator.com/item?id=1',
			utm: { source: 'x'.repeat(500) },
			screen: '1512x982',
			viewport: 'huge',
			pixelRatio: 2,
			language: 'en-US',
			dark: false,
			touch: false,
			loadMs: 9e9
		});
		expect(view).toMatchObject({
			type: 'view',
			path: '/writing',
			referrer: 'https://news.ycombinator.com/item?id=1',
			screen: '1512x982',
			viewport: null,
			loadMs: 60_000
		});
		expect(view.type === 'view' && view.utm.source?.length).toBe(100);
	});

	it('refuses what is not a beacon', () => {
		expect(() => readBeacon({ type: 'view', id: 'x', session: ID, path: '/' })).toThrow();
		expect(() => readBeacon({ type: 'view', id: ID, session: ID, path: 'http://x' })).toThrow();
		expect(() => readBeacon({ type: 'click', id: ID, href: 'javascript:alert(1)' })).toThrow();
		expect(() => readBeacon('hello')).toThrow();
	});

	it('clamps reading time and scroll depth', () => {
		expect(readBeacon({ type: 'update', id: ID, engagedMs: -5, scroll: 250 })).toEqual({
			type: 'update',
			id: ID,
			engagedMs: 0,
			scroll: 100,
			loadMs: null
		});
	});
});

describe('sourceOf', () => {
	it('names other sites by host and leaves this one out', () => {
		expect(sourceOf('https://www.google.com/', 'rafe.dev')).toBe('google.com');
		expect(sourceOf('https://rafe.dev/writing', 'rafe.dev')).toBe(null);
		expect(sourceOf(null, 'rafe.dev')).toBe(null);
	});
});
