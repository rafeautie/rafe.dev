// Builds the map from a seed: land and sea, rivers, climate, biomes, ground,
// deposits and the wild plants and trees. Every random choice comes from the
// seeded Rng, so a seed always gives the same world.

import { MAP_SIZE, SEA_LEVEL } from '../config';
import { Rng } from '../rng';
import { Biome, Deposit, Ground, Water, type WorldMap } from '../types';
import { createNoise2D, fbm, ridged } from './noise';

const DX8 = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY8 = [-1, -1, -1, 0, 0, 1, 1, 1];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const smoothstep = (a: number, b: number, v: number) => {
	const t = clamp01((v - a) / (b - a));
	return t * t * (3 - 2 * t);
};

// the value that `q` (0..1) of the numbers fall below
function quantile(values: ArrayLike<number>, q: number): number {
	const copy = Float32Array.from(values);
	copy.sort();
	return copy[Math.min(copy.length - 1, Math.max(0, Math.floor(q * copy.length)))];
}

// ----------------------------------------------------------------- height

// How land rank (0..1 among land tiles) becomes height above the sea. Fixed
// so every world has about the same share of lowland, hills and peaks.
const RANK = [0, 0.25, 0.55, 0.78, 0.92, 0.985, 1];
const RISE = [0, 0.12, 0.3, 0.5, 0.7, 0.85, 1];

function rankToRise(p: number): number {
	for (let i = 1; i < RANK.length; i++) {
		if (p <= RANK[i]) {
			const t = (p - RANK[i - 1]) / (RANK[i] - RANK[i - 1]);
			return RISE[i - 1] + t * (RISE[i] - RISE[i - 1]);
		}
	}
	return 1;
}

function buildHeight(size: number, rng: Rng): Float32Array {
	const n = size * size;
	const base = createNoise2D(rng.fork());
	const hillNoise = createNoise2D(rng.fork());
	const ridgeNoise = createNoise2D(rng.fork());
	const wobble = createNoise2D(rng.fork());

	// edges: 0 north, 1 east, 2 south, 3 west
	const primary = rng.int(0, 3);
	const second = rng.chance(0.45) ? (primary + (rng.chance(0.5) ? 1 : 3)) % 4 : -1;
	const width1 = second < 0 ? rng.range(0.2, 0.3) : rng.range(0.14, 0.2);
	const width2 = rng.range(0.14, 0.2);
	const opposite = (primary + 2) % 4;
	const ridgePos = rng.range(0.14, 0.3);
	const ridgeWidth = rng.range(0.07, 0.12);
	const seaArea = second < 0 ? width1 : width1 + width2 - width1 * width2;
	const landShare = Math.min(0.78, Math.max(0.6, 1 - seaArea));

	const raw = new Float32Array(n);
	const d = [0, 0, 0, 0];
	let lo = Infinity;
	let hi = -Infinity;
	for (let y = 0; y < size; y++) {
		const v = (y + 0.5) / size;
		for (let x = 0; x < size; x++) {
			const u = (x + 0.5) / size;
			d[0] = v;
			d[1] = 1 - u;
			d[2] = 1 - v;
			d[3] = u;
			const wob = 0.05 * wobble(u * 2.5, v * 2.5);
			let h = 0.5 + 0.9 * fbm(base, u * 3.2, v * 3.2, 6);
			h += 0.3 * Math.max(0, fbm(hillNoise, u * 6, v * 6, 4));
			// sea along the chosen edges, with a ragged shore
			h -= 1.2 * (1 - smoothstep(0, width1, d[primary] + wob));
			if (second >= 0) h -= 1.2 * (1 - smoothstep(0, width2, d[second] + wob));
			// a mountain range opposite the main sea
			const dm = (d[opposite] - ridgePos + 2 * wob) / ridgeWidth;
			h += 0.55 * Math.exp(-dm * dm) * (0.5 + 0.8 * ridged(ridgeNoise, u * 4, v * 4, 4));
			// land tilts toward the main sea, so rivers run that way
			h += 0.3 * d[primary];
			// a low rim on the other edges keeps rivers inside the map
			for (let e = 0; e < 4; e++) {
				if (e !== primary && e !== second) h += 0.2 * (1 - smoothstep(0, 0.05, d[e]));
			}
			raw[y * size + x] = h;
			if (h < lo) lo = h;
			if (h > hi) hi = h;
		}
	}

	// Only the order of heights matters, so spread them over a fixed curve.
	const BINS = 4096;
	const binWidth = (hi - lo) / BINS || 1;
	const counts = new Float64Array(BINS);
	for (let i = 0; i < n; i++) {
		counts[Math.min(BINS - 1, Math.floor((raw[i] - lo) / binWidth))]++;
	}
	const cum = new Float64Array(BINS + 1);
	for (let b = 0; b < BINS; b++) cum[b + 1] = cum[b] + counts[b];
	let seaBin = 0;
	while (seaBin < BINS - 1 && cum[seaBin + 1] < (1 - landShare) * n) seaBin++;
	const seaCount = cum[seaBin];
	const landCount = n - seaCount;

	const height = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const b = Math.min(BINS - 1, Math.floor((raw[i] - lo) / binWidth));
		const within = (raw[i] - lo) / binWidth - b;
		const rank = cum[b] + clamp01(within) * counts[b];
		if (b < seaBin) {
			const p = rank / seaCount;
			height[i] = SEA_LEVEL * (0.1 + 0.89 * p);
		} else {
			const p = (rank - seaCount) / landCount;
			height[i] = SEA_LEVEL + (1 - SEA_LEVEL) * rankToRise(clamp01(p));
		}
	}
	return height;
}

