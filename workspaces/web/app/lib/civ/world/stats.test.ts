import { it } from 'vitest';
import { generateWorld, findStart } from './generate';
import { Biome, Deposit, Water, Ground } from '../types';

it('stats', () => {
	const lines: string[] = [];
	for (const seed of [1, 2, 3, 77]) {
		const t0 = performance.now();
		const m = generateWorld(seed);
		const ms = performance.now() - t0;
		const n = m.size * m.size;
		const c = (arr: Uint8Array, v: number) => { let k = 0; for (const a of arr) if (a === v) k++; return k; };
		const land = n - c(m.water, Water.sea);
		const out: any = { seed, ms: Math.round(ms), land: (land / n).toFixed(2) };
		out.water = { river: c(m.water, 3), lake: c(m.water, 2), spring: c(m.water, 4) };
		out.biome = Object.fromEntries(Object.entries(Biome).map(([k, v]) => [k, c(m.biome, v)]));
		out.ground = Object.fromEntries(Object.entries(Ground).map(([k, v]) => [k, c(m.ground, v)]));
		out.dep = Object.fromEntries(Object.entries(Deposit).map(([k, v]) => [k, c(m.deposit, v)]));
		let tmin = 99, tmax = -99;
		for (let i = 0; i < n; i++) if (m.water[i] !== 1) { tmin = Math.min(tmin, m.temperature[i]); tmax = Math.max(tmax, m.temperature[i]); }
		out.t = [tmin.toFixed(1), tmax.toFixed(1)];
		out.start = findStart(m, seed);
		lines.push(JSON.stringify(out));
		if (seed === 1) {
			let s = '';
			for (let y = 0; y < m.size; y += 4) {
				for (let x = 0; x < m.size; x += 2) {
					const i = y * m.size + x; const w = m.water[i];
					s += w === 1 ? '~' : w === 3 ? '|' : w === 2 ? 'o' : w === 4 ? '*' : ' .gfwsHM^'[m.biome[i]] ?? '?';
				}
				s += '\n';
			}
			lines.push(s);
		}
	}
	throw new Error('\n' + lines.join('\n'));
});
