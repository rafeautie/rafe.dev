// What the page sees of the world: the map once, then a frame at a time with
// only the living, the tiles that changed since the last frame, and the new
// chronicle entries.

import { ADULT_AGE, ELDER_AGE } from '../config';
import type {
	HerdView,
	PersonView,
	SimResponse,
	TileChange,
	Village,
	World,
	WorldMap
} from '../types';
import { ageOf, isAlive } from '../people/village';

// a tile's plants or trees must move this much before the page hears of it
const SHOW_DELTA = 0.04;

export type ViewState = {
	// chronicle entries already sent
	sentEvents: number;
	followed: number | null;
	// what the page has been told about each living layer
	plants: Float32Array;
	wood: Float32Array;
	built: Uint8Array;
};

export function createViewState(world: World): ViewState {
	return {
		sentEvents: 0,
		followed: null,
		plants: Float32Array.from(world.map.plants),
		wood: Float32Array.from(world.map.wood),
		built: Uint8Array.from(world.map.built)
	};
}

export function mapMessage(world: World): Extract<SimResponse, { type: 'map' }> {
	const m = world.map;
	return {
		type: 'map',
		layers: {
			size: m.size,
			height: m.height,
			moisture: m.moisture,
			ground: m.ground,
			biome: m.biome,
			water: m.water,
			deposit: m.deposit
		},
		living: {
			plants: Float32Array.from(m.plants),
			wood: Float32Array.from(m.wood),
			built: Uint8Array.from(m.built)
		}
	};
}

export function personViews(world: World): PersonView[] {
	const out: PersonView[] = [];
	for (const p of world.people) {
		if (!isAlive(p)) continue;
		out.push({
			id: p.id,
			name: p.name,
			x: p.x,
			y: p.y,
			sex: p.sex,
			child: ageOf(world, p) < ADULT_AGE,
			elder: ageOf(world, p) >= ELDER_AGE,
			activity: p.activity.kind,
			carrying: p.carrying[0]?.material,
			village: p.village
		});
	}
	return out;
}

export function herdViews(world: World): HerdView[] {
	return world.herds
		.filter((h) => h.count > 0)
		.map((h) => ({ id: h.id, kind: h.kind, x: h.x, y: h.y, count: h.count, tame: h.tame }));
}

// only villages someone still lives in
export function villageViews(world: World): Pick<Village, 'id' | 'name' | 'x' | 'y'>[] {
	const alive = new Set(world.people.filter(isAlive).map((p) => p.village));
	return world.villages
		.filter((v) => alive.has(v.id))
		.map((v) => ({ id: v.id, name: v.name, x: v.x, y: v.y }));
}

// The tiles in `changes` that differ enough from what the page was told.
// Clears the set.
export function tileChanges(map: WorldMap, state: ViewState, changes: Set<number>): TileChange[] {
	const out: TileChange[] = [];
	for (const i of changes) {
		const plants = map.plants[i];
		const wood = map.wood[i];
		const built = map.built[i];
		if (
			Math.abs(plants - state.plants[i]) < SHOW_DELTA &&
			Math.abs(wood - state.wood[i]) < SHOW_DELTA &&
			built === state.built[i]
		) {
			continue;
		}
		state.plants[i] = plants;
		state.wood[i] = wood;
		state.built[i] = built;
		out.push({ i, plants, wood, built: built as TileChange['built'] });
	}
	changes.clear();
	return out;
}

export function frameMessage(
	world: World,
	state: ViewState,
	changes: Set<number>
): Extract<SimResponse, { type: 'frame' }> {
	const events = world.chronicle.slice(state.sentEvents);
	state.sentEvents = world.chronicle.length;
	const followed =
		state.followed === null ? undefined : world.people.find((p) => p.id === state.followed);
	return {
		type: 'frame',
		tick: world.tick,
		weather: world.weather,
		people: personViews(world),
		herds: herdViews(world),
		villages: villageViews(world),
		tiles: tileChanges(world.map, state, changes),
		events,
		followed
	};
}