// ----------------------------------------------------------------- water

// Sea is the low ground joined to the map edge; low ground cut off inland
// is a lake.
function findSea(h: Float32Array, size: number): Uint8Array {
	const n = size * size;
	const sea = new Uint8Array(n);
	const stack = new Int32Array(n);
	let top = 0;
	const seed = (i: number) => {
		if (!sea[i] && h[i] < SEA_LEVEL) {
			sea[i] = 1;
			stack[top++] = i;
		}
	};
	for (let k = 0; k < size; k++) {
		seed(k);
		seed((size - 1) * size + k);
		seed(k * size);
		seed(k * size + size - 1);
	}
	while (top > 0) {
		const c = stack[--top];
		const x = c % size;
		const y = (c - x) / size;
		if (x > 0) seed(c - 1);
		if (x < size - 1) seed(c + 1);
		if (y > 0) seed(c - size);
		if (y < size - 1) seed(c + size);
	}
	return sea;
}

// Fills pits from the sea outward (priority flood), so every tile has a way
// down to the sea or the map edge. Each tile remembers the neighbour it drains
// to, and flow is added up from the highest tiles down.
function drainage(h: Float32Array, size: number, sea: Uint8Array, rain: Float32Array) {
	const n = size * size;
	const filled = new Float64Array(n);
	const parent = new Int32Array(n).fill(-1);
	const seen = new Uint8Array(n);
	const order = new Int32Array(n);
	const keys = new Float64Array(n);
	const items = new Int32Array(n);
	let len = 0;

	const push = (i: number, key: number) => {
		let c = len++;
		while (c > 0) {
			const p = (c - 1) >> 1;
			if (keys[p] <= key) break;
			keys[c] = keys[p];
			items[c] = items[p];
			c = p;
		}
		keys[c] = key;
		items[c] = i;
	};
	const pop = () => {
		const top = items[0];
		len--;
		if (len > 0) {
			const key = keys[len];
			const item = items[len];
			let c = 0;
			for (;;) {
				let l = 2 * c + 1;
				if (l >= len) break;
				if (l + 1 < len && keys[l + 1] < keys[l]) l++;
				if (keys[l] >= key) break;
				keys[c] = keys[l];
				items[c] = items[l];
				c = l;
			}
			keys[c] = key;
			items[c] = item;
		}
		return top;
	};

	for (let i = 0; i < n; i++) {
		const x = i % size;
		const y = (i - x) / size;
		if (sea[i] || x === 0 || y === 0 || x === size - 1 || y === size - 1) {
			seen[i] = 1;
			filled[i] = h[i];
			push(i, h[i]);
		}
	}
	// a tiny rise on flat ground keeps water moving
	const EPS = 1e-6;
	let count = 0;
	while (len > 0) {
		const c = pop();
		order[count++] = c;
		const x = c % size;
		const y = (c - x) / size;
		const level = filled[c];
		for (let k = 0; k < 8; k++) {
			const nx = x + DX8[k];
			const ny = y + DY8[k];
			if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
			const ni = ny * size + nx;
			if (seen[ni]) continue;
			seen[ni] = 1;
			parent[ni] = c;
			filled[ni] = Math.max(h[ni], level + EPS);
			push(ni, filled[ni]);
		}
	}
	const acc = Float32Array.from(rain);
	for (let k = count - 1; k >= 0; k--) {
		const c = order[k];
		const p = parent[c];
		if (p >= 0) acc[p] += acc[c];
	}
	return { filled, parent, acc };
}

