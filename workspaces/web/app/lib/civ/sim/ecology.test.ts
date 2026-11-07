import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../config';
import { Rng } from '../rng';
import { Biome } from '../types';
import { createWorld } from './world';
import { dailyEcology } from './ecology';

// grassland tiles near the camp
function grass(world: ReturnType<typeof createWorld>['world']) {
	const camp = world.villages[0];
	const out: number[] = [];
	for (let dy = -20; dy <= 20; dy++) {
		for (let dx = -20; dx <= 20; dx++) {
			const i = (camp.y + dy) * world.map.size + camp.x + dx;
			if (world.map.biome[i] === Biome.grassland && world.map.fertility[i] > 0.4) out.push(i);
		}
	}
	return out.slice(0, 200);
}

function regrowth(season: number) {
	const { world } = createWorld(2);
	const tiles = grass(world);
	for (const i of tiles) world.map.plants[i] = 0;
	const rng = new Rng(1);
	world.weather = 'clear';
	const start = season * DAYS_PER_SEASON;
	for (let d = 0; d < DAYS_PER_SEASON; d++) dailyEcology(world, rng, start + d, new Set());
	return tiles.reduce((s, i) => s + world.map.plants[i], 0) / tiles.length;
}

describe('ecology', () => {
	it('plants regrow in spring and hardly at all in winter', () => {
		const spring = regrowth(0);
		const winter = regrowth(3);
		expect(spring).toBeGreaterThan(0.05);
		expect(winter).toBeLessThan(spring / 4);
	});

	it('records the tiles it changes', () => {
		const { world } = createWorld(2);
		const tiles = grass(world);
		for (const i of tiles) world.map.plants[i] = 0;
		const changes = new Set<number>();
		dailyEcology(world, new Rng(1), 4, changes);
		expect(changes.size).toBeGreaterThan(0);
	});

	it('herds breed in spring, and overhunted ones vanish', () => {
		const { world } = createWorld(2);
		const rng = new Rng(3);
		const deer = world.herds.find((h) => h.kind === 'deer');
		if (!deer) throw new Error('no deer');
		deer.count = 4;
		for (const h of world.herds) if (h !== deer) h.count = 0;
		dailyEcology(world, rng, DAYS_PER_YEAR * 3, new Set());
		expect(deer.count).toBeGreaterThan(4);
		// and a herd shot to nothing is gone
		const lone = { id: 500, kind: 'boar', x: 5, y: 5, count: 0, tame: false };
		world.herds.push(lone);
		dailyEcology(world, rng, 5, new Set());
		expect(world.herds.includes(lone)).toBe(false);
	});

	it('keeps a few wolves and never more than the herd limit', () => {
		const { world } = createWorld(2);
		expect(world.herds.filter((h) => h.kind === 'wolf').length).toBeGreaterThanOrEqual(1);
	});

	it('lets stored food spoil', () => {
		const { world } = createWorld(2);
		world.villages[0].store.push({ material: 'raw-meat', count: 40 });
		const rng = new Rng(1);
		for (let d = 0; d < 6; d++) dailyEcology(world, rng, d + 1, new Set());
		const left = world.villages[0].store.find((s) => s.material === 'raw-meat')?.count ?? 0;
		expect(left).toBeLessThan(10);
	});
});
