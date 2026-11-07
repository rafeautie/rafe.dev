import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { ACTION_IDS } from './actions';
import { HEAT_LADDER, heatAvailable, matchIdea, resolve } from './engine';
import { MATERIALS, matchesSelector } from './materials';
import { RULES } from './rules';

const attempt = (action: string, items: string[], heat = 0, skill = 1) => ({
	action,
	items,
	heat,
	skill
});

describe('tables', () => {
	it('have the fourteen actions and a healthy number of rules', () => {
		expect(ACTION_IDS).toHaveLength(14);
		expect(RULES.length).toBeGreaterThanOrEqual(50);
		expect(Object.keys(MATERIALS).length).toBeGreaterThanOrEqual(40);
	});

	it('only name materials and actions that exist, with unique rule ids', () => {
		const ids = new Set<string>();
		for (const rule of RULES) {
			expect(ids.has(rule.id), rule.id).toBe(false);
			ids.add(rule.id);
			expect(ACTION_IDS).toContain(rule.action);
			for (const out of rule.outputs) expect(MATERIALS[out.material], out.material).toBeTruthy();
			for (const sel of [...rule.inputs, ...rule.needs]) {
				for (const alt of sel.replace('~', '').split('|')) {
					if (!alt.startsWith('#')) expect(MATERIALS[alt], `${rule.id}: ${alt}`).toBeTruthy();
				}
			}
			// a heat source a rule teaches must be on the ladder
			if (rule.heat && rule.knowledge && rule.action !== 'strike' && rule.action !== 'grind') {
				const rung = HEAT_LADDER.find((r) => r.knowledge === rule.knowledge);
				expect(rung?.heat, rule.id).toBe(rule.heat);
			}
		}
		for (const material of Object.values(MATERIALS)) {
			if (material.yields) expect(MATERIALS[material.yields], material.id).toBeTruthy();
		}
	});

	it('selectors read properties', () => {
		expect(matchesSelector('flint', '#sharpbreak')).toBe(true);
		expect(matchesSelector('granite', '#hard')).toBe(true);
		expect(matchesSelector('clay', '#hard')).toBe(false);
		expect(matchesSelector('flax', '#strongfiber')).toBe(true);
		expect(matchesSelector('nope', '#hard')).toBe(false);
	});
});

describe('heat ladder', () => {
	const fuel = { wood: true, charcoal: false };
	it('rises with what is known', () => {
		expect(heatAvailable({}, fuel)).toBe(0);
		expect(heatAvailable({ 'fire-making': 0.2 }, fuel)).toBe(600);
		expect(heatAvailable({ 'fire-making': 1, 'pit-fire': 0.1 }, fuel)).toBe(800);
		expect(heatAvailable({ 'fire-making': 1, kiln: 0.1 }, fuel)).toBe(1100);
		expect(heatAvailable({ 'fire-making': 1, bellows: 0.1 }, fuel)).toBe(1300);
	});
	it('needs fuel, and charcoal for the hottest', () => {
		const known = { 'fire-making': 1, charcoal: 1, furnace: 1 };
		expect(heatAvailable(known, { wood: false, charcoal: false })).toBe(0);
		expect(heatAvailable(known, fuel)).toBe(600);
		expect(heatAvailable(known, { wood: false, charcoal: true })).toBe(1500);
	});
});