// removes blobs of fewer than `min` tiles from a mask
function dropSmall(mask: Uint8Array, size: number, min: number) {
	const n = size * size;
	const seen = new Uint8Array(n);
	const stack = new Int32Array(n);
	const blob = new Int32Array(n);
	for (let s = 0; s < n; s++) {
		if (!mask[s] || seen[s]) continue;
		let top = 0;
		let found = 0;
		seen[s] = 1;
		stack[top++] = s;
		while (top > 0) {
			const c = stack[--top];
			blob[found++] = c;
			const x = c % size;
			const y = (c - x) / size;
			for (let k = 0; k < 8; k++) {
				const nx = x + DX8[k];
				const ny = y + DY8[k];
				if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
				const ni = ny * size + nx;
				if (mask[ni] && !seen[ni]) {
					seen[ni] = 1;
					stack[top++] = ni;
				}
			}
		}
		if (found < min) for (let k = 0; k < found; k++) mask[blob[k]] = 0;
	}
}

// steps out from the marked tiles; 255 means farther than `cap`
function distanceFrom(size: number, source: Uint8Array, cap: number): Uint8Array {
	const n = size * size;
	const dist = new Uint8Array(n).fill(255);
	const queue = new Int32Array(n);
	let head = 0;
	let tail = 0;
	for (let i = 0; i < n; i++) {
		if (source[i]) {
			dist[i] = 0;
			queue[tail++] = i;
		}
	}
	while (head < tail) {
		const c = queue[head++];
		const dc = dist[c];
		if (dc >= cap) continue;
		const x = c % size;
		const y = (c - x) / size;
		if (x > 0 && dist[c - 1] === 255) {
			dist[c - 1] = dc + 1;
			queue[tail++] = c - 1;
		}
		if (x < size - 1 && dist[c + 1] === 255) {
			dist[c + 1] = dc + 1;
			queue[tail++] = c + 1;
		}
		if (y > 0 && dist[c - size] === 255) {
			dist[c - size] = dc + 1;
			queue[tail++] = c - size;
		}
		if (y < size - 1 && dist[c + size] === 255) {
			dist[c + size] = dc + 1;
			queue[tail++] = c + size;
		}
	}
	return dist;
}

// --------------------------------------------------------------- deposits

type SiteSpec = {
	kind: Deposit;
	count: number;
	// tiles between site centres
	spacing: number;
	radius: [number, number];
	amount: [number, number];
	ok: (i: number) => boolean;
};

