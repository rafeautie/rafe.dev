import { describe, expect, it } from 'vitest';
import { LADDER, MAX_ZOOM, MIN_ZOOM, modeOf, pixelScale, snapZoom } from './scale';
import { pixels, type SpriteDef } from './sprite';
import { PALETTE } from './palette';

describe('zoom ladder', () => {
	it('is smooth in the overview and snaps above it', () => {
		expect(snapZoom(5)).toBe(5);
		expect(snapZoom(17)).toBe(16);
		expect(snapZoom(31)).toBe(32);
		expect(snapZoom(500)).toBe(480);
		expect(snapZoom(1e6)).toBe(MAX_ZOOM);
		expect(snapZoom(0)).toBe(MIN_ZOOM);
	});

	it('gives whole-number pixel scales on every rung', () => {
		for (const rung of LADDER) {
			const s = pixelScale(rung);
			expect(Number.isInteger(s)).toBe(true);
			const perTile = modeOf(rung) === 'map' ? 16 : 240;
			expect(rung).toBe(s * perTile);
		}
	});

	it('names the mode by zoom', () => {
		expect(modeOf(4)).toBe('overview');
		expect(modeOf(32)).toBe('map');
		expect(modeOf(240)).toBe('local');
	});
});

describe('sprites', () => {
	const def: SpriteDef = { key: { a: 'leaf', b: '#123456' }, rows: ['.a.', 'aba'] };

	it('reads pixels from text rows', () => {
		const grid = pixels(def);
		expect(grid[0]).toEqual([null, PALETTE.leaf, null]);
		expect(grid[1][1]).toBe('#123456');
	});

	it('recolours by key', () => {
		expect(pixels(def, { a: 'gold' })[0][1]).toBe(PALETTE.gold);
	});

	it('refuses a character with no colour', () => {
		expect(() => pixels({ key: {}, rows: ['x'] })).toThrow();
	});
});
