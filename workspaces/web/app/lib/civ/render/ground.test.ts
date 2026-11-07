import { describe, expect, it } from 'vitest';
import { Biome, Built, Ground, Water } from '../types';
import { channelMask, drawGround, paintTile, riverChannel, tileSig, waterAt } from './ground';
import { viewOf, type DrawState } from './scene';
import { Camera } from './camera';
import { PALETTE } from './pixel/palette';

const T = 240;

describe('drawGround', () => {
	it('does nothing (and touches no canvas) when zoomed out', () => {
		const camera = new Camera();
		camera.zoom = 5;
		const state = { camera, layers: { size: 8 } } as unknown as DrawState;
		const view = viewOf(state);
		expect(view.detail).toBe(0);
		// a context that explodes if used
		const ctx = new Proxy(
			{},
			{
				get: () => {
					throw new Error('used');
				}
			}
		) as CanvasRenderingContext2D;
		expect(() => drawGround(ctx, state, view)).not.toThrow();
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
	return { size, layers, living, env: { layers, living, villages: [], season } };
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
		w.layers.ground[2 * 6 + 1] = Ground.sand;
		w.layers.ground[2 * 6 + 2] = Ground.rock;
		w.layers.ground[2 * 6 + 3] = Ground.clay;
		const means = [0, 1, 2, 3].map(mean);
		for (let i = 0; i < 4; i++)
			for (let j = i + 1; j < 4; j++) {
				const d = Math.hypot(...means[i].map((v, k) => v - means[j][k]));
				expect(d).toBeGreaterThan(25);
			}
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
		w.layers.ground[2 * 6 + 3] = Ground.rock;
		const plain = paint(world().env, 2, 2).out;
		const next = paint(w.env, 2, 2).out;
		// only the strip beside the rock tile (the east edge) differs
		let diffEast = 0;
		let diffMiddle = 0;
		for (let y = 0; y < T; y++) {
			for (let x = 0; x < T; x++) {
				if (plain[y * T + x] === next[y * T + x]) continue;
				if (x >= T - 14) diffEast++;
				else diffMiddle++;
			}
		}
		expect(diffEast).toBeGreaterThan(200);
		expect(diffMiddle).toBe(0);
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

	it('changes when a new building adds a track across the tile', () => {
		const w = world();
		w.env.villages = [{ x: 1, y: 2 } as never];
		const a = tileSig(w.env, 2, 2);
		w.living.built[2 * 6 + 4] = Built.hut;
		expect(tileSig(w.env, 2, 2)).not.toBe(a);
	});
});

// finds the segment whose mouth sits on the east (x = 1) or west (x = 0) edge
function findMouth(segs: number[], x: number): number[] | null {
	for (let o = 0; o + 6 < segs.length; o += 7) {
		if (segs[o] === x && segs[o + 6] > 0) return [segs[o], segs[o + 1], segs[o + 6]];
	}
	return null;
}
