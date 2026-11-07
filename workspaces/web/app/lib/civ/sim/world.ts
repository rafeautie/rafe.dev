// Making a new world: the map, the first camp by the river, the band, and
// the animals around them.

import { Rng } from '../rng';
import { generateWorld, findStart } from '../world/generate';
import { Biome, Built, Water, type Herd, type Village, type World } from '../types';
import { createBand } from '../people/create';
import { villageName } from '../people/names';
import { dayOf, dist, record, walkable } from '../people/village';

// How many herds of each kind to place, and where they like to be
const HERD_PLANS: {
	kind: string;
	herds: [number, number];
	size: [number, number];
	biomes: Biome[];
}[] = [
	{ kind: 'deer', herds: [3, 3], size: [6, 10], biomes: [Biome.grassland, Biome.forest] },
	{ kind: 'aurochs', herds: [2, 2], size: [4, 6], biomes: [Biome.grassland] },
	{ kind: 'boar', herds: [2, 2], size: [3, 5], biomes: [Biome.forest, Biome.scrub] },
	{ kind: 'goat', herds: [2, 2], size: [4, 8], biomes: [Biome.hills] },
	{ kind: 'wolf', herds: [1, 2], size: [3, 4], biomes: [Biome.forest, Biome.scrub, Biome.hills] }
];

function placeHerds(world: World, rng: Rng, camp: Village) {
	const { map } = world;
	for (const plan of HERD_PLANS) {
		const n = rng.int(plan.herds[0], plan.herds[1]);
		// hills can be far, so goats look further afield
		const far = plan.kind === 'goat' ? 100 : plan.kind === 'wolf' ? 85 : 65;
		const near = plan.kind === 'wolf' ? 30 : 14;
		for (let k = 0; k < n; k++) {
			for (let tries = 0; tries < 400; tries++) {
				const x = rng.int(0, map.size - 1);
				const y = rng.int(0, map.size - 1);
				const d = dist(x, y, camp.x, camp.y);
				if (d < near || d > far) continue;
				const i = y * map.size + x;
				if (!walkable(map, i) || map.water[i] !== Water.none) continue;
				if (!plan.biomes.includes(map.biome[i] as Biome)) continue;
				const herd: Herd = {
					id: world.herds.length + 1,
					kind: plan.kind,
					x,
					y,
					count: rng.int(plan.size[0], plan.size[1]),
					tame: false
				};
				world.herds.push(herd);
				break;
			}
		}
	}
}

export function makeVillage(world: World, rng: Rng, x: number, y: number): Village {
	const village: Village = {
		id: world.villages.length,
		name: villageName(rng),
		x,
		y,
		founded: dayOf(world),
		store: [],
		heat: 0,
		customs: []
	};
	world.villages.push(village);
	world.map.built[y * world.map.size + x] = Built.camp;
	return village;
}

export function createWorld(seed: number): { world: World; rng: Rng } {
	const rng = new Rng(seed ^ 0x51ed);
	const map = generateWorld(seed);
	const start = findStart(map, seed);
	const world: World = {
		map,
		tick: 0,
		people: [],
		herds: [],
		villages: [],
		places: [],
		weather: 'clear',
		chronicle: [],
		nextId: 1,
		rng: rng.state()
	};
	const camp = makeVillage(world, rng, start.x, start.y);
	const band = createBand(world, rng, camp);
	placeHerds(world, rng, camp);
	record(world, {
		kind: 'arrival',
		text: `A band of ${band.length} people made camp by the river and named it ${camp.name}.`,
		people: band.map((p) => p.id),
		standout: true
	});
	world.rng = rng.state();
	return { world, rng };
}
