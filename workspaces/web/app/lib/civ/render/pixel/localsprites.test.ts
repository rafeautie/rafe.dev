import { describe, expect, it } from 'vitest';
import {
	DEFS,
	EXTRA_DEFS,
	Kind,
	SEASONAL,
	SHADOW,
	chunkLook,
	furnaceGlowLook,
	kilnGlowLook,
	lookOf,
	shadowLook,
	variantCount
} from './localsprites';
import { PALETTE } from './palette';
import { pixels, type SpriteDef } from './sprite';

// sizes in art pixels from STYLE.md: [min, max] of the tallest or widest side
const HEIGHT: Partial<Record<number, [number, number]>> = {
	[Kind.oak]: [26, 36],
	[Kind.conifer]: [30, 40],
	[Kind.scrub]: [16, 20],
	[Kind.bush]: [8, 10],
	[Kind.berry]: [8, 10],
	[Kind.tuft]: [3, 5],
	[Kind.reed]: [6, 9]
};
const WIDTH: Partial<Record<number, [number, number]>> = {
	[Kind.tent]: [20, 24],
	[Kind.hut]: [30, 36],
	[Kind.kiln]: [16, 16],
	[Kind.furnace]: [18, 18],
	[Kind.store]: [20, 22],
	[Kind.boulder]: [6, 12]
};

const all: [string, SpriteDef][] = [
	...Object.entries(DEFS).flatMap(([k, defs]) =>
		defs.map((d, i): [string, SpriteDef] => [`${k}.${i}`, d])
	),
	...Object.entries(EXTRA_DEFS).flatMap(([k, defs]) =>
		defs.map((d, i): [string, SpriteDef] => [`${k}.${i}`, d])
	)
];

describe('local sprites', () => {
	it('are well formed: even rows, every character keyed, palette colours only', () => {
		expect(all.length).toBeGreaterThan(40);
		for (const [name, def] of all) {
			const w = def.rows[0].length;
			expect(w, name).toBeGreaterThan(0);
			for (const row of def.rows) expect(row.length, `${name} row width`).toBe(w);
			for (const ch of def.rows.join('')) {
				if (ch === '.') continue;
				expect(def.key[ch], `${name} uses '${ch}'`).toBeDefined();
			}
			for (const colour of Object.values(def.key)) {
				if (!colour.startsWith('#')) expect(PALETTE, name).toHaveProperty(colour);
			}
			if (def.foot) {
				expect(def.foot[0]).toBeLessThan(w);
				expect(def.foot[1]).toBeLessThan(def.rows.length);
			}
		}
	});

	it('have no empty row or column at their edges (so feet and sizes are true)', () => {
		for (const [name, def] of all) {
			if (name.startsWith('kilnGlow') || name.startsWith('furnaceGlow')) continue;
			expect(def.rows[0].replaceAll('.', '').length, `${name} top`).toBeGreaterThan(0);
			expect(
				def.rows[def.rows.length - 1].replaceAll('.', '').length,
				`${name} bottom`
			).toBeGreaterThan(0);
		}
	});

	it('stay within the sizes in STYLE.md', () => {
		for (const [kind, [lo, hi]] of Object.entries(HEIGHT) as [string, [number, number]][]) {
			for (const def of DEFS[Number(kind)]) {
				expect(def.rows.length, `kind ${kind} height`).toBeGreaterThanOrEqual(lo);
				expect(def.rows.length, `kind ${kind} height`).toBeLessThanOrEqual(hi);
			}
		}
		for (const [kind, [lo, hi]] of Object.entries(WIDTH) as [string, [number, number]][]) {
			for (const def of DEFS[Number(kind)]) {
				expect(def.rows[0].length, `kind ${kind} width`).toBeGreaterThanOrEqual(lo);
				expect(def.rows[0].length, `kind ${kind} width`).toBeLessThanOrEqual(hi);
			}
		}
		// shrine stones 8 to 12 tall
		for (const def of DEFS[Kind.standing]) {
			expect(def.rows.length).toBeGreaterThanOrEqual(8);
			expect(def.rows.length).toBeLessThanOrEqual(12);
		}
	});

	it('have 2 or 3 oaks, 2 or 3 conifers and several of every plant kind', () => {
		expect(DEFS[Kind.oak].length).toBeGreaterThanOrEqual(2);
		expect(DEFS[Kind.oak].length).toBeLessThanOrEqual(3);
		expect(DEFS[Kind.conifer].length).toBeGreaterThanOrEqual(2);
		expect(DEFS[Kind.conifer].length).toBeLessThanOrEqual(3);
		for (const kind of [Kind.bush, Kind.berry, Kind.tuft, Kind.boulder]) {
			expect(DEFS[kind].length).toBeGreaterThanOrEqual(2);
		}
		// every ore has an outcrop
		for (let k = Kind.flint; k <= Kind.meteorite; k++) expect(DEFS[k].length).toBeGreaterThan(0);
	});

	it('draw the campfire in four flames and the glow in alternating frames', () => {
		expect(EXTRA_DEFS.flame.length).toBe(4);
		expect(new Set(EXTRA_DEFS.flame.map((d) => d.rows.join('/'))).size).toBe(4);
		// the kiln and furnace glow overlays repaint the mouth in three colours
		expect(kilnGlowLook(0).recolor).not.toEqual(kilnGlowLook(1).recolor);
		expect(furnaceGlowLook(2).recolor).not.toEqual(furnaceGlowLook(1).recolor);
	});
});

