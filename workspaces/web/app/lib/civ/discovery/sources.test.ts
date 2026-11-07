import { describe, expect, it } from 'vitest';
import { Biome, Deposit, Ground, Water } from '../types';
import { MATERIALS } from './materials';
import { foodValue, isFood, isPoisonous, materialsFromDeposit, materialsFromTile } from './sources';

describe('sources', () => {
	it('yields only known materials', () => {
		for (const d of Object.values(Deposit)) {
			for (const id of materialsFromDeposit(d)) expect(MATERIALS[id], id).toBeTruthy();
		}
		for (const b of Object.values(Biome)) {
			for (const g of Object.values(Ground)) {
				for (const w of Object.values(Water)) {
					for (const id of materialsFromTile(b, g, w, 0.5)) expect(MATERIALS[id], id).toBeTruthy();
				}
			}
		}
	});

	it('gives each place its own things', () => {
		const forest = materialsFromTile(Biome.forest, Ground.loam, Water.none, 0.9);
		expect(forest).toEqual(expect.arrayContaining(['wood', 'branch', 'bark', 'nuts', 'berries']));
		const grass = materialsFromTile(Biome.grassland, Ground.loam, Water.none, 0);
		expect(grass).toEqual(expect.arrayContaining(['wild-grain', 'grass', 'roots']));
		expect(grass).not.toContain('wood');
		const fen = materialsFromTile(Biome.wetland, Ground.bog, Water.none, 0);
		expect(fen).toEqual(expect.arrayContaining(['reed', 'flax']));
		const river = materialsFromTile(Biome.grassland, Ground.sand, Water.river, 0);
		expect(river).toEqual(expect.arrayContaining(['river-stone', 'clay', 'fish', 'water']));
		expect(materialsFromDeposit(Deposit.none)).toEqual([]);
		expect(materialsFromDeposit(Deposit.tin)).toEqual(['tin-ore']);
	});

	it('knows food from poison', () => {
		expect(isFood('cooked-meat')).toBe(true);
		expect(foodValue('cooked-meat')).toBeGreaterThan(foodValue('raw-meat'));
		expect(isFood('flint')).toBe(false);
		expect(isFood('mushroom')).toBe(false);
		expect(isPoisonous('mushroom')).toBe(true);
		expect(foodValue('nope')).toBe(0);
	});
});