describe('resolve', () => {
	it('fires a wet pot at 600, and fails below with a heat reason', () => {
		const ok = resolve(attempt('heat', ['wet-pot'], 600), new Rng(1));
		expect(ok.result).toBe('success');
		expect(ok.produces).toEqual([{ material: 'pot', count: 1 }]);
		expect(ok.learns).toBe('pottery');
		const cold = resolve(attempt('heat', ['wet-pot'], 500), new Rng(1));
		expect(cold.result).toBe('fail');
		expect(cold.reason).toMatch(/not hot enough/);
		expect(cold.produces).toEqual([]);
		expect(resolve(attempt('heat', ['wet-pot'], 0), new Rng(1)).reason).toMatch(/no fire/);
	});

	it('needs charcoal and 1100 degrees for copper', () => {
		const bare = resolve(attempt('heat', ['copper-ore'], 1500), new Rng(1));
		expect(bare.result).toBe('fail');
		expect(bare.reason).toMatch(/charcoal/);
		const cool = resolve(attempt('heat', ['copper-ore', 'charcoal'], 900), new Rng(1));
		expect(cool.result).toBe('fail');
		expect(cool.reason).toMatch(/not hot enough/);
		const good = resolve(attempt('heat', ['copper-ore', 'charcoal'], 1100), new Rng(1));
		expect(good.result).toBe('success');
		expect(good.produces).toEqual([{ material: 'copper', count: 2 }]);
		expect(good.learns).toBe('smelting-copper');
		expect(good.consumes).toContainEqual({ material: 'charcoal', count: 1 });
		// tin melts out lower
		expect(resolve(attempt('heat', ['tin-ore', 'charcoal'], 900), new Rng(1)).result).toBe(
			'success'
		);
	});

	it('hammers sky iron cold into a blade', () => {
		const out = resolve(attempt('strike', ['meteorite-iron', 'river-stone'], 0), new Rng(1));
		expect(out.result).toBe('success');
		expect(out.produces).toEqual([{ material: 'iron-blade', count: 1 }]);
		// the hammerstone is not used up
		expect(out.consumes).toEqual([{ material: 'meteorite-iron', count: 1 }]);
	});

	it('works over properties, not just listed pairs', () => {
		expect(
			resolve(attempt('strike', ['obsidian', 'granite']), new Rng(1)).produces[0].material
		).toBe('flake');
		expect(resolve(attempt('strike', ['flint', 'flint']), new Rng(1)).result).toBe('success');
		// a soft stone is no hammer
		expect(resolve(attempt('strike', ['flint', 'chalk']), new Rng(1)).result).toBe('nothing');
	});

	it('prefers the more specific rule', () => {
		expect(matchIdea('shape', ['cord', 'cord'])?.id).toBe('make-rope');
		expect(matchIdea('shape', ['flax', 'sinew'])?.id).toBe('twist-cord');
		expect(matchIdea('shape', ['wet-clay', 'stone-axe'])?.id).toBe('shape-mould');
		expect(matchIdea('shape', ['wet-clay', 'flake', 'tally-bone'])?.id).toBe('mark-clay');
	});

	it('gives nothing, never throwing, for the unknown or the unworkable', () => {
		for (const bad of [
			attempt('juggle', ['flint']),
			attempt('strike', ['unobtainium', 'flint']),
			attempt('strike', []),
			attempt('heat', ['constructor']),
			attempt('__proto__', ['flint']),
			attempt('dry', ['flint'])
		]) {
			expect(resolve(bad, new Rng(1)).result).toBe('nothing');
		}
	});

	it('is harder for beginners and certain for masters', () => {
		const wins = (skill: number) => {
			const rng = new Rng(7);
			let n = 0;
			for (let i = 0; i < 400; i++) {
				if (
					resolve(attempt('strike', ['flint', 'river-stone'], 0, skill), rng).result === 'success'
				)
					n++;
			}
			return n;
		};
		expect(wins(0)).toBeGreaterThan(100);
		expect(wins(0)).toBeLessThan(300);
		expect(wins(0.6)).toBeGreaterThan(wins(0));
		expect(wins(1)).toBe(400);
	});

	it('wastes the materials when a ruining rule fails', () => {
		let seen = false;
		const rng = new Rng(3);
		for (let i = 0; i < 50 && !seen; i++) {
			const out = resolve(attempt('heat', ['wet-pot'], 600, 0), rng);
			if (out.result === 'fail') {
				expect(out.consumes).toEqual([{ material: 'wet-pot', count: 1 }]);
				seen = true;
			}
		}
		expect(seen).toBe(true);
	});

	it('is deterministic for a seed', () => {
		const run = () => {
			const rng = new Rng(99);
			return Array.from({ length: 30 }, () =>
				resolve(attempt('strike', ['flint', 'river-stone'], 0, 0.2), rng)
			);
		};
		expect(run()).toEqual(run());
	});
});
