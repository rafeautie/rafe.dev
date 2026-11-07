// Plays a world headlessly and reports when milestones happened, for tuning
// the pace. Used by pace.test.ts (skipped unless asked for).

import { TICKS_PER_YEAR } from '../config';
import { isAlive } from '../people/village';
import { Built } from '../types';
import { step } from './tick';
import { createWorld } from './world';

export // what counts as each milestone: a piece of know-how, or something built
const KNOWLEDGE = [
	'fire-making',
	'knapping',
	'fire-keeping',
	'cooking',
	'pottery',
	'planting',
	'kiln',
	'charcoal',
	'smelting-copper',
	'smelting-tin',
	'bronze',
	'writing'
];
export const MILESTONES = [
	'fire-making',
	'knapping',
	'fire-keeping',
	'cooking',
	'place',
	'pottery',
	'planting',
	'field',
	'store',
	'kiln',
	'charcoal',
	'smelting-copper',
	'smelting-tin',
	'bronze',
	'writing',
	'pop50',
	'split'
] as const;
export const POP_AT = [50, 100, 170, 300];

export type Result = {
	seed: number;
	when: Record<string, number>;
	pop: Record<number, number>;
	peak: number;
	biggest: number;
	villages: number;
	deaths: Record<string, number>;
	seconds: number;
};

export function play(seed: number, years: number): Result {
	const t0 = performance.now();
	const { world, rng } = createWorld(seed);
	const changes = new Set<number>();
	const when: Record<string, number> = {};
	const pop: Record<number, number> = {};
	let peak = 0;
	let biggest = 0;
	const mark = (id: string, year: number) => {
		if (when[id] === undefined) when[id] = year;
	};
	const total = years * TICKS_PER_YEAR;
	for (let t = 0; t < total; t++) {
		step(world, rng, changes);
		changes.clear();
		// look around once a season
		if (world.tick % (TICKS_PER_YEAR / 4) !== 0) continue;
		const year = Math.floor(world.tick / TICKS_PER_YEAR);
		const alive = world.people.filter(isAlive);
		for (const p of alive) for (const k of KNOWLEDGE) if (p.knowledge[k] > 0) mark(k, year);
		const perVillage = new Map<number, number>();
		for (const p of alive) perVillage.set(p.village, (perVillage.get(p.village) ?? 0) + 1);
		const biggestNow = Math.max(0, ...perVillage.values());
		biggest = Math.max(biggest, biggestNow);
		peak = Math.max(peak, alive.length);
		if (biggestNow >= 50) mark('pop50', year);
		if (perVillage.size > 1 && world.villages.length > 1) {
			if (world.chronicle.some((e) => e.kind === 'split')) mark('split', year);
		}
		if (world.chronicle.some((e) => e.kind === 'note' && / (named|called) /.test(e.text))) {
			mark('place', year);
		}
		let fields = 0;
		let stores = 0;
		for (let i = 0; i < world.map.built.length; i++) {
			if (world.map.built[i] === Built.field) fields++;
			else if (world.map.built[i] === Built.store) stores++;
		}
		if (fields >= 3) mark('field', year);
		if (stores >= 1) mark('store', year);
		if (world.tick % TICKS_PER_YEAR === 0) {
			for (const at of POP_AT) if (year === at) pop[at] = alive.length;
		}
	}
	const deaths: Record<string, number> = {};
	for (const p of world.people) {
		if (p.died !== undefined) deaths[p.cause ?? '?'] = (deaths[p.cause ?? '?'] ?? 0) + 1;
	}
	return {
		seed,
		when,
		pop,
		peak,
		biggest,
		villages: world.villages.length,
		deaths,
		seconds: (performance.now() - t0) / 1000
	};
}

export const median = (xs: number[]) => {
	if (!xs.length) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const cell = (v: number | undefined) =>
	v === undefined || Number.isNaN(v) ? '-' : String(v);

// the table: one row a seed, then the median and range, and what people died of
export function report(results: Result[], years: number): string {
	const lines: string[] = [];
	const cols = [...MILESTONES, ...POP_AT.map((a) => `pop@${a}`), 'peak', 'big', 'secs'];
	lines.push(['seed', ...cols].map((c) => c.padStart(9)).join(' '));
	for (const r of results) {
		const row = [
			...MILESTONES.map((m) => r.when[m]),
			...POP_AT.map((a) => r.pop[a]),
			r.peak,
			r.biggest,
			Math.round(r.seconds * 10) / 10
		];
		lines.push([String(r.seed), ...row.map(cell)].map((c) => c.padStart(9)).join(' '));
	}
	const summary = (label: string, f: (xs: number[]) => number) => {
		const row = [
			...MILESTONES.map((m) =>
				f(results.flatMap((r) => (r.when[m] === undefined ? [] : [r.when[m]])))
			),
			...POP_AT.map((a) => f(results.flatMap((r) => (r.pop[a] === undefined ? [] : [r.pop[a]])))),
			f(results.map((r) => r.peak)),
			f(results.map((r) => r.biggest)),
			f(results.map((r) => r.seconds))
		];
		lines.push(
			[label, ...row.map((v) => cell(Number.isNaN(v) ? v : Math.round(v * 10) / 10))]
				.map((c) => c.padStart(9))
				.join(' ')
		);
	};
	summary('median', median);
	summary('min', (xs) => (xs.length ? Math.min(...xs) : NaN));
	summary('max', (xs) => (xs.length ? Math.max(...xs) : NaN));
	const reached = (m: string) => results.filter((r) => r.when[m] !== undefined).length;
	lines.push(
		`reached: ${MILESTONES.map((m) => `${m} ${reached(m)}/${results.length}`).join(', ')}`
	);
	const causes = new Map<string, number>();
	for (const r of results)
		for (const [c, n] of Object.entries(r.deaths)) causes.set(c, (causes.get(c) ?? 0) + n);
	const totalDeaths = [...causes.values()].reduce((a, b) => a + b, 0);
	lines.push(
		`deaths (${years} years, ${results.length} seeds): ` +
			[...causes.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([c, n]) => `${c} ${n} (${Math.round((100 * n) / totalDeaths)}%)`)
				.join(', ')
	);
	lines.push(`total ${results.reduce((a, r) => a + r.seconds, 0).toFixed(1)}s`);
	return lines.join('\n');
}
