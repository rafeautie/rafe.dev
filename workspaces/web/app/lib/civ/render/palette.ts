import { SEA_LEVEL } from '../config';
import { Biome, Water, type MapLayers, type WorldMap } from '../types';

// Colors for the flat, minimal map. Everything here returns packed 0xRRGGBB
// numbers so the terrain image can be filled without allocating per tile.

type Living = Pick<WorldMap, 'plants' | 'wood'>;
type Rgb = readonly [number, number, number];

const hex = (value: number): Rgb => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

const BIOME: Record<number, Rgb> = {
	[Biome.ocean]: hex(0x3a6f9e),
	[Biome.coast]: hex(0xdccb9c),
	[Biome.grassland]: hex(0x9cc06b),
	[Biome.forest]: hex(0x6a9a55),
	[Biome.wetland]: hex(0x86a98a),
	[Biome.scrub]: hex(0xb7b56f),
	[Biome.hills]: hex(0xaaa774),
	[Biome.mountain]: hex(0x908d88),
	[Biome.snow]: hex(0xeff3f6)
};

// the sea gets darker the further it drops below sea level
const SEA_SHALLOW = hex(0x62a2c8);
const SEA_DEEP = hex(0x2c5f8d);
const LAKE = hex(0x6fb0d2);
const RIVER = hex(0x7bbbdc);
const SPRING = hex(0x93cde4);

const DRY = hex(0xb9a26c); // where plants are thin the ground shows through
const CANOPY = hex(0x2f5d3a); // where trees are thick

// A gentle push per season: multiply the color, then mix toward a tint.
// Water feels only a part of it so lakes don't turn gold in autumn.
const SEASON_TINT: { mul: Rgb; mix: Rgb; amount: number }[] = [
	{ mul: [0.98, 1.04, 0.99], mix: hex(0xb8e08a), amount: 0.08 }, // spring, fresh
	{ mul: [1.04, 1.02, 0.94], mix: hex(0xf2d27a), amount: 0.07 }, // summer, warm
	{ mul: [1.06, 0.97, 0.84], mix: hex(0xd29a42), amount: 0.2 }, // autumn, golden
	{ mul: [0.96, 0.99, 1.04], mix: hex(0xe9eff6), amount: 0.3 } // winter, pale and cool
];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// Brightness from the slope with the light coming from the north-west: ground
// that falls away toward the north-west faces the light, so it is brighter.
function hillShade(height: Float32Array, size: number, i: number): number {
	const x = i % size;
	const y = (i - x) / size;
	const nw = height[Math.max(0, y - 1) * size + Math.max(0, x - 1)];
	const se = height[Math.min(size - 1, y + 1) * size + Math.min(size - 1, x + 1)];
	return 1 + clamp((se - nw) * 7, -0.28, 0.28);
}

function pack(r: number, g: number, b: number): number {
	return (
		(clamp(Math.round(r), 0, 255) << 16) |
		(clamp(Math.round(g), 0, 255) << 8) |
		clamp(Math.round(b), 0, 255)
	);
}

// The color of one tile (without deposits, people or buildings). `season` is
// 0..3 as from config.season().
export function tileColor(i: number, layers: MapLayers, living: Living, season: number): number {
	const tint = SEASON_TINT[((season % 4) + 4) % 4];
	const water = layers.water[i];
	const biome = layers.biome[i];
	const isWater = water !== Water.none || biome === Biome.ocean;
	let r: number;
	let g: number;
	let b: number;
	let tintAmount = tint.amount;

	if (isWater) {
		let base: Rgb;
		if (water === Water.river) base = RIVER;
		else if (water === Water.lake) base = LAKE;
		else if (water === Water.spring) base = SPRING;
		else {
			const depth = clamp((SEA_LEVEL - layers.height[i]) / SEA_LEVEL, 0, 1);
			base = [
				SEA_SHALLOW[0] + (SEA_DEEP[0] - SEA_SHALLOW[0]) * depth,
				SEA_SHALLOW[1] + (SEA_DEEP[1] - SEA_SHALLOW[1]) * depth,
				SEA_SHALLOW[2] + (SEA_DEEP[2] - SEA_SHALLOW[2]) * depth
			];
		}
		[r, g, b] = base;
		tintAmount *= 0.4;
	} else {
		[r, g, b] = BIOME[biome] ?? BIOME[Biome.grassland];
		const leafy =
			biome === Biome.grassland ||
			biome === Biome.forest ||
			biome === Biome.scrub ||
			biome === Biome.hills ||
			biome === Biome.wetland;
		if (leafy) {
			const bare = (1 - clamp(living.plants[i], 0, 1)) * 0.32;
			r += (DRY[0] - r) * bare;
			g += (DRY[1] - g) * bare;
			b += (DRY[2] - b) * bare;
		}
		if (biome !== Biome.snow && biome !== Biome.mountain) {
			const trees = clamp(living.wood[i], 0, 1) * 0.6;
			r += (CANOPY[0] - r) * trees;
			g += (CANOPY[1] - g) * trees;
			b += (CANOPY[2] - b) * trees;
		}
		const shade = hillShade(layers.height, layers.size, i);
		r *= shade;
		g *= shade;
		b *= shade;
	}

	r = r * tint.mul[0] + (tint.mix[0] - r) * tintAmount;
	g = g * tint.mul[1] + (tint.mix[1] - g) * tintAmount;
	b = b * tint.mul[2] + (tint.mix[2] - b) * tintAmount;
	return pack(r, g, b);
}

// Village colors: mid-tone and saturated enough to read on green land and on
// dark backgrounds alike. People get a thin outline in draw.ts on top of this.
export const VILLAGE_COLORS = [
	'#d9534f',
	'#3b7dd8',
	'#e5a823',
	'#8e5bc2',
	'#1f9e89',
	'#e0689a',
	'#ef8a2a',
	'#5b6bbf'
] as const;

export const villageColor = (id: number): string =>
	VILLAGE_COLORS[((id % VILLAGE_COLORS.length) + VILLAGE_COLORS.length) % VILLAGE_COLORS.length];
