// Decides what an attempt does. Given an action, the materials in hand, the
// heat available and the maker's skill, it finds the best matching rule and
// rolls for success. No rule means `nothing`; a rule that is missing heat, a
// needed thing or the skill roll means `fail`, with a plain reason.

import type { KnowledgeId, MaterialId, Stack } from '../types';
import type { Rng } from '../rng';
import { isAction } from './actions';
import {
	MATERIALS,
	describeSelector,
	isMaterial,
	matchesSelector,
	parseSelector
} from './materials';
import { RULES, type Rule } from './rules';

export type Attempt = {
	action: string;
	items: MaterialId[];
	// hottest fire on hand, °C; 0 for none
	heat: number;
	// 0..1 mastery of the related knowledge, 0 if new
	skill: number;
};

export type Outcome = {
	result: 'success' | 'fail' | 'nothing';
	rule?: string;
	produces: Stack[];
	consumes: Stack[];
	learns?: KnowledgeId;
	// a new heat source learned, °C
	heat?: number;
	reason: string;
};

// ------------------------------------------------------------- heat ladder

// Each way of making things hotter is itself a thing to discover. A rung
// counts once its knowledge is known and the fuel for it is to hand.
export const HEAT_LADDER: { knowledge: KnowledgeId; heat: number; fuel: 'any' | 'charcoal' }[] = [
	{ knowledge: 'fire-making', heat: 600, fuel: 'any' },
	{ knowledge: 'pit-fire', heat: 800, fuel: 'any' },
	{ knowledge: 'charcoal', heat: 900, fuel: 'charcoal' },
	{ knowledge: 'kiln', heat: 1100, fuel: 'any' },
	{ knowledge: 'blowpipe', heat: 1300, fuel: 'any' },
	{ knowledge: 'bellows', heat: 1300, fuel: 'any' },
	{ knowledge: 'furnace', heat: 1500, fuel: 'charcoal' }
];

export function heatAvailable(
	knowledge: Record<KnowledgeId, number>,
	hasFuel: { wood: boolean; charcoal: boolean }
): number {
	let best = 0;
	for (const rung of HEAT_LADDER) {
		if (!((knowledge[rung.knowledge] ?? 0) > 0)) continue;
		const fuelOk = rung.fuel === 'charcoal' ? hasFuel.charcoal : hasFuel.wood || hasFuel.charcoal;
		if (fuelOk && rung.heat > best) best = rung.heat;
	}
	return best;
}

// ---------------------------------------------------------------- matching

type Slot = { sel: string; keep: boolean; need: boolean };

const slotCache = new Map<Rule, Slot[]>();

function slotsOf(rule: Rule): Slot[] {
	let slots = slotCache.get(rule);
	if (!slots) {
		slots = [
			...rule.inputs.map((sel) => ({ sel, keep: parseSelector(sel).keep, need: false })),
			...rule.needs.map((sel) => ({ sel, keep: parseSelector(sel).keep, need: true }))
		];
		slotCache.set(rule, slots);
	}
	return slots;
}

// exact ids count for more than properties, so the specific rule wins
function specificity(rule: Rule): number {
	let score = 0;
	for (const slot of slotsOf(rule)) {
		score += parseSelector(slot.sel).alts.every((a) => !a.startsWith('#')) ? 2 : 1;
	}
	return score;
}

type Match = {
	rule: Rule;
	// slot index -> item index, -1 where a need is missing
	used: number[];
	missing: number;
	score: number;
	order: number;
};

// Every item must land in its own slot, every input slot must be filled, and
// need slots may stay empty (that is a "missing" and fails later).
function assign(rule: Rule, items: MaterialId[]): { used: number[]; missing: number } | undefined {
	const slots = slotsOf(rule);
	if (items.length > slots.length) return undefined;
	const used = new Array<number>(slots.length).fill(-1);
	let best: { used: number[]; missing: number } | undefined;
	const walk = (i: number) => {
		if (best?.missing === 0) return;
		if (i === items.length) {
			let missing = 0;
			for (let j = 0; j < slots.length; j++) {
				if (used[j] >= 0) continue;
				if (!slots[j].need) return;
				missing++;
			}
			if (!best || missing < best.missing) best = { used: [...used], missing };
			return;
		}
		for (let j = 0; j < slots.length; j++) {
			if (used[j] >= 0 || !matchesSelector(items[i], slots[j].sel)) continue;
			used[j] = i;
			walk(i + 1);
			used[j] = -1;
		}
	};
	walk(0);
	return best;
}

const byAction = new Map<string, { rule: Rule; order: number }[]>();
RULES.forEach((rule, order) => {
	const list = byAction.get(rule.action) ?? [];
	list.push({ rule, order });
	byAction.set(rule.action, list);
});

