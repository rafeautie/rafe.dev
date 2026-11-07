import { describe, expect, it } from 'vitest';
import { Biome, Built, Ground, Water } from '../types';
import {
	channelMask,
	collectGround,
	paintDiamond,
	paintTile,
	riverChannel,
	tileSig,
	waterAt
} from './ground';
import { viewOf, type DrawState, type Standing } from './scene';
import { Camera } from './camera';
import { DIAMOND_H, DIAMOND_W, LIFT, diamondBottom, tileHeight } from './pixel/localiso';
import { PALETTE } from './pixel/palette';

const T = 240;

describe('collectGround', () => {
	it('does nothing (and touches no canvas) when zoomed out', () => {
		const camera = new Camera();
		camera.zoom = 5;
		const layers = { size: 8, water: new Uint8Array(64), biome: new Uint8Array(64) };
		const state = { camera, layers } as unknown as DrawState;
		const view = viewOf(state);
		expect(view.detail).toBe(0);
		const out: Standing[] = [];
		expect(() => collectGround(state, view, out)).not.toThrow();
		expect(out.length).toBe(0);
	});
});

describe('waterAt and river channels', () => {
	const size = 12;
	const n = size * size;
	const layers = {
		size,
		water: new Uint8Array(n),
		biome: new Uint8Array(n).fill(Biome.grassland)
	};
	// a river along row 5 into a lake at x = 10..11
	for (let x = 0; x < 10; x++) layers.water[5 * size + x] = Water.river;
	layers.water[5 * size + 10] = Water.lake;
	layers.water[5 * size + 11] = Water.lake;

	it('treats lakes as whole tiles and land as dry', () => {
		expect(waterAt(layers, 10.5, 5.5)).toBe(true);
		expect(waterAt(layers, 10.02, 5.98)).toBe(true);
		expect(waterAt(layers, 3.5, 2.5)).toBe(false);
		expect(waterAt(layers, -1, 2)).toBe(false);
	});

	it('puts a river only in a narrow channel', () => {
		const out: number[] = [];
		const segs = riverChannel(layers, 4, 5, out);
		expect(segs).toBe(2);
		expect(waterAt(layers, 4 + out[4], 5 + out[5])).toBe(true);
		// the tile corners are bank
		expect(waterAt(layers, 4.04, 5.04)).toBe(false);
		expect(waterAt(layers, 4.96, 5.96)).toBe(false);
		// channel is 6 to 14 m wide
		expect(out[6]).toBeGreaterThanOrEqual(6 / 40);
		expect(out[6]).toBeLessThanOrEqual(14 / 40);
	});

	it('meets the neighbouring tile at the same point and width', () => {
		const a: number[] = [];
		const b: number[] = [];
		riverChannel(layers, 4, 5, a);
		riverChannel(layers, 5, 5, b);
		// tile 4 enters from the west (0, y) and east (1, y); tile 5's west mouth matches
		const east = findMouth(a, 1);
		const west = findMouth(b, 0);
		expect(east).not.toBeNull();
		expect(west).not.toBeNull();
		expect(east![1]).toBeCloseTo(west![1], 6);
		expect(east![2]).toBeCloseTo(west![2], 6);
	});

	it('rasterises the channel on the pixel grid, with a bank round it', () => {
		const out: number[] = [];
		riverChannel(layers, 4, 5, out);
		const mask = new Uint8Array(T * T);
		channelMask(layers, 4, 5, mask);
		const at = (fx: number, fy: number) => mask[Math.floor(fy * T) * T + Math.floor(fx * T)];
		// the centre is water, the corners are neither water nor bank
		expect(at(out[4], out[5])).toBe(3);
		expect(at(0.02, 0.02)).toBe(0);
		expect(at(0.98, 0.98)).toBe(0);
		// bank pixels exist, and sit outside the water
		expect(mask.includes(1)).toBe(true);
		expect(mask.includes(2)).toBe(true);
		// the mask and `waterAt` agree away from the edge of the channel
		let agree = 0;
		let total = 0;
		for (let y = 0; y < T; y += 6) {
			for (let x = 0; x < T; x += 6) {
				total++;
				if ((mask[y * T + x] === 3) === waterAt(layers, 4 + (x + 0.5) / T, 5 + (y + 0.5) / T))
					agree++;
			}
		}
		expect(agree / total).toBeGreaterThan(0.97);
	});
});

// ------------------------------------------------------------ painting tiles

