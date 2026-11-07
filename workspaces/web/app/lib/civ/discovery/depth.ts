// How far each technique sits from what a camp can simply pick up, and how
// much slower that makes it to stumble on. Depth is worked out from the rules
// themselves, so adding a rule needs no table entry: it is as deep as the
// things it needs.

import { Biome, Deposit, Ground, Water } from '../types';
import type { KnowledgeId, MaterialId } from '../types';
import { Rng } from '../rng';
import { expandRule, heatAvailable, requiredHeat, resolve } from './engine';
import { RULES, type Rule } from './rules';
import { materialsFromDeposit, materialsFromTile } from './sources';

// ---- tuning knobs
// Chance multiplier for a flash of insight toward a technique, by depth (1 is
// something a camp can try with what it picks up; each step needs the one
// before). Early things come quickly; later ones take generations. Anything
// deeper than the table uses its last entry.
export const DEPTH_FACTOR = [1, 0.8, 0.14, 0.14, 0.14, 0.14, 0.08, 0.05, 0.03, 0.02];
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

type Depths = {
	// the first round each rule could succeed in
	rules: Map<string, number>;
	// the round each material was first made in (0 for what a camp finds)
	materials: Map<MaterialId, number>;
	// the hottest fire there is at the start of each round (index = round)
	heats: number[];
};

let cached: Depths | undefined;

// Breadth-first from the start: round one is every rule a camp could try with
// what it has; each later round adds what the rounds before made or taught.
function compute(): Depths {
	const rules = new Map<string, number>();
	const have = startingMaterials();
	const materials = new Map<MaterialId, number>([...have].map((id) => [id, 0]));
	const heats = [0];
	const knowledge: Record<KnowledgeId, number> = {};
	const rng = new Rng(1);
	for (let round = 1; round <= 24; round++) {
		const heat = heatAvailable(knowledge, {
			wood: have.has('wood'),
			charcoal: have.has('charcoal')
		});
		heats[round] = heat;
		const gained: MaterialId[] = [];
		const learned: KnowledgeId[] = [];
		for (const rule of RULES) {
			// a rule found earlier can still make new things from new materials
			for (const items of expandRule(rule, have, 64)) {
				// perfect skill: only what the materials and the fire allow
				const out = resolve({ action: rule.action, items, heat, skill: 1 }, rng);
				if (out.result !== 'success' || out.rule !== rule.id) continue;
				if (!rules.has(rule.id)) rules.set(rule.id, round);
				for (const p of out.produces) gained.push(p.material);
				if (out.learns) learned.push(out.learns);
			}
		}
		// things made this round only count from the next
		if (gained.length === 0 && learned.length === 0) break;
		for (const id of gained) {
			if (!have.has(id)) materials.set(id, round);
			have.add(id);
		}
		for (const id of learned) knowledge[id] = 1;
	}
	return { rules, materials, heats };
}

function depths(): Depths {
	return (cached ??= compute());
}

export function ruleDepths(): Map<string, number> {
	return depths().rules;
}

// How many discovery steps this particular try sits from the start: the round
// by which every thing it uses, and a fire hot enough, could be there.
export function ideaDepth(rule: Rule, items: MaterialId[]): number {
	const { materials, heats } = depths();
	let round = 1;
	for (const id of items) {
		const made = materials.get(id);
		if (made === undefined) return UNREACHABLE_DEPTH;
		round = Math.max(round, made + 1);
	}
	const need = requiredHeat(rule, items);
	if (need > 0) {
		const ready = heats.findIndex((h, r) => r > 0 && h >= need);
		if (ready < 0) return UNREACHABLE_DEPTH;
		round = Math.max(round, ready);
	}
	return round;
}

// How likely a try is to take hold, relative to a first-step one
export function depthFactor(rule: Rule, items: MaterialId[]): number {
	const d = Math.min(ideaDepth(rule, items), UNREACHABLE_DEPTH);
	return DEPTH_FACTOR[d - 1];
}
