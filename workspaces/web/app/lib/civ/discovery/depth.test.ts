import { describe, expect, it } from 'vitest';
import { DEPTH_FACTOR, depthFactor, ruleDepth, ruleDepths } from './depth';
import { RULES } from './rules';

const rule = (id: string) => {
	const r = RULES.find((x) => x.id === id);
	if (!r) throw new Error(id);
	return r;
};

describe('rule depth', () => {
	it('puts first-step rules at depth one and later ones deeper', () => {
		expect(ruleDepth(rule('knap-flake'))).toBe(1);
		expect(ruleDepth(rule('cook-meat'))).toBeGreaterThan(ruleDepth(rule('flint-sparks')));
		expect(ruleDepth(rule('shape-pot'))).toBeLessThan(ruleDepth(rule('fire-clay')));
		expect(ruleDepth(rule('alloy-bronze'))).toBeGreaterThan(ruleDepth(rule('smelt-ore')));
		expect(ruleDepth(rule('build-furnace'))).toBeGreaterThan(ruleDepth(rule('build-kiln')));
	});

	it('gives every rule a depth, and deeper rules a smaller factor', () => {
		expect(ruleDepths().size).toBe(RULES.length);
		for (let i = 1; i < DEPTH_FACTOR.length; i++) {
			expect(DEPTH_FACTOR[i]).toBeLessThanOrEqual(DEPTH_FACTOR[i - 1]);
		}
		expect(depthFactor(rule('knap-flake'))).toBe(1);
		expect(depthFactor(rule('alloy-bronze'))).toBeLessThan(depthFactor(rule('cook-meat')));
	});
});
