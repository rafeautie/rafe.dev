import { describe, expect, it } from 'vitest';
import { zoneOffset } from './zone';

describe('zoneOffset', () => {
	it('gives a zone’s offset from UTC, daylight saving included', () => {
		expect(zoneOffset('UTC', Date.UTC(2026, 9, 23, 12))).toBe(0);
		expect(zoneOffset('America/Los_Angeles', Date.UTC(2026, 6, 1, 12))).toBe(-7 * 3600_000);
		expect(zoneOffset('America/Los_Angeles', Date.UTC(2026, 11, 1, 12))).toBe(-8 * 3600_000);
		expect(zoneOffset('Asia/Kolkata', Date.UTC(2026, 0, 1, 12))).toBe(5.5 * 3600_000);
	});

	it('falls back to UTC for an unknown zone', () => {
		expect(zoneOffset('Nowhere/Special', Date.now())).toBe(0);
	});
});
