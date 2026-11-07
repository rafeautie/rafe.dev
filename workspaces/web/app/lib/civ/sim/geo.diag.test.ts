// Diagnostics for the metals chain, skipped unless asked for:
//   VITE_GEO=1 pnpm exec vitest run --project worker app/lib/civ/sim/geo --disableConsoleIntercept
// Prints how far each deposit is from the start; with VITE_GEO_PLAY=1,2,3 also plays those
// seeds and prints the year the pieces of the copper chain first showed up.
import { describe, it } from 'vitest';
import { TICKS_PER_YEAR } from '../config';
import { Deposit } from '../types';
import { countOf, indexOf, isAlive } from '../people/village';
import { step } from './tick';
import { createWorld } from './world';

const env = import.meta.env as Record<string, string | undefined>;
describe.skipIf(!env.VITE_GEO)('geo', () => {
	it('prints', () => {
		const out: string[] = [];
		for (let seed = 1; seed <= 8; seed++) {
			const { world } = createWorld(seed);
			const v = world.villages[0];
			const { map } = world;
			const near = (kind: number) => {
				let best = Infinity;
				for (let i = 0; i < map.size * map.size; i++)
					if (map.deposit[i] === kind && map.depositLeft[i] > 0)
						best = Math.min(best, Math.hypot((i % map.size) - v.x, Math.floor(i / map.size) - v.y));
				return Math.round(best);
			};
			const idx = indexOf(world, v);
			out.push(
				`seed ${seed} start ${Math.round(v.x)},${Math.round(v.y)} copper ${near(Deposit.copper)} tin ${near(Deposit.tin)} clay ${near(Deposit.clay)} flint ${near(Deposit.flint)} bogiron ${near(Deposit.bogIron)} | indexed copper-ore ${idx.materials.get('copper-ore')?.length ?? 0} clay ${idx.materials.get('clay')?.length ?? 0} wood ${idx.materials.get('wood')?.length ?? 0}`
			);
		}
		console.log('\n' + out.join('\n'));
	});

	it.skipIf(!env.VITE_GEO_PLAY)(
		'plays the copper chain',
		() => {
			const out: string[] = [];
			const years = Number(env.VITE_GEO_YEARS ?? 300);
			for (const seed of (env.VITE_GEO_PLAY ?? '1').split(',').map(Number)) {
				const { world, rng } = createWorld(seed);
				const changes = new Set<number>();
				const first: Record<string, number> = {};
				const mark = (k: string, y: number) => (first[k] ??= y);
				for (let t = 0; t < years * TICKS_PER_YEAR; t++) {
					step(world, rng, changes);
					changes.clear();
					if (world.tick % (TICKS_PER_YEAR / 4) !== 0) continue;
					const y = Math.floor(world.tick / TICKS_PER_YEAR);
					const alive = world.people.filter(isAlive);
					for (const k of [
						'kiln',
						'charcoal',
						'pit-fire',
						'smelting-copper',
						'bellows',
						'blowpipe'
					])
						if (alive.some((p) => p.knowledge[k] > 0)) mark(k, y);
					for (const v of world.villages) {
						for (const m of [
							'copper-ore',
							'native-copper',
							'charcoal',
							'tin-ore',
							'copper',
							'clay'
						])
							if (countOf(v.store, m) > 0) mark('store:' + m, y);
						if (v.heat >= 1100) mark('heat1100', y);
					}
					for (const p of alive)
						for (const m of ['copper-ore', 'charcoal'])
							if (countOf(p.carrying, m) > 0) mark('carry:' + m, y);
				}
				out.push(`seed ${seed}: ${JSON.stringify(first)}`);
			}
			console.log('\n' + out.join('\n'));
		},
		20 * 60 * 1000
	);
});
