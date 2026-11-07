// The shapes every part of the simulation agrees on: the map, people, herds,
// villages, the chronicle, and the messages between the page and the
// simulation worker. Modules own their logic; this file owns the contracts.

import type { RngState } from './rng';
import type { Speed } from './config';

// ---------------------------------------------------------------- the map

// What the ground is made of; decides what can be dug up and what grows
export const Ground = {
	sand: 0,
	loam: 1,
	clay: 2,
	rock: 3,
	chalk: 4,
	bog: 5
} as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export const Water = {
	none: 0,
	sea: 1,
	lake: 2,
	river: 3,
	spring: 4
} as const;
export type Water = (typeof Water)[keyof typeof Water];

export const Biome = {
	ocean: 0,
	coast: 1,
	grassland: 2,
	forest: 3,
	wetland: 4,
	scrub: 5,
	hills: 6,
	mountain: 7,
	snow: 8
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];

// Things worth finding in the ground. Placed by geology (flint in chalk,
// clay by rivers, copper in hills, tin rare and far, bog iron in wetlands).
export const Deposit = {
	none: 0,
	flint: 1,
	clay: 2,
	copper: 3,
	tin: 4,
	bogIron: 5,
	obsidian: 6,
	salt: 7,
	ochre: 8,
	meteorite: 9
} as const;
export type Deposit = (typeof Deposit)[keyof typeof Deposit];

// Tile layers as flat arrays, index = y * size + x. The first group is fixed
// once generated; the second changes as the world lives.
export type WorldMap = {
	size: number;
	seed: number;
	height: Float32Array; // 0..1, below SEA_LEVEL is sea
	moisture: Float32Array; // 0..1
	temperature: Float32Array; // mean yearly °C
	ground: Uint8Array; // Ground
	water: Uint8Array; // Water
	biome: Uint8Array; // Biome
	deposit: Uint8Array; // Deposit
	// living layers
	fertility: Float32Array; // 0..1, worn down by farming, raised by floods
	plants: Float32Array; // 0..1, edible wild plants ready to gather
	wood: Float32Array; // 0..1, tree cover
	depositLeft: Uint16Array; // units left to take from `deposit`
	built: Uint8Array; // Built, what people have made on the tile
};

export const Built = {
	none: 0,
	camp: 1,
	hut: 2,
	field: 3,
	kiln: 4,
	pen: 5,
	shrine: 6,
	store: 7,
	furnace: 8
} as const;
export type Built = (typeof Built)[keyof typeof Built];

// The layers the page needs to draw the land, sent once (fixed) and then as
// changes (living).
export type MapLayers = Pick<
	WorldMap,
	'size' | 'height' | 'moisture' | 'ground' | 'water' | 'biome' | 'deposit'
>;
export type TileChange = { i: number; plants: number; wood: number; built: Built };

// --------------------------------------------------------------- materials

// Materials, made things and know-how are named by string ids defined in the
// discovery tables (lib/civ/discovery). `flint`, `clay`, `flake`, `pot`...
export type MaterialId = string;
// a technique someone can know: `knapping`, `fire-making`, `pottery`...
export type KnowledgeId = string;

export type Stack = { material: MaterialId; count: number };

// ------------------------------------------------------------------ people

export const NEEDS = [
	'food',
	'water',
	'rest',
	'warmth',
	'safety',
	'company',
	'respect',
	'curiosity'
] as const;
export type Need = (typeof NEEDS)[number];

export const TRAITS = ['curious', 'bold', 'kind', 'stubborn', 'patient', 'social'] as const;
export type Trait = (typeof TRAITS)[number];

// what a person is naturally good at
export const KNACKS = ['hands', 'nature', 'words', 'people'] as const;
export type Knack = (typeof KNACKS)[number];

export const SKILLS = [
	'foraging',
	'hunting',
	'crafting',
	'building',
	'farming',
	'herding',
	'healing',
	'talking',
	'leading'
] as const;
export type Skill = (typeof SKILLS)[number];

// What a person is doing this tick. Life activities are handled by the
// people module; `craft` runs an attempt through the discovery engine.
export type ActivityKind =
	| 'idle'
	| 'sleep'
	| 'walk'
	| 'forage'
	| 'drink'
	| 'eat'
	| 'hunt'
	| 'fish'
	| 'gather' // take material from a deposit, wood or reeds
	| 'craft'
	| 'build'
	| 'socialize'
	| 'teach'
	| 'care' // tend a child or the sick
	| 'pray'
	| 'wander'
	| 'flee';

