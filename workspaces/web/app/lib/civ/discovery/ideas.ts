// Plausible experiments for a person, and how likely a flash of insight is.
// Used as the rules-only fallback and to build the lists the model chooses from.

import type { KnowledgeId, MaterialId } from '../types';
import type { Rng } from '../rng';
import { ACTION_IDS } from './actions';
import { MATERIALS } from './materials';
import { RULES, type Rule } from './rules';
import { depthFactor } from './depth';
import { expandRule, knowledgeOf, matchIdea, requiredHeat } from './engine';

export type Idea = { action: string; items: MaterialId[] };

function key(idea: Idea): string {
	return `${idea.action}:${[...idea.items].sort().join(',')}`;
}

function shuffle<T>(list: T[], rng: Rng): T[] {
	for (let i = list.length - 1; i > 0; i--) {
		const j = rng.int(0, i);
		[list[i], list[j]] = [list[j], list[i]];
	}
	return list;
}

// Slowing applies to the first time someone hits on a technique; practising
// what they already know is not held back.
export function newToThem(
	person: { knowledge: Record<KnowledgeId, number> },
	idea: Idea
): { rule: Rule; fresh: boolean } | undefined {
	const rule = matchIdea(idea.action, idea.items);
	if (!rule) return undefined;
	const id = knowledgeOf(idea.action, idea.items);
	return { rule, fresh: !id || !(person.knowledge[id] > 0) };
}

export function ideaOptions(
	person: { seen: Record<MaterialId, number>; knowledge: Record<KnowledgeId, number> },
	nearby: MaterialId[],
	heat: number,
	rng: Rng,
	count = 6
): Idea[] {
	const pool = [
		...new Set([...Object.keys(person.seen).filter((id) => person.seen[id] > 0), ...nearby])
	].filter((id) => Object.hasOwn(MATERIALS, id));
	if (pool.length === 0 || count <= 0) return [];

	// ideas that would do something, weighted toward the new and the doable
	const promising: { idea: Idea; weight: number }[] = [];
	for (const rule of RULES) {
		const options = expandRule(rule, pool, 12);
		if (options.length === 0) continue;
		const items = rng.pick(options);
		const shuffled = shuffle([...items], rng);
		const known = rule.knowledge && (person.knowledge[rule.knowledge] ?? 0) > 0;
		let weight = known ? 0.5 : 2;
		// deeper techniques are rarer thoughts
		if (!known) weight *= depthFactor(rule);
		if (requiredHeat(rule, items) > heat) weight *= 0.4;
		promising.push({ idea: { action: rule.action, items: shuffled }, weight });
	}

	// ideas that lead nowhere: random tinkering that no rule answers
	const duds: Idea[] = [];
	const dudKeys = new Set<string>();
	for (let tries = 0; tries < 60 && duds.length < count; tries++) {
		const action = rng.pick(ACTION_IDS);
		const n = rng.int(1, 3);
		const items = Array.from({ length: n }, () => rng.pick(pool));
		const idea = { action, items };
		if (matchIdea(action, items) || dudKeys.has(key(idea))) continue;
		dudKeys.add(key(idea));
		duds.push(idea);
	}

	// never all winners: about a third are duds
	const wantDuds = count > 1 ? Math.min(duds.length, Math.max(1, Math.round(count / 3))) : 0;
	const chosen: Idea[] = duds.slice(0, wantDuds);
	const used = new Set(chosen.map(key));
	while (chosen.length < count) {
		const next = rng.weighted(promising, (p) => (used.has(key(p.idea)) ? 0 : p.weight));
		if (!next) break;
		used.add(key(next.idea));
		chosen.push(next.idea);
	}
	// fill any gap with more duds
	for (const dud of duds) {
		if (chosen.length >= count) break;
		if (!used.has(key(dud))) {
			used.add(key(dud));
			chosen.push(dud);
		}
	}
	return shuffle(chosen, rng);
}

// Per-day chance that someone has a flash of insight. Every factor is 0..1.
// A curious, fed, safe person with a new material to hand lands near 3-4%.
export function insightChance(f: {
	curiosity: number;
	exposure: number;
	spareTime: number;
	related: number;
	pressure: number;
}): number {
	const c = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
	const base = 0.025;
	const p =
		base *
		(0.5 + c(f.curiosity)) *
		(0.3 + 1.4 * c(f.exposure)) *
		(0.2 + 1.2 * c(f.spareTime)) *
		(0.8 + 0.8 * c(f.related)) *
		(0.8 + 0.6 * c(f.pressure));
	return Math.min(0.5, Math.max(0, p));
}
