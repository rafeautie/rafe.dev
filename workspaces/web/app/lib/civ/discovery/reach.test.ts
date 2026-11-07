import { describe, expect, it } from 'vitest';
import { Deposit, Biome, Ground, Water } from '../types';
import type { KnowledgeId, MaterialId } from '../types';
import { Rng } from '../rng';
import { expandRule, heatAvailable, matchIdea, resolve } from './engine';
import { RULES } from './rules';
import { materialsFromDeposit, materialsFromTile } from './sources';

// A river-valley camp: grassland, forest, wetland and a river, with flint,
// clay, copper and ochre in the ground, and what hunting brings home.
function camp(extra: Deposit[] = []): Set<MaterialId> {
	const have = new Set<MaterialId>();
	const tiles: [Biome, Ground, Water, number][] = [
		[Biome.grassland, Ground.loam, Water.none, 0.1],
		[Biome.forest, Ground.loam, Water.none, 0.8],
		[Biome.wetland, Ground.bog, Water.river, 0.1]
	];
	for (const t of tiles) materialsFromTile(...t).forEach((id) => have.add(id));
	for (const d of [Deposit.flint, Deposit.clay, Deposit.copper, Deposit.ochre, ...extra]) {
		materialsFromDeposit(d).forEach((id) => have.add(id));
	}
	['hide', 'bone', 'sinew', 'raw-meat'].forEach((id) => have.add(id));
	return have;
}

// Walk outward: try every rule on everything in hand (treating stuff as
// plentiful), at the best heat the knowledge so far allows, until nothing new
// turns up.
function reach(start: Set<MaterialId>) {
	const have = new Set(start);
	const knowledge: Record<KnowledgeId, number> = {};
	const rules = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		const heat = heatAvailable(knowledge, {
			wood: have.has('wood'),
			charcoal: have.has('charcoal')
		});
		for (const rule of RULES) {
			for (const items of expandRule(rule, have, 64)) {
				const out = resolve({ action: rule.action, items, heat, skill: 1 }, new Rng(1));
				if (out.result !== 'success') continue;
				if (out.rule) rules.add(out.rule);
				for (const p of out.produces) {
					if (have.has(p.material)) continue;
					have.add(p.material);
					changed = true;
				}
				if (out.learns && !knowledge[out.learns]) {
					knowledge[out.learns] = 1;
					changed = true;
				}
			}
		}
	}
	return {
		have,
		knowledge,
		heat: heatAvailable(knowledge, { wood: true, charcoal: have.has('charcoal') }),
		rules
	};
}

describe('reachability', () => {
	const base = reach(camp());

	it('a river camp reaches pottery, a kiln and copper', () => {
		expect(base.have.has('pot')).toBe(true);
		expect(base.knowledge['pottery']).toBeTruthy();
		expect(base.knowledge['kiln']).toBeTruthy();
		expect(base.have.has('copper')).toBe(true);
		expect(base.have.has('copper-axe')).toBe(true);
		expect(base.have.has('tablet')).toBe(true);
		expect(base.have.has('bread')).toBe(true);
		expect(base.have.has('field')).toBe(true);
	});

	it('without tin there is no bronze, and without bog iron no iron', () => {
		expect(base.have.has('bronze')).toBe(false);
		expect(base.have.has('wrought-iron')).toBe(false);
	});

	it('adding tin ore reaches bronze', () => {
		const withTin = reach(camp([Deposit.tin]));
		expect(withTin.have.has('bronze')).toBe(true);
		expect(withTin.have.has('bronze-axe')).toBe(true);
		expect(withTin.knowledge['bronze']).toBeTruthy();
	});

	it('adding bog iron reaches a furnace and wrought iron', () => {
		const withIron = reach(camp([Deposit.tin, Deposit.bogIron]));
		expect(withIron.knowledge['furnace']).toBeTruthy();
		expect(withIron.heat).toBe(1500);
		expect(withIron.have.has('wrought-iron')).toBe(true);
	});

	it('sky iron needs no fire at all', () => {
		const out = reach(camp([Deposit.meteorite]));
		expect(out.have.has('iron-blade')).toBe(true);
	});

	it('every rule can be triggered by some combination of everything', () => {
		const all = new Set(camp([Deposit.tin, Deposit.bogIron, Deposit.salt]));
		['kid', 'pup', 'calf', 'meteorite-iron'].forEach((id) => all.add(id));
		const full = reach(all);
		const missed = RULES.filter((r) => !full.rules.has(r.id)).map((r) => r.id);
		expect(missed).toEqual([]);
	});

	it('every rule is reachable by its own inputs (none is shadowed)', () => {
		const pool = [
			...reach(
				new Set([...camp([Deposit.tin, Deposit.bogIron]), 'kid', 'pup', 'calf', 'meteorite-iron'])
			).have
		];
		for (const rule of RULES) {
			const hits = expandRule(rule, pool, 400).filter(
				(items) => matchIdea(rule.action, items)?.id === rule.id
			);
			expect(hits.length, rule.id).toBeGreaterThan(0);
		}
	});
});