export type Activity = {
	kind: ActivityKind;
	// where it happens, in tiles
	x: number;
	y: number;
	// who it's with, for socialize/teach/care
	with?: number;
	// for craft: what is being tried (an action from the discovery engine)
	craft?: { action: string; items: MaterialId[] };
	// ticks left
	left: number;
};

export type Memory = { day: number; text: string; weight: number };

export type Relation = { trust: number; affection: number };

export type Person = {
	id: number;
	name: string;
	sex: 'f' | 'm';
	born: number; // day
	died?: number; // day
	cause?: string;
	// position in tiles; fractional while walking
	x: number;
	y: number;
	village: number;
	mother?: number;
	father?: number;
	partner?: number;
	// body, 0..1 (1 = fine)
	health: number;
	// needs, 0..1 (1 = fully met)
	needs: Record<Need, number>;
	traits: Record<Trait, number>;
	knack: Knack;
	skills: Record<Skill, number>;
	// know-how and how well, 0..1
	knowledge: Record<KnowledgeId, number>;
	// materials met so far, with how often handled (raises insight odds)
	seen: Record<MaterialId, number>;
	carrying: Stack[];
	memories: Memory[];
	relations: Record<number, Relation>;
	activity: Activity;
	// gets the model's attention (leaders, elders, makers, the curious, followed)
	notable: boolean;
	// a goal set by the model each season, in their words, and its tag
	goal?: { text: string; tag: string; until: number };
};

// ----------------------------------------------------------------- animals

export type Herd = {
	id: number;
	kind: string; // from the animal table: deer, aurochs, boar, goat, wolf...
	x: number;
	y: number;
	count: number;
	tame: boolean;
	village?: number; // the village that keeps it, when tame
};

// ---------------------------------------------------------------- villages

export type Village = {
	id: number;
	name: string;
	// the camp or village centre, in tiles
	x: number;
	y: number;
	founded: number; // day
	leader?: number;
	// shared stores at camp
	store: Stack[];
	// the hottest heat source anyone here can make, °C
	heat: number;
	customs: string[];
};

// --------------------------------------------------------------- chronicle

export type ChronicleKind =
	| 'birth'
	| 'death'
	| 'discovery'
	| 'first' // a first for the village: first fire, first pot
	| 'pairing'
	| 'conflict'
	| 'split'
	| 'prayer'
	| 'belief'
	| 'arrival'
	| 'season'
	| 'note';

export type ChronicleEvent = {
	day: number;
	kind: ChronicleKind;
	text: string;
	// people involved, for "follow" links
	people?: number[];
	// worth stopping for
	standout?: boolean;
};

// --------------------------------------------------------------- the world

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'drought' | 'snow' | 'cold';

export type World = {
	map: WorldMap;
	tick: number;
	people: Person[]; // the living and the dead (dead keep `died`)
	herds: Herd[];
	villages: Village[];
	weather: WeatherKind;
	chronicle: ChronicleEvent[];
	nextId: number;
	rng: RngState;
};

// -------------------------------------------- page <-> simulation worker

// What the page draws for each living person every frame
export type PersonView = {
	id: number;
	name: string;
	x: number;
	y: number;
	sex: 'f' | 'm';
	child: boolean;
	activity: ActivityKind;
	village: number;
};

export type HerdView = Pick<Herd, 'id' | 'kind' | 'x' | 'y' | 'count' | 'tame'>;

export type SimRequest =
	| { type: 'start'; seed: number }
	| { type: 'speed'; speed: Speed }
	| { type: 'follow'; id: number | null };

export type SimResponse =
	| { type: 'map'; layers: MapLayers; living: Pick<WorldMap, 'plants' | 'wood' | 'built'> }
	| {
			type: 'frame';
			tick: number;
			weather: WeatherKind;
			people: PersonView[];
			herds: HerdView[];
			villages: Pick<Village, 'id' | 'name' | 'x' | 'y'>[];
			tiles: TileChange[];
			events: ChronicleEvent[];
			// the whole record of the person being followed, if any
			followed?: Person;
	  };
