// Where materials come from: what a tile or a deposit offers to someone
// standing on it. Hunting and animals are handled elsewhere; this is only
// what comes out of the ground, the plants and the water.

import { Biome, Deposit, Ground, Water } from '../types';
import type { MaterialId } from '../types';
import { MATERIALS } from './materials';

export function materialsFromDeposit(d: Deposit): MaterialId[] {
	switch (d) {
		case Deposit.flint:
			return ['flint'];
		case Deposit.clay:
			return ['clay'];
		// native copper turns up beside the ore now and then
		case Deposit.copper:
			return ['copper-ore', 'native-copper'];
		case Deposit.tin:
			return ['tin-ore'];
		case Deposit.bogIron:
			return ['bog-iron'];
		case Deposit.obsidian:
			return ['obsidian'];
		case Deposit.salt:
			return ['salt'];
		case Deposit.ochre:
			return ['ochre'];
		case Deposit.meteorite:
			return ['meteorite-iron'];
		default:
			return [];
	}
}

// `wood` is tree cover, 0..1
export function materialsFromTile(
	biome: Biome,
	ground: Ground,
	water: Water,
	wood: number
): MaterialId[] {
	const out = new Set<MaterialId>();
	const add = (...ids: MaterialId[]) => ids.forEach((id) => out.add(id));

	switch (biome) {
		case Biome.forest:
			add('wood', 'branch', 'bark', 'nuts', 'berries', 'mushroom');
			break;
		case Biome.grassland:
			add('wild-grain', 'grass', 'roots');
			break;
		case Biome.wetland:
			add('reed', 'flax', 'grass');
			break;
		case Biome.scrub:
			add('branch', 'grass', 'berries', 'roots');
			break;
		case Biome.hills:
			add('granite', 'grass', 'berries');
			break;
		case Biome.mountain:
			add('granite');
			break;
		case Biome.coast:
		case Biome.ocean:
			add('fish');
			break;
		default:
			break;
	}

	switch (water) {
		case Water.river:
			add('river-stone', 'clay', 'fish', 'water');
			break;
		case Water.lake:
			add('fish', 'reed', 'water');
			break;
		case Water.sea:
			add('fish', 'water');
			break;
		case Water.spring:
			add('water');
			break;
		default:
			break;
	}

	switch (ground) {
		case Ground.clay:
			add('clay', 'earth');
			break;
		case Ground.loam:
		case Ground.bog:
			add('earth');
			break;
		case Ground.rock:
			add('granite');
			break;
		case Ground.chalk:
			add('chalk', 'earth');
			break;
		default:
			break;
	}

	if (biome !== Biome.ocean) {
		if (wood > 0.2) add('branch');
		if (wood > 0.35) add('wood');
	}
	return [...out];
}

// ---- food helpers

export function foodValue(id: MaterialId): number {
	const m = MATERIALS[id];
	return m && !m.poison ? (m.food ?? 0) : 0;
}

export function isFood(id: MaterialId): boolean {
	return foodValue(id) > 0;
}

export function isPoisonous(id: MaterialId): boolean {
	return !!MATERIALS[id]?.poison;
}

// days before it goes off; undefined if it keeps
export function spoilsInDays(id: MaterialId): number | undefined {
	return MATERIALS[id]?.spoils;
}
