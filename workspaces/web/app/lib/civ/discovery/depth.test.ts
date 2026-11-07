import { describe, expect, it } from 'vitest';
import { DEPTH_FACTOR, depthFactor, ideaDepth, ruleDepths } from './depth';
import { RULES } from './rules';

const rule = (id: string) => {
	const r = RULES.find((x) => x.id === id);
	if (!r) throw new Error(id);
	return r;
};
const depth = (id: string, items: string[]) => ideaDepth(rule(id), items);

describe('depth', () => {
	it('puts first-step tries at depth one and later ones deeper', () => {
		expect(depth('knap-flake', ['flint', 'granite'])).toBe(1);
		expect(depth('cook-meat', ['raw-meat'])).toBeGreaterThan(
			depth('flint-sparks', ['flint', 'granite', 'dry-grass'])
		);
		expect(depth('fire-clay', ['wet-pot'])).toBeGreaterThan(depth('shape-pot', ['wet-clay']));
		expect(depth('alloy-bronze', ['copper', 'tin'])).toBeGreaterThan(
			depth('build-kiln', ['wet-clay', 'wet-clay', 'wood'])
		);
	});

	it('counts what a try uses, not just which rule it is', () => {
		// the same rule is a step deeper for something that must itself be made first
		expect(depth('fire-clay', ['wet-tablet'])).toBeGreaterThan(depth('fire-clay', ['wet-pot']));
	});

	it('reaches every rule and slows deeper ones more', () => {
		expect(ruleDepths().size).toBe(RULES.length);
		for (let i = 1; i < DEPTH_FACTOR.length; i++) {
			expect(DEPTH_FACTOR[i]).toBeLessThanOrEqual(DEPTH_FACTOR[i - 1]);
		}
		expect(depthFactor(rule('knap-flake'), ['flint', 'granite'])).toBe(1);
		expect(depthFactor(rule('alloy-bronze'), ['copper', 'tin'])).toBeLessThan(
			depthFactor(rule('cook-meat'), ['raw-meat'])
		);
	});
});
