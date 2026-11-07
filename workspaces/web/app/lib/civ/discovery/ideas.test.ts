import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { insightChance, ideaOptions } from './ideas';
import { matchIdea } from './engine';

const person = {
	seen: {
		flint: 5,
		'river-stone': 3,
		clay: 2,
		water: 2,
		wood: 4,
		branch: 4,
		grass: 3,
		'raw-meat': 1,
		bone: 1,
		reed: 2,
		flax: 1
	},
	knowledge: { knapping: 0.4 }
};

describe('ideaOptions', () => {
	it('returns distinct options built from known materials', () => {
		const opts = ideaOptions(person, ['ochre'], 600, new Rng(5), 6);
		expect(opts).toHaveLength(6);
		const keys = new Set(opts.map((o) => `${o.action}:${[...o.items].sort()}`));
		expect(keys.size).toBe(6);
		const allowed = new Set([...Object.keys(person.seen), 'ochre']);
		for (const o of opts) for (const id of o.items) expect(allowed.has(id)).toBe(true);
	});

	it('mixes duds and winners, never all winners', () => {
		let duds = 0;
		let winners = 0;
		for (let seed = 1; seed <= 60; seed++) {
			const opts = ideaOptions(person, [], 600, new Rng(seed));
			const d = opts.filter((o) => !matchIdea(o.action, o.items)).length;
			expect(d).toBeGreaterThanOrEqual(1);
			duds += d;
			winners += opts.length - d;
		}
		expect(duds / 60).toBeGreaterThanOrEqual(1);
		expect(winners).toBeGreaterThan(duds);
	});

	it('does not always put the winners in the same places', () => {
		const spots = new Set<number>();
		for (let seed = 1; seed <= 40; seed++) {
			const opts = ideaOptions(person, [], 600, new Rng(seed));
			spots.add(opts.findIndex((o) => !matchIdea(o.action, o.items)));
		}
		expect(spots.size).toBeGreaterThan(2);
	});

	it('is deterministic and survives tiny or empty lists', () => {
		expect(ideaOptions(person, [], 0, new Rng(9))).toEqual(ideaOptions(person, [], 0, new Rng(9)));
		expect(ideaOptions({ seen: {}, knowledge: {} }, [], 0, new Rng(1))).toEqual([]);
		expect(
			ideaOptions({ seen: { flint: 1 }, knowledge: {} }, [], 0, new Rng(1)).length
		).toBeGreaterThan(0);
	});
});

describe('insightChance', () => {
	it('is a few percent a day for a curious, fed, safe person near something new', () => {
		const p = insightChance({
			curiosity: 0.8,
			exposure: 0.6,
			spareTime: 0.7,
			related: 0.3,
			pressure: 0.2
		});
		expect(p).toBeGreaterThan(0.02);
		expect(p).toBeLessThan(0.05);
	});
	it('rises with each factor and stays in range', () => {
		const f = { curiosity: 0.5, exposure: 0.5, spareTime: 0.5, related: 0.5, pressure: 0.5 };
		for (const k of Object.keys(f) as (keyof typeof f)[]) {
			expect(insightChance({ ...f, [k]: 1 })).toBeGreaterThan(insightChance({ ...f, [k]: 0 }));
		}
		const max = insightChance({ curiosity: 9, exposure: 9, spareTime: 9, related: 9, pressure: 9 });
		expect(max).toBeLessThanOrEqual(0.5);
		expect(
			insightChance({ curiosity: NaN, exposure: -1, spareTime: 0, related: 0, pressure: 0 })
		).toBeGreaterThanOrEqual(0);
	});
});
