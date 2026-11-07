import { describe, expect, it } from 'vitest';
import { Biome, Built, Deposit, Ground, Water, type MapLayers } from '../types';
import { tileColor } from './palette';
import { fillTerrain, patchPixels } from './terrain';

const SIZE = 8;

function fake() {
	const n = SIZE * SIZE;
	const layers: MapLayers = {
		size: SIZE,
		height: new Float32Array(n).fill(0.5),
		moisture: new Float32Array(n).fill(0.5),
		ground: new Uint8Array(n).fill(Ground.loam),
		water: new Uint8Array(n).fill(Water.none),
		biome: new Uint8Array(n).fill(Biome.grassland),
		deposit: new Uint8Array(n).fill(Deposit.none)
	};
	const living = {
		plants: new Float32Array(n).fill(1),
		wood: new Float32Array(n),
		built: new Uint8Array(n)
	};
	return { layers, living };
}

const channels = (c: number) => [c >> 16, (c >> 8) & 255, c & 255];

describe('tileColor', () => {
	it('returns a valid packed color for every biome and season', () => {
		const { layers, living } = fake();
		for (const biome of Object.values(Biome)) {
			layers.biome[0] = biome;
			for (let season = 0; season < 4; season++) {
				const c = tileColor(0, layers, living, season);
				expect(c).toBeGreaterThanOrEqual(0);
				expect(c).toBeLessThanOrEqual(0xffffff);
			}
		}
	});

	it('makes the sea deeper (darker) than a lake', () => {
		const { layers, living } = fake();
		layers.biome[0] = Biome.ocean;
		layers.water[0] = Water.sea;
		layers.height[0] = 0.05;
		layers.biome[1] = Biome.coast;
		layers.water[1] = Water.lake;
		const sea = channels(tileColor(0, layers, living, 1));
		const lake = channels(tileColor(1, layers, living, 1));
		expect(sea[0] + sea[1] + sea[2]).toBeLessThan(lake[0] + lake[1] + lake[2]);
	});

	it('darkens forest with wood and browns it with fewer plants', () => {
		const { layers, living } = fake();
		const lush = channels(tileColor(0, layers, living, 1));
		living.wood[0] = 1;
		const dense = channels(tileColor(0, layers, living, 1));
		expect(dense[1]).toBeLessThan(lush[1]);
		living.wood[0] = 0;
		living.plants[0] = 0;
		const bare = channels(tileColor(0, layers, living, 1));
		expect(bare[1]).toBeLessThan(lush[1]);
	});

	it('lights slopes that face the north-west', () => {
		const { layers, living } = fake();
		// height rises toward the south-east around tile (3,3): faces the light
		layers.height[2 * SIZE + 2] = 0.4;
		layers.height[4 * SIZE + 4] = 0.6;
		const lit = channels(tileColor(3 * SIZE + 3, layers, living, 1));
		layers.height[2 * SIZE + 2] = 0.6;
		layers.height[4 * SIZE + 4] = 0.4;
		const dark = channels(tileColor(3 * SIZE + 3, layers, living, 1));
		expect(lit[1]).toBeGreaterThan(dark[1]);
	});

	it('looks different in winter than summer', () => {
		const { layers, living } = fake();
		expect(tileColor(0, layers, living, 3)).not.toBe(tileColor(0, layers, living, 1));
	});
});

describe('terrain pixels', () => {
	it('fills one opaque pixel per tile', () => {
		const { layers, living } = fake();
		const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
		fillTerrain(pixels, layers, living, 0);
		expect(pixels.length).toBe(SIZE * SIZE * 4);
		for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
		expect(pixels[0]).toBeGreaterThan(0);
	});

	it('patches only the changed tiles', () => {
		const { layers, living } = fake();
		const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
		fillTerrain(pixels, layers, living, 0);
		const before = pixels.slice();
		patchPixels(pixels, layers, living, [{ i: 10, plants: 0, wood: 1, built: Built.hut }], 0);
		expect(living.built[10]).toBe(Built.hut);
		for (let i = 0; i < SIZE * SIZE; i++) {
			const same = [0, 1, 2].every((k) => pixels[i * 4 + k] === before[i * 4 + k]);
			expect(same).toBe(i !== 10);
		}
	});
});
