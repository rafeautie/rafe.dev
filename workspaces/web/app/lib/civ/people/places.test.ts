import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createWorld } from '../sim/world';
import { Water } from '../types';
import { featureAt, namePlaces, NAME_GAP_DAYS, PLACES_MAX } from './places';
import { isAlive } from './village';

// a tile with something worth naming, as a person's position
function notableSpot(world: ReturnType<typeof createWorld>['world']) {
	const { map } = world;
	for (let i = 0; i < map.water.length; i++) {
		if (map.water[i] === Water.river && featureAt(map, i) === 'ford') {
			return { x: (i % map.size) + 0.5, y: Math.floor(i / map.size) + 0.5 };
		}
	}
	throw new Error('no river in this world');
}

describe('naming places', () => {
	it('names a notable spot where someone stands, with a note in the chronicle', () => {
		const { world } = createWorld(2);
		const rng = new Rng(5);
		const spot = notableSpot(world);
		for (const p of world.people) Object.assign(p, spot);
		for (let n = 0; n < 40000 && world.places.length === 0; n++) namePlaces(world, rng);
		expect(world.places.length).toBe(1);
		const place = world.places[0];
		expect(place.name).toMatch(/^[A-Z][a-z]+ (Ford|Bend)$/);
		const note = world.chronicle.at(-1);
		expect(note?.kind).toBe('note');
		expect(note?.text).toContain(place.name);
		expect(note?.text).toContain(' named ');
	});

	it('is rare: a second place waits, keeps its distance, and the list stays small', () => {
		const { world } = createWorld(2);
		const rng = new Rng(5);
		const spot = notableSpot(world);
		for (const p of world.people) Object.assign(p, spot);
		for (let n = 0; n < 40000 && world.places.length === 0; n++) namePlaces(world, rng);
		// the same spot again, straight away or later, is not named twice
		for (let n = 0; n < 5000; n++) namePlaces(world, rng);
		expect(world.places.length).toBe(1);
		world.tick += NAME_GAP_DAYS * 4 * 2;
		for (let n = 0; n < 5000; n++) namePlaces(world, rng);
		expect(world.places.length).toBe(1);
		expect(world.people.some(isAlive)).toBe(true);
		expect(PLACES_MAX).toBeLessThanOrEqual(16);
	});
});
