// Everything that can be held: found things, foods, and made things. Each has
// a few physical properties, and the rules are written over those properties
// (a hard thing, something that breaks sharp, something that burns) so that
// combinations nobody listed still behave. New content is a new row here.

import type { KnowledgeId, MaterialId } from '../types';

export type MaterialKind =
	| 'stone'
	| 'mineral'
	| 'liquid'
	| 'wood'
	| 'fuel'
	| 'fiber'
	| 'animal'
	| 'food'
	| 'clay'
	| 'ore'
	| 'metal'
	| 'tool'
	| 'structure'
	| 'goods';

export type Material = {
	id: MaterialId;
	name: string;
	kind: MaterialKind;
	hardness: number; // 0..10
	breaksSharp?: boolean; // splits into sharp-edged pieces (flint, obsidian)
	sharp?: boolean; // has a cutting edge as it is
	burns?: boolean;
	burnHeat?: number; // °C of the flame it gives
	meltsAt?: number; // °C
	smeltsAt?: number; // °C; ores only, and only with charcoal in the fire
	firesAt?: number; // °C; shaped clay hardens from here
	// what smelting or firing turns this into, and how many
	yields?: MaterialId;
	yieldN?: number;
	// the know-how a first success with that teaches
	teaches?: KnowledgeId;
	hammersCold?: boolean; // can be beaten into shape without heat
	plasticWet?: boolean; // soft and shapeable while wet (clay)
	fiber?: number; // strength as thread or cord, 0..10
	food?: number; // hunger it fills, 0 = not food
	poison?: boolean;
	spoils?: number; // days until it goes off; none = keeps
	holdsWater?: boolean;
	tags?: string[]; // anything else a rule may ask for
};

type Extra = Omit<Material, 'id' | 'name' | 'kind' | 'hardness'> & { hardness?: number };

function m(id: MaterialId, name: string, kind: MaterialKind, extra: Extra = {}): Material {
	return { id, name, kind, hardness: 0, ...extra };
}

