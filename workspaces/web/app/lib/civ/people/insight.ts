// Flashes of insight: once a day an adult might get an idea for something to
// try with the things around them. How the idea is picked is one seam,
// `decideIdea`; for now it is a weighted pick, later a language model.

import { ADULT_AGE } from '../config';
import { heatAvailable, matchIdea } from '../discovery/engine';
import { insightChance, ideaOptions, newToThem, type Idea } from '../discovery/ideas';
import type { Rng } from '../rng';
import type { Person, Village, World } from '../types';
import { startActivity } from './act';
import {
	ageOf,
	clamp01,
	countOf,
	indexOf,
	materialsAround,
	mergedKnowledge,
	structuresAt,
	type Index
} from './village';

// ---- tuning knobs
// scales the discovery engine's own daily chance; raise it to speed up discovery
export const INSIGHT_BOOST = 0.26;
// ticks a person will keep at an experiment before giving up
export const CRAFT_PATIENCE = 16;
// how many ideas a flash of insight offers
export const IDEA_COUNT = 6;
// how much more a try that does something is liked than random tinkering
const PROMISING_WEIGHT = 3;
const NEW_KNOWLEDGE_WEIGHT = 1.5;
// seen counts that make a material feel familiar
const FAMILIAR = 12;

// -------------------------------------------------------------- the seam

// Pick one of the offered ideas, or none. The rules-only version weighs
// them; a model could read the person's goal and memories and choose instead.
export function decideIdea(
	_world: World,
	person: Person,
	options: Idea[],
	rng: Rng
): Idea | undefined {
	return rng.weighted(options, (idea) => {
		const rule = matchIdea(idea.action, idea.items);
		if (!rule) return 1;
		const fresh = rule.knowledge && !(person.knowledge[rule.knowledge] > 0);
		return PROMISING_WEIGHT * (fresh ? NEW_KNOWLEDGE_WEIGHT : 1);
	});
}

// ----------------------------------------------------------- the village

// The hottest fire the village can make from what its people know
export function updateVillageHeat(world: World, v: Village) {
	const index = indexOf(world, v);
	const wood =
		countOf(v.store, 'wood') + countOf(v.store, 'branch') > 0 ||
		(index.materials.get('wood')?.length ?? 0) > 0;
	const charcoal = countOf(v.store, 'charcoal') > 0;
	v.heat = heatAvailable(mergedKnowledge(world, v), { wood, charcoal });
}

// ------------------------------------------------------------- insight

function obtainable(
	person: Person,
	v: Village,
	index: Index,
	built: Set<string>,
	idea: Idea
): boolean {
	const counts = new Map<string, number>();
	for (const id of idea.items) counts.set(id, (counts.get(id) ?? 0) + 1);
	for (const [id, n] of counts) {
		if (countOf(person.carrying, id) + countOf(v.store, id) >= n) continue;
		if (built.has(id)) continue;
		if ((index.materials.get(id)?.length ?? 0) === 0) return false;
	}
	return true;
}

// Called once a day for each adult. Returns whether an idea took hold.
export function maybeInsight(world: World, rng: Rng, p: Person): boolean {
	const v = world.villages[p.village];
	if (!v || ageOf(world, p) < ADULT_AGE) return false;
	if (p.activity.kind === 'craft') return false;

	// what is around: the land underfoot, the camp store, what is in hand
	const nearby = materialsAround(world.map, p.x, p.y, 4);
	for (const s of p.carrying) nearby.add(s.material);
	for (const s of v.store) nearby.add(s.material);
	const built = structuresAt(world, v);
	for (const id of built) nearby.add(id);
	// handling the same things day after day makes them familiar
	let familiar = 0;
	const counts: number[] = [];
	for (const id of nearby) {
		p.seen[id] = Math.min(60, (p.seen[id] ?? 0) + 1);
		counts.push(p.seen[id]);
	}
	counts.sort((a, b) => b - a);
	for (const c of counts.slice(0, 3)) familiar += c / FAMILIAR / 3;

	const n = p.needs;
	const chance =
		insightChance({
			curiosity: clamp01(p.traits.curious * 0.85 + (1 - n.curiosity) * 0.15),
			exposure: clamp01(familiar),
			spareTime: clamp01(Math.min(n.food, n.water, n.rest, n.warmth) * 1.2 - 0.1) * n.safety,
			related: clamp01(Object.keys(p.knowledge).length / 6),
			pressure: clamp01(1 - Math.min(n.food, n.water, n.warmth))
		}) * INSIGHT_BOOST;
	if (!rng.chance(chance)) return false;

	const index = indexOf(world, v);
	const options = ideaOptions(p, [...nearby], v.heat, rng, IDEA_COUNT).filter((idea) =>
		obtainable(p, v, index, built, idea)
	);
	const idea = decideIdea(world, p, options, rng);
	if (!idea) return false;
	// a technique several steps beyond what camp has is less likely to occur to
	// anyone: the idea fades before it is tried
	const novel = newToThem(p, idea);
	if (novel?.fresh && !rng.chance(novel.factor)) return false;
	startActivity(p, 'craft', v.x, v.y, CRAFT_PATIENCE, { craft: idea });
	return true;
}