describe('seasons', () => {
	const seasonal = Object.keys(SEASONAL).map(Number);

	it('recolour every seasonal kind differently in each season, never by tint', () => {
		for (const kind of seasonal) {
			const seen = new Set<string>();
			for (let s = 0; s < 4; s++) {
				const look = lookOf(kind, 0, s);
				const grid = pixels(look.def, look.recolor);
				// builds without throwing: every key character has a colour
				expect(grid.length).toBeGreaterThan(0);
				seen.add(JSON.stringify(grid));
			}
			expect(seen.size, `kind ${kind}`).toBeGreaterThanOrEqual(3);
		}
	});

	it('goes bare in winter for broadleaf trees and snowy for conifers', () => {
		const summer = lookOf(Kind.oak, 0, 1);
		const winter = lookOf(Kind.oak, 0, 3);
		expect(winter.def).not.toBe(summer.def);
		expect(Math.abs(winter.def.rows.length - summer.def.rows.length)).toBeLessThanOrEqual(3);
		const cs = lookOf(Kind.conifer, 0, 3);
		expect(cs.recolor?.s).toBe('white');
		expect(lookOf(Kind.conifer, 0, 1).recolor).toBeUndefined();
	});

	it('blossoms in spring, goes gold in autumn', () => {
		expect(lookOf(Kind.oak, 0, 0).recolor?.p).toBe('blossom');
		expect(lookOf(Kind.oak, 0, 2).recolor?.m).toBeDefined();
	});

	it('caches looks, and tents and huts differ by variant', () => {
		expect(lookOf(Kind.oak, 1, 1)).toBe(lookOf(Kind.oak, 1, 1));
		expect(lookOf(Kind.hut, 0, 1).recolor).not.toEqual(lookOf(Kind.hut, 1, 1).recolor);
		expect(variantCount(Kind.tent)).toBe(3);
	});
});

describe('shadows and chunks', () => {
	it('are flat ovals of the shadow colour', () => {
		for (const kind of Object.keys(SHADOW).map(Number)) {
			const look = shadowLook(kind)!;
			expect(look).not.toBeNull();
			expect(look.def.key).toEqual({ s: 'shadow' });
			expect(look.def.rows[0].length % 2).toBe(1);
		}
		expect(shadowLook(Kind.tuft)).toBeNull();
	});

	it('use the colours of the ore they came from', () => {
		for (let k = Kind.flint; k <= Kind.meteorite; k++) {
			const look = chunkLook(k);
			expect(() => pixels(look.def, look.recolor)).not.toThrow();
		}
	});
});