// Puts small clusters of a deposit on tiles that fit; returns how many sites
// it managed. If spacing leaves no room, it eases off rather than give up.
function placeSites(map: WorldMap, rng: Rng, spec: SiteSpec): number {
	const { size, deposit, depositLeft } = map;
	const candidates: number[] = [];
	for (let i = 0; i < size * size; i++) {
		if (deposit[i] === Deposit.none && spec.ok(i)) candidates.push(i);
	}
	const centres: number[] = [];
	for (const factor of [1, 0.6, 0.3, 0]) {
		const spacing = spec.spacing * factor;
		for (let tries = 0; tries < 300 && centres.length < spec.count; tries++) {
			if (candidates.length === 0) return centres.length;
			const c = rng.pick(candidates);
			if (deposit[c] !== Deposit.none) continue;
			const cx = c % size;
			const cy = (c - cx) / size;
			let clear = true;
			for (const o of centres) {
				const ox = o % size;
				const oy = (o - ox) / size;
				if (Math.hypot(ox - cx, oy - cy) < spacing) {
					clear = false;
					break;
				}
			}
			if (!clear) continue;
			centres.push(c);
			const r = rng.int(spec.radius[0], spec.radius[1]);
			const rich = rng.range(spec.amount[0], spec.amount[1]);
			for (let dy = -r - 1; dy <= r + 1; dy++) {
				for (let dx = -r - 1; dx <= r + 1; dx++) {
					const x = cx + dx;
					const y = cy + dy;
					if (x < 0 || y < 0 || x >= size || y >= size) continue;
					const i = y * size + x;
					const dist = Math.hypot(dx, dy);
					// ragged edge, so a cluster is not a perfect disc
					if (dist > 0 && dist > r * (0.65 + 0.45 * rng.next())) continue;
					if (deposit[i] !== Deposit.none || !spec.ok(i)) continue;
					deposit[i] = spec.kind;
					depositLeft[i] = Math.max(10, Math.round(rich * (1 - (0.5 * dist) / (r + 1))));
				}
			}
		}
		if (centres.length >= spec.count) break;
	}
	return centres.length;
}

// ------------------------------------------------------------------ world