function findMatch(action: string, items: MaterialId[]): Match | undefined {
	if (!isAction(action) || items.length === 0 || items.length > 6) return undefined;
	if (!items.every((id) => typeof id === 'string' && isMaterial(id))) return undefined;
	let best: Match | undefined;
	for (const { rule, order } of byAction.get(action) ?? []) {
		const found = assign(rule, items);
		if (!found) continue;
		const candidate: Match = { rule, ...found, score: specificity(rule), order };
		if (
			!best ||
			candidate.missing < best.missing ||
			(candidate.missing === best.missing && candidate.score > best.score)
		) {
			best = candidate;
		}
	}
	return best;
}

// Maps an idea (say, from the model) onto the rule it would trigger, if any
export function matchIdea(action: string, items: MaterialId[]): Rule | undefined {
	return findMatch(action, items)?.rule;
}

// The least heat this rule needs for these particular items, °C
export function requiredHeat(rule: Rule, items: MaterialId[]): number {
	if (rule.byProperty) {
		let most = 0;
		for (const id of items) most = Math.max(most, MATERIALS[id]?.[rule.byProperty] ?? 0);
		return most;
	}
	return rule.minHeat;
}

// ---------------------------------------------------------------- resolving

function add(list: Stack[], material: MaterialId, count: number) {
	const have = list.find((s) => s.material === material);
	if (have) have.count += count;
	else list.push({ material, count });
}

// Chance of getting it right: a first try on a hard thing often fails, and
// practice closes the gap until mastery makes it certain.
function successChance(difficulty: number, skill: number): number {
	const s = Math.min(1, Math.max(0, Number.isFinite(skill) ? skill : 0));
	const base = Math.min(0.9, Math.max(0.05, (1 - difficulty) * 0.7));
	return s >= 1 ? 1 : base + (1 - base) * s;
}

const NOTHING: Outcome = { result: 'nothing', produces: [], consumes: [], reason: '' };

export function resolve(attempt: Attempt, rng: Rng): Outcome {
	const match = findMatch(attempt.action, attempt.items);
	if (!match) {
		const known = isAction(attempt.action);
		return {
			...NOTHING,
			reason: known ? 'nothing came of it' : 'nobody knows how to do that'
		};
	}
	const { rule, used } = match;
	const slots = slotsOf(rule);
	const fail = (reason: string, consumes: Stack[] = []): Outcome => ({
		result: 'fail',
		rule: rule.id,
		produces: [],
		consumes,
		reason
	});

	if (match.missing > 0) {
		const lacking = slots
			.filter((s, j) => s.need && used[j] < 0)
			.map((s) => describeSelector(s.sel));
		return fail(`it needed ${lacking.join(' and ')}`);
	}

	const required = requiredHeat(rule, attempt.items);
	if (attempt.heat < required) {
		return fail(attempt.heat <= 0 ? 'there was no fire' : 'the fire was not hot enough');
	}

	// what the material itself says, for rules over properties
	let outputs = rule.outputs;
	let knowledge = rule.knowledge;
	if (rule.byProperty) {
		const source = MATERIALS[attempt.items[used[0]]];
		outputs = source.yields ? [{ material: source.yields, count: source.yieldN ?? 1 }] : [];
		knowledge = knowledge ?? source.teaches;
	}

	const consumes: Stack[] = [];
	slots.forEach((slot, j) => {
		if (used[j] >= 0 && !slot.keep) add(consumes, attempt.items[used[j]], 1);
	});

	// wet clay is the riskier thing to put in a fire
	let difficulty = rule.difficulty;
	if (rule.byProperty === 'firesAt') {
		for (const id of attempt.items) if (MATERIALS[id].tags?.includes('wet')) difficulty += 0.15;
	}

	if (!rng.chance(successChance(difficulty, attempt.skill))) {
		return fail(rule.failText ?? 'it did not come out right', rule.ruins ? consumes : []);
	}

	const produces: Stack[] = [];
	for (const out of outputs) add(produces, out.material, out.count);
	return {
		result: 'success',
		rule: rule.id,
		produces,
		consumes,
		learns: knowledge,
		heat: rule.heat,
		reason: rule.text
	};
}

// ------------------------------------------------------------- enumerating

// Every way the pool of materials could fill a rule's slots (tools included),
// deduplicated and capped. Used to build ideas and to walk what is reachable.
export function expandRule(rule: Rule, pool: Iterable<MaterialId>, limit = 48): MaterialId[][] {
	const have = [...new Set(pool)].filter(isMaterial);
	const choices = slotsOf(rule).map((slot) => have.filter((id) => matchesSelector(id, slot.sel)));
	if (choices.some((c) => c.length === 0)) return [];
	const seen = new Set<string>();
	const out: MaterialId[][] = [];
	const walk = (i: number, picked: MaterialId[]) => {
		if (out.length >= limit) return;
		if (i === choices.length) {
			const key = [...picked].sort().join(',');
			if (!seen.has(key)) {
				seen.add(key);
				out.push(picked);
			}
			return;
		}
		for (const id of choices[i]) walk(i + 1, [...picked, id]);
	};
	walk(0, []);
	return out;
}
