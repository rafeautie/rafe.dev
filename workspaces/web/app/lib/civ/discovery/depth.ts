// How far each technique sits from what a camp can simply pick up, and how
// much slower that makes it to stumble on. Depth is worked out from the rules
// themselves, so adding a rule needs no table entry: it is as deep as the
// things it needs.

import { Biome, Deposit, Ground, Water } from '../types';
import type { KnowledgeId, MaterialId } from '../types';
import { Rng } from '../rng';
import { expandRule, heatAvailable, resolve } from './engine';
import { RULES, type Rule } from './rules';
import { materialsFromDeposit, materialsFromTile } from './sources';

// ---- tuning knobs
// Chance multiplier for a flash of insight toward a technique, by depth (1 is
// something a camp can try with what it picks up; each step needs the one
// before). Early things come quickly; later ones take generations. Anything
// deeper than the table uses its last entry.
export const DEPTH_FACTOR = [1, 1, 0.8, 0.45, 0.25, 0.14, 0.08, 0.05, 0.03, 0.02];
// a rule nothing can reach (no ore, no fuel) counts as this deep
const UNREACHABLE_DEPTH = DEPTH_FACTOR.length;

// What a band can gather or bring home anywhere on the map. Hunting adds
// meat, hide, bone and sinew, and now and then a young animal.
function startingMaterials(): Set<MaterialId> {
	const have = new Set<MaterialId>(['raw-meat', 'hide', 'bone', 'sinew', 'kid', 'calf', 'pup']);
	for (const biome of Object.values(Biome)) {
		for (const ground of Object.values(Ground)) {
			for (const water of Object.values(Water)) {
				materialsFromTile(biome, ground, water, 0.5).forEach((id) => have.add(id));
			}
		}
	}
	for (const d of Object.values(Deposit)) materialsFromDeposit(d).forEach((id) => have.add(id));
	return have;
}

let depths: Map<string, number> | undefined;

// Breadth-first from the start: round one is every rule a camp could try with
// what it has; each later round adds what the rounds before made or taught.
export function ruleDepths(): Map<string, number> {
	if (depths) return depths;
	const found = new Map<string, number>();
	const have = startingMaterials();
	const knowledge: Record<KnowledgeId, number> = {};
	const rng = new Rng(1);
	for (let round = 1; round <= 24; round++) {
		const heat = heatAvailable(knowledge, { wood: have.has('wood'), charcoal: have.has('charcoal') });
		const gained: MaterialId[] = [];
		const learned: KnowledgeId[] = [];
		for (const rule of RULES) {
			// a rule found earlier can still make new things from new materials
			for (const items of expandRule(rule, have, 64)) {
				// perfect skill: only what the materials and the fire allow
				const out = resolve({ action: rule.action, items, heat, skill: 1 }, rng);
				if (out.result !== 'success' || out.rule !== rule.id) continue;
				if (!found.has(rule.id)) found.set(rule.id, round);
				for (const p of out.produces) gained.push(p.material);
				if (out.learns) learned.push(out.learns);
			}
		}
		// things made this round only count from the next
		if (gained.length === 0 && learned.length === 0) break;
		for (const id of gained) have.add(id);
		for (const id of learned) knowledge[id] = 1;
	}
	depths = found;
	return found;
}

export function ruleDepth(rule: Rule): number {
	return ruleDepths().get(rule.id) ?? UNREACHABLE_DEPTH;
}

// How likely a try at this rule is to take hold, relative to a first-step one
export function depthFactor(rule: Rule): number {
	const d = ruleDepth(rule);
	return DEPTH_FACTOR[Math.min(d, DEPTH_FACTOR.length) - 1];
}
