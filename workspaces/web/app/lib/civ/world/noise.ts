// Seeded 2D simplex noise, written out so the map needs no extra packages.
// The permutation table is shuffled by the shared Rng, so a seed always gives
// the same land.

import type { Rng } from '../rng';

export type Noise2D = (x: number, y: number) => number;

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// twelve gradient directions, as x, y pairs
const GRAD = new Float64Array([
	1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1
]);

// Smooth noise in roughly -1..1; nearby points give nearby values.
export function createNoise2D(rng: Rng): Noise2D {
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
	for (let i = 255; i > 0; i--) {
		const j = rng.int(0, i);
		const t = base[i];
		base[i] = base[j];
		base[j] = t;
	}
	// doubled, so lookups never need to wrap
	const perm = new Uint8Array(512);
	for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

	return (xin, yin) => {
		const s = (xin + yin) * F2;
		const i = Math.floor(xin + s);
		const j = Math.floor(yin + s);
		const t = (i + j) * G2;
		const x0 = xin - (i - t);
		const y0 = yin - (j - t);
		// which of the two triangles in the skewed cell we are in
		const i1 = x0 > y0 ? 1 : 0;
		const j1 = x0 > y0 ? 0 : 1;
		const x1 = x0 - i1 + G2;
		const y1 = y0 - j1 + G2;
		const x2 = x0 - 1 + 2 * G2;
		const y2 = y0 - 1 + 2 * G2;
		const ii = i & 255;
		const jj = j & 255;
		let n = 0;
		let a = 0.5 - x0 * x0 - y0 * y0;
		if (a > 0) {
			const g = (perm[ii + perm[jj]] % 12) * 2;
			a *= a;
			n += a * a * (GRAD[g] * x0 + GRAD[g + 1] * y0);
		}
		let b = 0.5 - x1 * x1 - y1 * y1;
		if (b > 0) {
			const g = (perm[ii + i1 + perm[jj + j1]] % 12) * 2;
			b *= b;
			n += b * b * (GRAD[g] * x1 + GRAD[g + 1] * y1);
		}
		let c = 0.5 - x2 * x2 - y2 * y2;
		if (c > 0) {
			const g = (perm[ii + 1 + perm[jj + 1]] % 12) * 2;
			c *= c;
			n += c * c * (GRAD[g] * x2 + GRAD[g + 1] * y2);
		}
		return 70 * n;
	};
}

// Several layers of noise, each finer and fainter, for natural-looking land.
// Stays within -1..1.
export function fbm(
	noise: Noise2D,
	x: number,
	y: number,
	octaves: number,
	lacunarity = 2,
	gain = 0.5
): number {
	let sum = 0;
	let amp = 1;
	let freq = 1;
	let norm = 0;
	for (let o = 0; o < octaves; o++) {
		// the offset keeps the layers from lining up at the origin
		sum += amp * noise(x * freq + o * 17.3, y * freq + o * 31.7);
		norm += amp;
		amp *= gain;
		freq *= lacunarity;
	}
	return sum / norm;
}

// Sharp crests, 0..1, for mountain ranges.
export function ridged(noise: Noise2D, x: number, y: number, octaves: number): number {
	let sum = 0;
	let amp = 1;
	let freq = 1;
	let norm = 0;
	for (let o = 0; o < octaves; o++) {
		const r = 1 - Math.abs(noise(x * freq + o * 13.1, y * freq + o * 7.9));
		sum += amp * r * r;
		norm += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return sum / norm;
}