const TABLE: Material[] = [
	// ---- stones and earths
	m('flint', 'flint', 'stone', { hardness: 7, breaksSharp: true }),
	m('obsidian', 'obsidian', 'stone', { hardness: 6, breaksSharp: true }),
	m('river-stone', 'river stone', 'stone', { hardness: 6 }),
	m('granite', 'granite', 'stone', { hardness: 8 }),
	m('ochre', 'ochre', 'mineral', { hardness: 1, tags: ['pigment'] }),
	m('chalk', 'chalk', 'mineral', { hardness: 2 }),
	m('salt', 'salt', 'mineral', { hardness: 1, tags: ['preserves'] }),
	m('earth', 'earth', 'mineral'),
	m('water', 'water', 'liquid'),
	m('clay', 'clay', 'clay', { hardness: 1 }),
	m('wet-clay', 'wet clay', 'clay', { plasticWet: true }),

	// ---- wood, fuel and fibres
	m('wood', 'log', 'wood', { hardness: 4, burns: true, burnHeat: 600 }),
	m('branch', 'branch', 'wood', { hardness: 3, burns: true, burnHeat: 550 }),
	m('charcoal', 'charcoal', 'fuel', { hardness: 2, burns: true, burnHeat: 900 }),
	m('bark', 'bark', 'fiber', { hardness: 1, fiber: 3, burns: true, burnHeat: 450 }),
	m('reed', 'reed', 'fiber', {
		hardness: 1,
		fiber: 2,
		burns: true,
		burnHeat: 400,
		tags: ['hollow']
	}),
	m('grass', 'grass', 'fiber', { fiber: 1, burns: true, burnHeat: 350 }),
	m('dry-grass', 'dry grass', 'fiber', { fiber: 1, burns: true, burnHeat: 400, tags: ['tinder'] }),
	m('flax', 'flax', 'fiber', { fiber: 4, burns: true, burnHeat: 400 }),
	m('retted-flax', 'soaked flax fibre', 'fiber', { fiber: 5 }),
	m('sinew', 'sinew', 'animal', { fiber: 5 }),
	m('thong', 'leather thong', 'fiber', { fiber: 4 }),
	m('cord', 'cord', 'fiber', { fiber: 6 }),
	m('rope', 'rope', 'fiber', { fiber: 8 }),

	// ---- animal parts and live young
	m('hide', 'hide', 'animal', { spoils: 10 }),
	m('dried-hide', 'dried hide', 'animal', { hardness: 2 }),
	m('leather', 'leather', 'animal', { fiber: 2 }),
	m('bone', 'bone', 'animal', { hardness: 4 }),
	m('fat', 'fat', 'animal', { food: 3, burns: true, burnHeat: 500, spoils: 20 }),
	m('kid', 'young goat', 'animal', { tags: ['young-animal'] }),
	m('pup', 'wolf pup', 'animal', { tags: ['young-animal'] }),
	m('calf', 'wild calf', 'animal', { tags: ['young-animal'] }),
	m('tame-goat', 'tame goat', 'animal'),
	m('dog', 'dog', 'animal'),
	m('tame-aurochs', 'tame aurochs', 'animal'),

	// ---- foods
	m('berries', 'berries', 'food', { food: 2, spoils: 4 }),
	m('dried-berries', 'dried berries', 'food', { food: 3 }),
	m('roots', 'roots', 'food', { food: 3, spoils: 10 }),
	m('baked-roots', 'baked roots', 'food', { food: 5, spoils: 4 }),
	m('nuts', 'nuts', 'food', { food: 4, spoils: 60 }),
	m('wild-grain', 'wild grain', 'food', { food: 2 }),
	m('soaked-grain', 'soaked grain', 'food', { food: 3, spoils: 3 }),
	m('flour', 'flour', 'food', { food: 2, spoils: 90 }),
	m('dough', 'dough', 'food', { food: 3, spoils: 2 }),
	m('porridge', 'porridge', 'food', { food: 6, spoils: 3 }),
	m('bread', 'bread', 'food', { food: 8, spoils: 6 }),
	m('raw-meat', 'raw meat', 'food', { food: 5, spoils: 2 }),
	m('cooked-meat', 'cooked meat', 'food', { food: 8, spoils: 4 }),
	m('dried-meat', 'dried meat', 'food', { food: 6, spoils: 90 }),
	m('salted-meat', 'salted meat', 'food', { food: 7, spoils: 120 }),
	m('fish', 'fish', 'food', { food: 4, spoils: 1 }),
	m('cooked-fish', 'cooked fish', 'food', { food: 6, spoils: 3 }),
	m('dried-fish', 'dried fish', 'food', { food: 5, spoils: 60 }),
	m('salted-fish', 'salted fish', 'food', { food: 6, spoils: 90 }),
	m('mushroom', 'pale mushroom', 'food', { food: 3, poison: true, spoils: 3 }),

	// ---- ores and metals
	m('copper-ore', 'copper ore', 'ore', {
		hardness: 3,
		smeltsAt: 1100,
		yields: 'copper',
		yieldN: 2,
		teaches: 'smelting-copper'
	}),
	m('tin-ore', 'tin ore', 'ore', {
		hardness: 4,
		smeltsAt: 900,
		yields: 'tin',
		yieldN: 2,
		teaches: 'smelting-tin'
	}),
	m('bog-iron', 'bog iron', 'ore', {
		hardness: 3,
		smeltsAt: 1200,
		yields: 'iron-bloom',
		yieldN: 1,
		teaches: 'bloomery'
	}),
	m('native-copper', 'native copper', 'metal', { hardness: 3, meltsAt: 1085, hammersCold: true }),
	m('meteorite-iron', 'sky iron', 'metal', { hardness: 7, meltsAt: 1538, hammersCold: true }),
	m('copper', 'copper', 'metal', { hardness: 3, meltsAt: 1085 }),
	m('tin', 'tin', 'metal', { hardness: 2, meltsAt: 232 }),
	m('bronze', 'bronze', 'metal', { hardness: 6, meltsAt: 950 }),
	// spongy and full of slag until it is hammered hot
	m('iron-bloom', 'iron bloom', 'metal', { hardness: 4, meltsAt: 1538, tags: ['spongy'] }),
	m('wrought-iron', 'wrought iron', 'metal', { hardness: 7, meltsAt: 1538 }),

	// ---- made tools
	m('flake', 'stone flake', 'tool', { hardness: 6, sharp: true }),
	m('scraper', 'scraper', 'tool', { hardness: 6, sharp: true }),
	m('hand-axe', 'hand axe', 'tool', { hardness: 7, sharp: true }),
	m('stone-axe', 'stone axe', 'tool', { hardness: 7, sharp: true }),
	m('knife', 'knife', 'tool', { hardness: 6, sharp: true }),
	m('awl', 'bone awl', 'tool', { hardness: 4, sharp: true }),
	m('spear', 'spear', 'tool', { hardness: 5 }),
	m('digging-stick', 'digging stick', 'tool', { hardness: 4, burns: true, burnHeat: 550 }),
	m('copper-blade', 'copper blade', 'tool', { hardness: 4, sharp: true }),
	m('iron-blade', 'iron blade', 'tool', { hardness: 8, sharp: true }),
	m('copper-axe', 'copper axe', 'tool', { hardness: 5, sharp: true }),
	m('bronze-axe', 'bronze axe', 'tool', { hardness: 7, sharp: true }),
	m('bellows', 'bellows', 'tool'),

	// ---- made goods
	m('ochre-powder', 'ochre powder', 'goods', { tags: ['pigment'] }),
	m('paint', 'red paint', 'goods'),
	m('tally-bone', 'tally bone', 'goods', { hardness: 4 }),
	m('net', 'net', 'goods', { fiber: 3 }),
	m('basket', 'basket', 'goods', { hardness: 1 }),
	m('mat', 'woven mat', 'goods'),
	m('clothing', 'clothing', 'goods'),
	m('wet-pot', 'wet clay pot', 'clay', {
		firesAt: 600,
		yields: 'pot',
		teaches: 'pottery',
		tags: ['wet']
	}),
	m('dried-pot', 'dried clay pot', 'clay', {
		hardness: 1,
		firesAt: 600,
		yields: 'pot',
		teaches: 'pottery'
	}),
	m('pot', 'fired pot', 'clay', { hardness: 4, holdsWater: true }),
	m('wet-brick', 'wet brick', 'clay', {
		firesAt: 600,
		yields: 'brick',
		yieldN: 1,
		teaches: 'brick-firing',
		tags: ['wet']
	}),
	m('brick', 'fired brick', 'clay', { hardness: 5 }),
	m('wet-mould', 'wet clay mould', 'clay', {
		firesAt: 600,
		yields: 'mould',
		teaches: 'moulds',
		tags: ['wet']
	}),
	m('mould', 'fired mould', 'clay', { hardness: 4 }),
	// tablets are fired hard in a kiln, so they keep for good
	m('wet-tablet', 'marked wet tablet', 'clay', {
		firesAt: 1100,
		yields: 'tablet',
		teaches: 'writing',
		tags: ['wet']
	}),
	m('tablet', 'fired tablet', 'clay', { hardness: 4 }),

	// ---- made structures
	m('pit', 'pit', 'structure'),
	m('hearth', 'stone hearth', 'structure'),
	m('lean-to', 'lean-to', 'structure'),
	m('kiln', 'kiln', 'structure'),
	m('furnace', 'furnace', 'structure'),
	m('fence', 'fence', 'structure'),
	m('field', 'sown field', 'structure'),
	m('seed-store', 'seed store', 'structure')
];

