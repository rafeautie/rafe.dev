import { describe, expect, it } from 'vitest';
import { shortDate, timeAgo } from './time';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('timeAgo', () => {
	it('reads like the overview sketch', () => {
		expect(timeAgo(ago(20), NOW)).toBe('just now');
		expect(timeAgo(ago(5 * 60), NOW)).toBe('5 minutes ago');
		expect(timeAgo(ago(2 * 3600), NOW)).toBe('2 hours ago');
		expect(timeAgo(ago(30 * 3600), NOW)).toBe('yesterday');
		expect(timeAgo(ago(3 * 86400), NOW)).toBe('3 days ago');
		expect(timeAgo(ago(10 * 86400), NOW)).toBe('Oct 13');
	});

	it('takes a timestamp as well as an ISO string', () => {
		expect(timeAgo(NOW - 5 * 60 * 1000, NOW)).toBe('5 minutes ago');
	});
});

describe('shortDate', () => {
	it('reads a yyyy-mm-dd date as that day, wherever it runs', () => {
		expect(shortDate('2026-09-27')).toBe('Sep 27, 2026');
		expect(shortDate('')).toBe('');
	});
});