export function generateWorld(seed: number, size = MAP_SIZE): WorldMap {
	const n = size * size;
	const rng = new Rng(seed);
	const h = buildHeight(size, rng);
	const sea = findSea(h, size);

	const rainNoise = createNoise2D(rng.fork());
	const moistNoise = createNoise2D(rng.fork());
	const forestNoise = createNoise2D(rng.fork());
	const chalkNoise = createNoise2D(rng.fork());
	const grainNoise = createNoise2D(rng.fork());
	const plantNoise = createNoise2D(rng.fork());
	const warmNoise = createNoise2D(rng.fork());
	const deposits = rng.fork();
	const features = rng.fork();

	const rise = (i: number) => Math.max(0, (h[i] - SEA_LEVEL) / (1 - SEA_LEVEL));

	// base wetness, also the rain that feeds rivers
	const wetBase = new Float32Array(n);
	const rain = new Float32Array(n);
	let landCount = 0;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = y * size + x;
			const m = clamp01(0.5 + 0.7 * fbm(moistNoise, (x / size) * 4, (y / size) * 4, 4));
			wetBase[i] = m;
			rain[i] = 0.6 + 0.8 * clamp01(0.5 + 0.7 * fbm(rainNoise, (x / size) * 3, (y / size) * 3, 3));
			rain[i] += 0.6 * rise(i);
			if (!sea[i]) landCount++;
		}
	}

	// rivers and lakes
	const { filled, parent, acc } = drainage(h, size, sea, rain);
	const water = new Uint8Array(n);
	const lake = new Uint8Array(n);
	const depths: number[] = [];
	for (let i = 0; i < n; i++) {
		if (sea[i]) {
			water[i] = Water.sea;
		} else if (h[i] < SEA_LEVEL) {
			lake[i] = 1;
		} else {
			const depth = filled[i] - h[i];
			if (depth > 0.0004) depths.push(depth);
		}
	}
	// only the deepest basins hold water
	depths.sort((a, b) => b - a);
	const lakeTiles = Math.round(landCount * features.range(0.006, 0.012));
	const lakeDepth = depths.length > lakeTiles ? depths[lakeTiles - 1] : 0.0004;
	for (let i = 0; i < n; i++) {
		if (!sea[i] && h[i] >= SEA_LEVEL && filled[i] - h[i] >= lakeDepth) lake[i] = 1;
	}
	dropSmall(lake, size, 5);
	for (let i = 0; i < n; i++) if (lake[i]) water[i] = Water.lake;

	const flows = new Float32Array(landCount);
	let f = 0;
	for (let i = 0; i < n; i++) if (!sea[i]) flows[f++] = acc[i];
	flows.sort();
	const riverTiles = Math.round(landCount * features.range(0.011, 0.017));
	const threshold = Math.max(40, flows[Math.max(0, flows.length - riverTiles)]);
	const river = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		if (sea[i] || water[i] !== Water.none || acc[i] < threshold) continue;
		river[i] = 1;
	}
	// the big rivers run wider, the small ones stay one tile
	for (let i = 0; i < n; i++) {
		if (!river[i] || acc[i] < threshold * 5) continue;
		const x = i % size;
		const y = (i - x) / size;
		const around = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1];
		around.push(y < size - 1 ? i + size : -1);
		for (const j of around) {
			if (j >= 0 && !sea[j] && h[j] >= SEA_LEVEL && water[j] === Water.none) river[j] = 2;
		}
	}
	for (let i = 0; i < n; i++) if (river[i]) water[i] = Water.river;

	// springs where the highest streams begin, and a few more in the hills
	const fed = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		if (river[i] === 1 && parent[i] >= 0) fed[parent[i]] = 1;
	}
	const sources: number[] = [];
	for (let i = 0; i < n; i++) if (river[i] === 1 && !fed[i]) sources.push(i);
	sources.sort((a, b) => h[b] - h[a]);
	const springCount = features.int(4, 7);
	for (let k = 0; k < Math.min(springCount, sources.length); k++) {
		if (rise(sources[k]) > 0.3) water[sources[k]] = Water.spring;
	}
	for (let tries = 0; tries < 400; tries++) {
		if (tries >= 400) break;
		const i = features.int(0, n - 1);
		const r = rise(i);
		if (water[i] === Water.none && !sea[i] && r > 0.45 && r < 0.85 && features.chance(0.05)) {
			water[i] = Water.spring;
			if (features.chance(0.4)) break;
		}
	}

	// distances, for moisture and everything that depends on being near water
	const freshMask = new Uint8Array(n);
	const wetMask = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		if (water[i] === Water.sea) wetMask[i] = 1;
		else if (water[i] !== Water.none) {
			wetMask[i] = 1;
			freshMask[i] = 1;
		}
	}
	const nearWater = distanceFrom(size, wetMask, 12);
	const nearFresh = distanceFrom(size, freshMask, 12);
	const nearSea = distanceFrom(size, sea, 3);

	// temperature, moisture, forest cover and chalk noise
	const temperature = new Float32Array(n);
	const moisture = new Float32Array(n);
	const forestness = new Float32Array(n);
	const chalkness = new Float32Array(n);
	const warmSouth = features.chance(0.5);
	for (let y = 0; y < size; y++) {
		const lat = warmSouth ? 1 - y / (size - 1) : y / (size - 1);
		for (let x = 0; x < size; x++) {
			const i = y * size + x;
			const u = x / size;
			const v = y / size;
			const r = rise(i);
			temperature[i] =
				18 - 6 * lat - 11 * r + 1.5 * fbm(warmNoise, u * 3, v * 3, 3) - (sea[i] ? 0 : 0);
			if (sea[i]) {
				moisture[i] = 1;
			} else {
				const d = nearWater[i];
				const close = d >= 12 ? 0 : Math.pow(1 - d / 12, 1.3);
				moisture[i] = clamp01(0.15 + 0.5 * wetBase[i] + 0.4 * close + 0.1 * r);
			}
			forestness[i] = 0.5 + 0.5 * fbm(forestNoise, u * 6, v * 6, 4);
			chalkness[i] = fbm(chalkNoise, u * 2.5, v * 2.5, 3);
		}
	}
	const landForest = new Float32Array(landCount);
	const landChalk = new Float32Array(landCount);
	f = 0;
	for (let i = 0; i < n; i++) {
		if (sea[i]) continue;
		landForest[f] = forestness[i] + 0.4 * moisture[i];
		landChalk[f++] = chalkness[i];
	}
	const forestLine = quantile(landForest, 1 - features.range(0.45, 0.6));
	const chalkLine = quantile(landChalk, 1 - features.range(0.07, 0.11));

	const biome = new Uint8Array(n);
	const ground = new Uint8Array(n);
	const fertility = new Float32Array(n);
	const plants = new Float32Array(n);
	const wood = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		if (sea[i]) {
			biome[i] = Biome.ocean;
			ground[i] = Ground.sand;
			continue;
		}
		const r = rise(i);
		const t = temperature[i];
		const m = moisture[i];
		let b: Biome;
		if (r > 0.88 || (t < 4.5 && r > 0.55)) b = Biome.snow;
		else if (r >= 0.7) b = Biome.mountain;
		else if (r >= 0.5) b = Biome.hills;
		else if (nearSea[i] <= 1 && r < 0.12) b = Biome.coast;
		else if (r < 0.22 && m > 0.66 && nearFresh[i] <= 4) b = Biome.wetland;
		else if (m < 0.32) b = Biome.scrub;
		else if (forestness[i] + 0.4 * m > forestLine) b = Biome.forest;
		else b = Biome.grassland;
		biome[i] = b;

		const chalky = chalkness[i] > chalkLine;
		let g: Ground = Ground.loam;
		if (b === Biome.mountain || b === Biome.snow) g = Ground.rock;
		else if (b === Biome.coast) g = Ground.sand;
		else if (b === Biome.wetland) g = Ground.bog;
		else if (b === Biome.hills) g = chalky ? Ground.chalk : Ground.rock;
		else if (nearFresh[i] <= 1) g = Ground.clay;
		else if (chalky) g = Ground.chalk;
		ground[i] = g;
	}

	// living layers
	const groundSoil = [0.12, 0.7, 0.6, 0.06, 0.3, 0.4];
	const plantBase = [0, 0.15, 0.5, 0.4, 0.5, 0.25, 0.2, 0.05, 0];
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = y * size + x;
			const w = water[i];
			if (w === Water.sea || w === Water.lake) continue;
			const b = biome[i] as Biome;
			const m = moisture[i];
			const edge = forestness[i] + 0.4 * m - forestLine;
			if (w === Water.river || w === Water.spring) {
				plants[i] = 0.15;
				continue;
			}

			let soil = groundSoil[ground[i]] * (0.55 + 0.55 * m);
			if (nearFresh[i] <= 2 && (ground[i] === Ground.loam || ground[i] === Ground.clay)) {
				soil += 0.2;
			}
			if (temperature[i] < 6) soil *= 0.6;
			fertility[i] = clamp01(soil);

			let trees = 0.05;
			if (b === Biome.forest) trees = 0.55 + 0.45 * clamp01(edge / 0.25);
			else if (b === Biome.grassland) trees = 0.05 + 0.2 * clamp01(1 + edge / 0.15);
			else if (b === Biome.wetland) trees = 0.15;
			else if (b === Biome.scrub) trees = 0.12;
			else if (b === Biome.hills) trees = 0.2 + 0.4 * clamp01(1 + edge / 0.25);
			else if (b === Biome.snow) trees = 0;
			wood[i] = trees;

			const u = x / size;
			const v = y / size;
			const variety = 0.6 + 0.8 * (0.5 + 0.5 * fbm(plantNoise, u * 8, v * 8, 3));
			let food = plantBase[b] * variety * (0.5 + 0.5 * m);
			if (b === Biome.grassland || b === Biome.forest) food += 0.25 * clamp01(1 - Math.abs(edge) / 0.1);
			const wet = nearFresh[i];
			if (wet <= 4 && b !== Biome.snow && b !== Biome.mountain) food += 0.3 * (1 - wet / 5);
			// thick wild grain on open ground by rivers
			const grain = 0.5 + 0.5 * fbm(grainNoise, u * 10, v * 10, 3);
			if (b === Biome.grassland && wet <= 10 && grain > 0.6) {
				food = Math.max(food, 0.85 + 0.15 * clamp01((grain - 0.6) / 0.15));
			}
			plants[i] = clamp01(food);
		}
	}

	const map: WorldMap = {
		size,
		seed,
		height: h,
		moisture,
		temperature,
		ground,
		water,
		biome,
		deposit: new Uint8Array(n),
		fertility,
		plants,
		wood,
		depositLeft: new Uint16Array(n),
		// every tile starts unbuilt (Built.none is 0)
		built: new Uint8Array(n)
	};

	placeDeposits(map, deposits, nearFresh);
	return map;
}