export const MATERIALS: Record<MaterialId, Material> = Object.fromEntries(
	TABLE.map((material) => [material.id, material])
);

export function isMaterial(id: string): boolean {
	return Object.hasOwn(MATERIALS, id);
}

// Names a rule can ask for with `#name`, worked out from properties so that a
// new material qualifies without anyone listing it
export function hasTag(material: Material, tag: string): boolean {
	switch (tag) {
		case 'hard':
			return material.hardness >= 5;
		case 'sharpbreak':
			return !!material.breaksSharp;
		case 'sharp':
			return !!material.sharp;
		case 'ore':
			return material.smeltsAt !== undefined;
		case 'unfired':
			return material.firesAt !== undefined;
		case 'metal':
			return material.kind === 'metal';
		case 'fiber':
			return (material.fiber ?? 0) > 0;
		case 'strongfiber':
			return (material.fiber ?? 0) >= 3;
		case 'fuel':
			return !!material.burns;
		case 'food':
			return (material.food ?? 0) > 0 && !material.poison;
		case 'holdswater':
			return !!material.holdsWater;
		default:
			return material.tags?.includes(tag) ?? false;
	}
}

// ---- selectors: how rules name what they need.
// `flint` an exact material, `#hard` anything with that property, `a|b` either,
// and a leading `~` marks a tool that is used but not used up.

export type Selector = { keep: boolean; alts: string[] };

const parsed = new Map<string, Selector>();

export function parseSelector(sel: string): Selector {
	let result = parsed.get(sel);
	if (!result) {
		const keep = sel.startsWith('~');
		result = { keep, alts: (keep ? sel.slice(1) : sel).split('|') };
		parsed.set(sel, result);
	}
	return result;
}

export function matchesSelector(id: MaterialId, sel: string): boolean {
	const material = MATERIALS[id];
	if (!material || !isMaterial(id)) return false;
	return parseSelector(sel).alts.some((alt) =>
		alt.startsWith('#') ? hasTag(material, alt.slice(1)) : alt === id
	);
}

const TAG_WORDS: Record<string, string> = {
	hard: 'a hard stone',
	sharpbreak: 'stone that breaks sharp',
	sharp: 'something sharp',
	ore: 'ore',
	unfired: 'shaped clay',
	metal: 'metal',
	fiber: 'fibre',
	strongfiber: 'strong fibre',
	fuel: 'fuel',
	food: 'food',
	holdswater: 'a pot that holds water'
};

// plain words for a selector, for "it needed ..." messages
export function describeSelector(sel: string): string {
	return parseSelector(sel)
		.alts.map((alt) =>
			alt.startsWith('#')
				? (TAG_WORDS[alt.slice(1)] ?? alt.slice(1))
				: (MATERIALS[alt]?.name ?? alt)
		)
		.join(' or ');
}