function world(season = 1) {
	const size = 6;
	const n = size * size;
	const layers = {
		size,
		height: new Float32Array(n).fill(0.6),
		water: new Uint8Array(n),
		biome: new Uint8Array(n).fill(Biome.grassland),
		ground: new Uint8Array(n).fill(Ground.loam),
		deposit: new Uint8Array(n)
	};
	const living = {
		plants: new Float32Array(n).fill(0.8),
		wood: new Float32Array(n),
		built: new Uint8Array(n)
	};
	// every tile is level 1 land unless a test raises it
	const levels = new Uint8Array(n).fill(1);
	return { size, layers, living, levels, env: { layers, living, villages: [], season, levels } };
}

const paint = (env: ReturnType<typeof world>['env'], tx: number, ty: number) => {
	const out = new Uint32Array(T * T);
	const sparks = paintTile(env, tx, ty, out);
	return { out, sparks };
};

const hex = (name: keyof typeof PALETTE) => {
	const h = PALETTE[name];
	const r = parseInt(h.slice(1, 3), 16);
	const g = parseInt(h.slice(3, 5), 16);
	const b = parseInt(h.slice(5, 7), 16);
	return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

// every pixel is one of the palette's colours, never half transparent
const paletteSet = new Set(Object.keys(PALETTE).map((k) => hex(k as keyof typeof PALETTE)));
const colours = (out: Uint32Array) => new Set(out);

describe('paintTile', () => {
	it('is deterministic and uses only palette colours', () => {
		const w = world();
		const a = paint(w.env, 2, 2).out;
		const b = paint(w.env, 2, 2).out;
		expect(a).toEqual(b);
		for (const c of colours(a)) expect(paletteSet.has(c)).toBe(true);
	});

	it('gives each tile its own texture, in a few shades rather than noise', () => {
		const w = world();
		const a = paint(w.env, 2, 2).out;
		const b = paint(w.env, 3, 2).out;
		expect(a).not.toEqual(b);
		const used = colours(a).size;
		expect(used).toBeGreaterThanOrEqual(3);
		expect(used).toBeLessThanOrEqual(14);
	});

	it('is mostly one colour, with the close shades in small clumps', () => {
		const w = world();
		const a = paint(w.env, 2, 2).out;
		const count = new Map<number, number>();
		for (const c of a) count.set(c, (count.get(c) ?? 0) + 1);
		const biggest = Math.max(...count.values());
		expect(biggest / a.length).toBeGreaterThan(0.4);
	});

	it('makes sand, rock, clay and grass look different', () => {
		const w = world();
		const mean = (tx: number) => {
			const out = paint(w.env, tx, 2).out;
			let r = 0;
			let g = 0;
			let b = 0;
			for (const c of out) {
				r += c & 255;
				g += (c >> 8) & 255;
				b += (c >> 16) & 255;
			}
			return [r, g, b].map((v) => v / out.length);
		};
		w.layers.biome[2 * 6 + 1] = Biome.coast;
		w.layers.biome[2 * 6 + 2] = Biome.mountain;
		w.layers.biome[2 * 6 + 3] = Biome.scrub;
		const means = [0, 1, 2, 3].map(mean);
		for (let i = 0; i < 4; i++)
			for (let j = i + 1; j < 4; j++) {
				const d = Math.hypot(...means[i].map((v, k) => v - means[j][k]));
				expect(d).toBeGreaterThan(25);
			}
	});

	it('follows the biome, and shows the ground layer only in small patches', () => {
		const w = world();
		w.layers.biome.fill(Biome.forest);
		const plain = [0, 1, 2, 3, 4, 5].map((x) => paint(w.env, x, 2).out);
		for (let x = 0; x < 6; x++) w.layers.ground[2 * 6 + x] = Ground.chalk;
		const tiles = [0, 1, 2, 3, 4, 5].map((x) => paint(w.env, x, 2).out);
		let most = 0;
		for (let k = 0; k < 6; k++) {
			let changed = 0;
			for (let p = 0; p < T * T; p++) if (plain[k][p] !== tiles[k][p]) changed++;
			// only a few tiles show a small patch, never the whole tile
			expect(changed / (T * T)).toBeLessThan(0.15);
			most = Math.max(most, changed);
		}
		expect(most).toBeGreaterThan(50);
		const chalk = tiles[2];
		// no snow-coloured ground in summer
		let pale = 0;
		for (const c of chalk) if (c === hex('white') || c === hex('chalk')) pale++;
		expect(pale / chalk.length).toBeLessThan(0.1);
	});

	it('changes with the season', () => {
		const spring = paint(world(0).env, 2, 2).out;
		const autumn = paint(world(2).env, 2, 2).out;
		const winter = paint(world(3).env, 2, 2).out;
		expect(spring).not.toEqual(autumn);
		expect(colours(winter).has(hex('white'))).toBe(true);
		expect(colours(spring).has(hex('white'))).toBe(true); // a few flowers
	});

	it('blends toward a neighbour with different ground along the border', () => {
		const w = world();
		w.layers.biome[2 * 6 + 3] = Biome.mountain;
		const plain = paint(world().env, 2, 2).out;
		const next = paint(w.env, 2, 2).out;
		// only the strip beside the rock tile (the east edge) differs
		let diffEast = 0;
		let diffMiddle = 0;
		for (let y = 0; y < T; y++) {
			for (let x = 0; x < T; x++) {
				if (plain[y * T + x] === next[y * T + x]) continue;
				if (x >= T - 44) diffEast++;
				else diffMiddle++;
			}
		}
		expect(diffEast).toBeGreaterThan(1000);
		expect(diffMiddle).toBe(0);
	});

	it('mixes the two grounds across a border in blobs, from both sides', () => {
		const w = world();
		w.layers.biome[2 * 6 + 3] = Biome.mountain;
		const grass = paint(w.env, 2, 2).out;
		const rock = paint(w.env, 3, 2).out;
		const rockColours = new Set([hex('stone'), hex('stoneDark'), hex('stoneLight')]);
		// the last column of the grass tile and the first of the rock tile
		let rockInGrass = 0;
		let grassInRock = 0;
		for (let y = 0; y < T; y++) {
			if (rockColours.has(grass[y * T + T - 1])) rockInGrass++;
			if (!rockColours.has(rock[y * T])) grassInRock++;
		}
		expect(rockInGrass / T).toBeGreaterThan(0.15);
		expect(rockInGrass / T).toBeLessThan(0.85);
		expect(grassInRock / T).toBeGreaterThan(0.15);
		expect(grassInRock / T).toBeLessThan(0.85);
		// well inside each tile the ground is its own
		let far = 0;
		for (let y = 0; y < T; y++) if (rockColours.has(grass[y * T + T - 60])) far++;
		expect(far).toBe(0);
	});

	it('draws crop rows in a field, by season', () => {
		const w = world(1);
		w.living.built[2 * 6 + 2] = Built.field;
		const summer = paint(w.env, 2, 2).out;
		expect(colours(summer).has(hex('leaf'))).toBe(true);
		expect(colours(summer).has(hex('soilDark'))).toBe(true);
		const autumn = paint({ ...w.env, season: 2 }, 2, 2).out;
		expect(colours(autumn).has(hex('gold'))).toBe(true);
	});

	it('paints water with a beach where it meets land, and shimmer spots', () => {
		const w = world();
		for (let y = 2; y <= 3; y++)
			for (let x = 2; x <= 3; x++) w.layers.water[y * 6 + x] = Water.lake;
		const { out, sparks } = paint(w.env, 2, 2);
		// open top-left corner of the lake: sand along the edges, water inside
		expect([hex('sand'), hex('sandLight')]).toContain(out[2 * T + 100]);
		expect(colours(out).has(hex('foam'))).toBe(true);
		expect(colours(out).has(hex('water'))).toBe(true);
		expect(sparks.length).toBeGreaterThan(0);
		expect(sparks.length % 4).toBe(0);
		// the pixel at the shared corner is cut round, so it is sand
		expect(out[0]).toBe(hex('sand'));
		// the dry tile west of it gets a damp sand edge
		const bank = paint(w.env, 1, 2).out;
		expect(bank[100 * T + T - 1]).toBe(hex('sand'));
	});

	it('keeps shimmer to water tiles', () => {
		const w = world();
		expect(paint(w.env, 2, 2).sparks.length).toBe(0);
	});

	it('paints a river channel through the tile', () => {
		const w = world();
		for (let x = 0; x < 6; x++) w.layers.water[3 * 6 + x] = Water.river;
		const { out, sparks } = paint(w.env, 2, 3);
		expect(colours(out).has(hex('water'))).toBe(true);
		expect(sparks.length).toBeGreaterThan(0);
		// a corner away from the channel is still grass
		expect(colours(out).has(hex('grass'))).toBe(true);
	});

	it('joins a river only to the tiles it flows with when heights are known', () => {
		const w = world();
		// two rows of river, side by side: the lower row drains, the upper one
		// drains into it; only linked neighbours get arms
		for (let x = 0; x < 6; x++) {
			w.layers.water[3 * 6 + x] = Water.river;
			w.layers.height[3 * 6 + x] = 0.5 - x * 0.02;
		}
		const out: number[] = [];
		const arms = riverChannel(w.layers, 2, 3, out);
		expect(arms).toBe(2);
	});
});

describe('tileSig', () => {
	it('changes when what is built or growing changes, and not otherwise', () => {
		const w = world();
		const a = tileSig(w.env, 2, 2);
		expect(tileSig(w.env, 2, 2)).toBe(a);
		w.living.built[2 * 6 + 2] = Built.hut;
		const b = tileSig(w.env, 2, 2);
		expect(b).not.toBe(a);
		w.living.plants[2 * 6 + 2] = 0.1;
		expect(tileSig(w.env, 2, 2)).not.toBe(b);
		expect(tileSig({ ...w.env, season: 2 }, 2, 2)).not.toBe(tileSig(w.env, 2, 2));
	});

	it('changes when the cliff in front of the tile changes', () => {
		const w = world();
		const a = tileSig(w.env, 2, 2);
		w.levels[2 * 6 + 2] = 3;
		const b = tileSig(w.env, 2, 2);
		expect(b).not.toBe(a);
		w.levels[2 * 6 + 3] = 2;
		expect(tileSig(w.env, 2, 2)).not.toBe(b);
	});

	it('changes when a neighbour becomes a field', () => {
		const w = world();
		const a = tileSig(w.env, 2, 2);
		w.living.built[2 * 6 + 3] = Built.field;
		expect(tileSig(w.env, 2, 2)).not.toBe(a);
	});

	it('changes when a new building adds a track across the tile', () => {
		const w = world();
		w.env.villages = [{ x: 1, y: 2 } as never];
		const a = tileSig(w.env, 2, 2);
		w.living.built[2 * 6 + 4] = Built.hut;
		expect(tileSig(w.env, 2, 2)).not.toBe(a);
	});
});

// ------------------------------------------------------------ the diamond

describe('paintDiamond', () => {
	const rows = (drop: number) => DIAMOND_H + drop * LIFT;
	const buffer = () => new Uint32Array(DIAMOND_W * rows(8));
	const diamond = (env: ReturnType<typeof world>['env'], tx: number, ty: number) => {
		const out = buffer();
		const sparks = paintDiamond(env, tx, ty, out);
		return { out, sparks };
	};
	// how many pixels are painted below the diamond, in the columns of one side
	const faceRows = (out: Uint32Array, right: boolean) => {
		let n = 0;
		for (let sx = right ? 240 : 1; sx < (right ? 480 : 240); sx++) {
			const top = diamondBottom(sx);
			for (let y = top + 1; y < rows(8); y++) if (out[y * DIAMOND_W + sx] !== 0) n++;
		}
		return n;
	};

	it('is deterministic, uses palette colours, and leaves the corners empty', () => {
		const w = world();
		const a = diamond(w.env, 2, 2).out;
		const b = diamond(w.env, 2, 2).out;
		expect(a).toEqual(b);
		for (const c of colours(a)) expect(c === 0 || paletteSet.has(c)).toBe(true);
		expect(a[0]).toBe(0);
		expect(a[DIAMOND_W - 1]).toBe(0);
		expect(a[(DIAMOND_H - 1) * DIAMOND_W]).toBe(0);
		// the middle of the diamond is ground
		expect(a[120 * DIAMOND_W + 240]).not.toBe(0);
	});

	it('draws no cliff face on level ground', () => {
		const w = world();
		const { out } = diamond(w.env, 2, 2);
		expect(tileHeight(w.levels, 6, 2, 2)).toBe(DIAMOND_H);
		expect(faceRows(out, true)).toBe(0);
		expect(faceRows(out, false)).toBe(0);
	});

	it('draws a face exactly where the tile in front is lower', () => {
		const w = world();
		w.levels[2 * 6 + 2] = 4;
		// +x neighbour two levels down: a right face; +y neighbour higher: none
		w.levels[2 * 6 + 3] = 2;
		w.levels[3 * 6 + 2] = 5;
		let { out } = diamond(w.env, 2, 2);
		expect(tileHeight(w.levels, 6, 2, 2)).toBe(rows(2));
		expect(faceRows(out, true)).toBeGreaterThan(40 * 2 * LIFT);
		expect(faceRows(out, false)).toBe(0);
		// now the +y neighbour is lower, but less than the +x one: both faces
		w.levels[3 * 6 + 2] = 3;
		out = diamond(w.env, 2, 2).out;
		expect(faceRows(out, false)).toBeGreaterThan(40 * LIFT);
		expect(faceRows(out, false)).toBeLessThan(faceRows(out, true));
		for (const c of colours(out)) expect(c === 0 || paletteSet.has(c)).toBe(true);
	});

	it('uses sand on a coast, earth on a hill, and rock on stony ground', () => {
		const w = world();
		w.levels[2 * 6 + 2] = 3;
		w.levels[2 * 6 + 3] = 1;
		const earth = diamond(w.env, 2, 2).out;
		expect(colours(earth).has(hex('soilLight'))).toBe(true);
		expect(colours(earth).has(hex('sandLight'))).toBe(false);
		w.layers.ground[2 * 6 + 2] = Ground.rock;
		const rock = diamond(w.env, 2, 2).out;
		expect(colours(rock).has(hex('stoneLight'))).toBe(true);
		w.layers.ground[2 * 6 + 2] = Ground.loam;
		w.layers.biome[2 * 6 + 2] = Biome.coast;
		const sand = diamond(w.env, 2, 2).out;
		expect(colours(sand).has(hex('sandLight'))).toBe(true);
	});

	it('pours a river over a step in a small waterfall', () => {
		const w = world();
		for (let x = 0; x < 6; x++) {
			w.layers.water[3 * 6 + x] = Water.river;
			// the river runs east, downhill
			w.layers.height[3 * 6 + x] = 0.6 - x * 0.02;
		}
		w.levels[3 * 6 + 2] = 3;
		w.levels[3 * 6 + 3] = 2;
		const { out } = diamond(w.env, 2, 3);
		const wet = new Set([hex('water'), hex('deep'), hex('waterLight'), hex('foam')]);
		let water = 0;
		let earth = 0;
		for (let sx = 240; sx < 480; sx++) {
			const y = diamondBottom(sx) + 12;
			const c = out[y * DIAMOND_W + sx];
			if (wet.has(c)) water++;
			else if (c !== 0) earth++;
		}
		// the fall is the width of the channel mouth: a part of the face, not all of it
		expect(water).toBeGreaterThan(8);
		expect(earth).toBeGreaterThan(water);
		// the same river on level ground has no face at all
		w.levels[3 * 6 + 3] = 3;
		expect(faceRows(diamond(w.env, 2, 3).out, true)).toBe(0);
	});

	it('keeps shimmer dashes on water, in diamond pixels', () => {
		const w = world();
		for (let y = 2; y <= 3; y++)
			for (let x = 2; x <= 3; x++) {
				w.layers.water[y * 6 + x] = Water.lake;
				w.levels[y * 6 + x] = 0;
			}
		const { out, sparks } = diamond(w.env, 3, 3);
		expect(sparks.length).toBeGreaterThan(0);
		expect(sparks.length % 4).toBe(0);
		const wet = new Set([hex('water'), hex('deep'), hex('waterLight')]);
		for (let j = 0; j < sparks.length; j += 4) {
			const x = sparks[j];
			const y = sparks[j + 1];
			expect(wet.has(out[y * DIAMOND_W + x])).toBe(true);
			expect(wet.has(out[y * DIAMOND_W + x + sparks[j + 3] - 1])).toBe(true);
		}
		expect(diamond(world().env, 2, 2).sparks.length).toBe(0);
	});

	it('paints open water flat, with only a few lighter dashes', () => {
		const w = world();
		for (let y = 1; y <= 4; y++)
			for (let x = 1; x <= 4; x++) w.layers.water[y * 6 + x] = Water.lake;
		const { out } = paint(w.env, 2, 2);
		const base = hex('water');
		let same = 0;
		for (const c of out) if (c === base) same++;
		expect(same / (T * T)).toBeGreaterThan(0.9);
	});

	it('stands grass tufts up, not on their side', () => {
		const w = world();
		w.living.plants.fill(1);
		const { out } = diamond(w.env, 2, 2);
		const dark = hex('leaf');
		// a tuft is a dark V: a dark pixel with a dark pixel up-left and up-right
		let tufts = 0;
		for (let y = 3; y < DIAMOND_H; y++)
			for (let x = 2; x < DIAMOND_W - 2; x++)
				if (
					out[y * DIAMOND_W + x] === dark &&
					out[(y - 1) * DIAMOND_W + x - 1] === dark &&
					out[(y - 1) * DIAMOND_W + x + 1] === dark
				)
					tufts++;
		expect(tufts).toBeGreaterThan(10);
	});
});

// finds the segment whose mouth sits on the east (x = 1) or west (x = 0) edge
function findMouth(segs: number[], x: number): number[] | null {
	for (let o = 0; o + 6 < segs.length; o += 7) {
		if (segs[o] === x && segs[o + 6] > 0) return [segs[o], segs[o + 1], segs[o + 6]];
	}
	return null;
}