function placeDeposits(map: WorldMap, rng: Rng, nearFresh: Uint8Array) {
	const { size, ground, water, biome, deposit } = map;
	const dry = (i: number) => water[i] !== Water.sea;
	const scale = size / MAP_SIZE;

	placeSites(map, rng, {
		kind: Deposit.flint,
		count: rng.int(6, 10),
		spacing: 12 * scale,
		radius: [2, 3],
		amount: [80, 300],
		ok: (i) => dry(i) && ground[i] === Ground.chalk
	});
	placeSites(map, rng, {
		kind: Deposit.clay,
		count: rng.int(18, 30),
		spacing: 6 * scale,
		radius: [1, 2],
		amount: [120, 400],
		ok: (i) => dry(i) && ground[i] === Ground.clay
	});

	// Tin has to be far from where the people start, so bronze needs travel.
	// The start only looks at flint, chalk and clay, which are placed by now.
	const start = findStart(map, map.seed);
	const far = 80 * scale;
	const distance = (i: number) => Math.hypot((i % size) - start.x, Math.floor(i / size) - start.y);
	const rocky = (i: number) =>
		ground[i] === Ground.rock && (biome[i] === Biome.hills || biome[i] === Biome.mountain);
	let tinOk = (i: number) => rocky(i) && distance(i) > far;
	let anyTin = false;
	for (let i = 0; i < size * size && !anyTin; i++) anyTin = tinOk(i);
	if (!anyTin) {
		// no rock that far away: take the farthest rock there is
		let best = 0;
		for (let i = 0; i < size * size; i++) if (rocky(i)) best = Math.max(best, distance(i));
		const reach = best * 0.9;
		tinOk = (i) => rocky(i) && distance(i) > reach;
	}
	placeSites(map, rng, {
		kind: Deposit.tin,
		count: rng.int(1, 2),
		spacing: 30 * scale,
		radius: [1, 2],
		amount: [40, 120],
		ok: tinOk
	});

	placeSites(map, rng, {
		kind: Deposit.copper,
		count: rng.int(3, 6),
		spacing: 22 * scale,
		radius: [2, 2],
		amount: [80, 300],
		ok: (i) => dry(i) && ground[i] === Ground.rock && biome[i] === Biome.hills
	});

	const bogs = placeSites(map, rng, {
		kind: Deposit.bogIron,
		count: rng.int(2, 4),
		spacing: 15 * scale,
		radius: [1, 2],
		amount: [60, 200],
		ok: (i) => dry(i) && ground[i] === Ground.bog
	});
	if (bogs === 0) {
		// no wetland anywhere: let a damp spot by the water turn boggy
		placeSites(map, rng, {
			kind: Deposit.bogIron,
			count: 2,
			spacing: 15 * scale,
			radius: [1, 2],
			amount: [60, 200],
			ok: (i) => {
				const lowland = biome[i] === Biome.grassland || biome[i] === Biome.forest;
				if (!lowland || water[i] !== Water.none || nearFresh[i] > 3) return false;
				ground[i] = Ground.bog;
				biome[i] = Biome.wetland;
				return true;
			}
		});
	}

	placeSites(map, rng, {
		kind: Deposit.obsidian,
		count: rng.int(0, 2),
		spacing: 30 * scale,
		radius: [1, 1],
		amount: [30, 100],
		ok: (i) => biome[i] === Biome.mountain
	});
	placeSites(map, rng, {
		kind: Deposit.salt,
		count: rng.int(2, 4),
		spacing: 20 * scale,
		radius: [1, 2],
		amount: [100, 400],
		ok: (i) => dry(i) && biome[i] === Biome.coast
	});
	placeSites(map, rng, {
		kind: Deposit.ochre,
		count: rng.int(3, 5),
		spacing: 16 * scale,
		radius: [1, 2],
		amount: [40, 150],
		ok: (i) =>
			ground[i] === Ground.rock && (biome[i] === Biome.hills || biome[i] === Biome.mountain)
	});
}

