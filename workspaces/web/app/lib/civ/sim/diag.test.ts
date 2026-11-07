import { describe, it } from 'vitest';
import { TICKS_PER_YEAR } from '../config';
import { ageOf, isAlive } from '../people/village';
import { step } from './tick';
import { createWorld } from './world';

const env = import.meta.env as Record<string, string | undefined>;
describe.skipIf(!env.VITE_DIAG)('diag', () => {
	it('prints', () => {
		const out: string[] = [];
		for (const seed of (env.VITE_DIAG ?? '1').split(',').map(Number)) {
			const { world, rng } = createWorld(seed);
			const changes = new Set<number>();
			const years = Number(env.VITE_DIAG_YEARS ?? 100);
			const pops: number[] = [];
			for (let t = 0; t < years * TICKS_PER_YEAR; t++) {
				step(world, rng, changes);
				changes.clear();
				if (world.tick % (TICKS_PER_YEAR * 10) === 0)
					pops.push(world.people.filter(isAlive).length);
			}
			const bands: Record<string, Record<string, number>> = {};
			for (const p of world.people) {
				if (p.died === undefined) continue;
				const age = (p.died - p.born) / 48;
				const band = age < 5 ? '0-4' : age < 15 ? '5-14' : age < 45 ? '15-44' : '45+';
				bands[band] ??= {};
				bands[band][p.cause ?? '?'] = (bands[band][p.cause ?? '?'] ?? 0) + 1;
			}
			const births = world.chronicle.filter((e) => e.kind === 'birth').length;
			const alive = world.people.filter(isAlive);
			const fertile = alive.filter(
				(p) =>
					p.sex === 'f' && p.partner !== undefined && ageOf(world, p) >= 16 && ageOf(world, p) <= 40
			).length;
			const food = world.villages.map((v) =>
				v.store
					.filter((s) => s.count > 0)
					.map((s) => `${s.material}:${s.count}`)
					.join(' ')
			);
			const avg = (f: (p: (typeof alive)[number]) => number) =>
				(alive.reduce((a, p) => a + f(p), 0) / Math.max(1, alive.length)).toFixed(2);
			out.push(`seed ${seed}: pops/10y ${pops.join(',')} births ${births} fertile-now ${fertile}`);
			out.push(`  deaths ${JSON.stringify(bands)}`);
			out.push(
				`  avg food ${avg((p) => p.needs.food)} water ${avg((p) => p.needs.water)} warmth ${avg((p) => p.needs.warmth)} health ${avg((p) => p.health)}`
			);
			out.push(`  store ${food.join(' | ').slice(0, 300)}`);
			out.push(`  know ${[...new Set(alive.flatMap((p) => Object.keys(p.knowledge)))].join(',')}`);
		}
		console.log('\n' + out.join('\n'));
	}, 600000);
});
