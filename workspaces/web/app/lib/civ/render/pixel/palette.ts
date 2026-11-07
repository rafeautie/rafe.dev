// One shared palette for every sprite and tile, so the whole world reads as
// one piece of pixel art. Sprites name colours from here; nothing else
// invents a colour. Muted, earthy, with a few bright accents (fire, berries,
// copper) so important things pop.

export const PALETTE = {
	// darks and outlines
	ink: '#1b1a24',
	shadow: '#2c2a3a',
	// greys and stone
	stoneDark: '#4a4b57',
	stone: '#73747e',
	stoneLight: '#a3a4a8',
	chalk: '#d8d4c4',
	white: '#f2efe6',
	// earth
	soilDark: '#4a3326',
	soil: '#6b4a32',
	soilLight: '#8e6a46',
	clay: '#b0663e',
	sand: '#d8c48e',
	sandLight: '#e9dcae',
	// greens
	leafDark: '#24452f',
	leaf: '#3c6b3c',
	grass: '#5f8f43',
	grassLight: '#8db557',
	moss: '#7a8f4a',
	// autumn and dry
	gold: '#d9a63e',
	orange: '#c96a2b',
	rust: '#8f3f26',
	straw: '#c9b061',
	// water and ice
	deep: '#24476b',
	water: '#3b6f9c',
	waterLight: '#6aa2c6',
	foam: '#cfe6ee',
	ice: '#b9d6e2',
	// wood
	barkDark: '#3e2a1f',
	bark: '#5e3f2a',
	wood: '#8a6240',
	// accents
	fire: '#f2a33a',
	flame: '#f6d55c',
	ember: '#d9502e',
	berry: '#b8324a',
	blossom: '#efc3d0',
	copper: '#3f9e86',
	tin: '#b9c3cc',
	ochre: '#c8782c',
	obsidian: '#22202e',
	// skin tones
	skin1: '#f0c9a4',
	skin2: '#d9a477',
	skin3: '#b37c52',
	skin4: '#8a5a37',
	skin5: '#5e3b24',
	// hair
	hairBlack: '#221d1b',
	hairBrown: '#5a3a24',
	hairRed: '#9a4426',
	hairBlond: '#d2b26c',
	hairGrey: '#b8b6b0'
} as const;

export type ColorName = keyof typeof PALETTE;

// Village colours for clothing, readable on every ground.
export const VILLAGE_CLOTH = ['#c0503c', '#3f78b5', '#d3a33b', '#7b4f9e', '#3e9a6a', '#c46a9a'];