// ------------------------------------------------------------------ start

// closeness of a thing `d` tiles away: full when at hand, half at 30 tiles
const near = (d: number) => (d <= 30 ? 1 - (0.5 * d) / 30 : Math.max(0, 0.5 - (d - 30) / 80));

// A good place for the first camp: dry ground by a river in grassland or
// forest, mild weather, with flint (or chalk), clay and trees close by.
// Depends only on the map and the seed.
export function findStart(map: WorldMap, seed: number): { x: number; y: number } {
	const { size, water, biome, ground, deposit, temperature, wood, plants, fertility } = map;
	const n = size * size;

	const stone: number[] = [];
	const clay: number[] = [];
	for (let i = 0; i < n; i++) {
		if (deposit[i] === Deposit.flint || ground[i] === Ground.chalk) stone.push(i);
		if (deposit[i] === Deposit.clay) clay.push(i);
	}
	const nearest = (list: number[], x: number, y: number) => {
		let best = Infinity;
		for (const i of list) {
			const dx = (i % size) - x;
			const dy = Math.floor(i / size) - y;
			const d = dx * dx + dy * dy;
			if (d < best) best = d;
		}
		return Math.sqrt(best);
	};
	const isRiver = (i: number) => water[i] === Water.river;
	const isFresh = (i: number) => water[i] === Water.river || water[i] === Water.lake;
	const nextTo = (x: number, y: number, radius: number, test: (i: number) => boolean) => {
		for (let dy = -radius; dy <= radius; dy++) {
			for (let dx = -radius; dx <= radius; dx++) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
				if (test(ny * size + nx)) return true;
			}
		}
		return false;
	};

	let best = -1;
	let bestScore = -Infinity;
	// try the strict rule first, then looser ones, so every map gets a start
	for (let pass = 0; pass < 3 && best < 0; pass++) {
		const step = pass === 2 ? 3 : 1;
		for (let y = 0; y < size; y += step) {
			for (let x = 0; x < size; x += step) {
				const i = y * size + x;
				if (water[i] !== Water.none || biome[i] === Biome.ocean) continue;
				if (pass < 2 && biome[i] !== Biome.grassland && biome[i] !== Biome.forest) continue;
				if (pass === 0 && !nextTo(x, y, 1, isRiver)) continue;
				if (pass === 1 && !nextTo(x, y, 3, isFresh)) continue;

				let trees = 0;
				let food = 0;
				let cells = 0;
				for (let dy = -6; dy <= 6; dy++) {
					for (let dx = -6; dx <= 6; dx++) {
						const nx = x + dx;
						const ny = y + dy;
						if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
						trees += wood[ny * size + nx];
						food += plants[ny * size + nx];
						cells++;
					}
				}
				const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
				// a stable pinch of luck so equal spots do not always tie the same way
				const luck = (Math.imul(i + 1, 2654435761) ^ Math.imul(seed + 7, 40503)) >>> 0;
				const score =
					3 * near(nearest(stone, x, y)) +
					2 * near(nearest(clay, x, y)) +
					2 * Math.min(1, trees / cells / 0.5) +
					1.5 * Math.min(1, food / cells / 0.6) +
					(1 - Math.min(1, Math.abs(temperature[i] - 13) / 8)) +
					(biome[i] === Biome.grassland ? 1 : 0.8) +
					fertility[i] -
					(edge < 14 ? 2 : 0) +
					0.3 * (luck / 4294967296);
				if (score > bestScore) {
					bestScore = score;
					best = i;
				}
			}
		}
	}
	if (best < 0) {
		// no dry land to speak of: the dry tile nearest the middle
		let bestDist = Infinity;
		const mid = (size - 1) / 2;
		for (let i = 0; i < n; i++) {
			if (water[i] === Water.sea) continue;
			const d = Math.hypot((i % size) - mid, Math.floor(i / size) - mid);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		if (best < 0) best = Math.floor(n / 2);
	}
	return { x: best % size, y: Math.floor(best / size) };
}
