// A headless pace report for tuning, skipped unless asked for. It plays eight
// seeds for 300 years and prints the year each milestone first happened, the
// population at a few ages, and what people died of.
//
//   VITE_PACE=1 pnpm exec vitest run --project worker app/lib/civ/sim/pace
//
// Optional: VITE_PACE_YEARS=300 and VITE_PACE_SEEDS=1,2,3 (workerd has no
// process.env to read, but Vite passes VITE_ variables through import.meta.env).

import { describe, it } from 'vitest';
import { play, report } from './pace';

const env = import.meta.env as Record<string, string | undefined>;
const on = !!env.VITE_PACE;
const YEARS = Number(env.VITE_PACE_YEARS ?? 300);
const SEEDS = (env.VITE_PACE_SEEDS ?? '1,2,3,4,5,6,7,8').split(',').map(Number);

describe.skipIf(!on)('pace report', () => {
	it(
		'prints when things happen',
		async () => {
			const results = SEEDS.map((seed) => play(seed, YEARS));
			console.log('\n' + report(results, YEARS));
		},
		20 * 60 * 1000
	);
});
