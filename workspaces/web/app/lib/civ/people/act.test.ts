import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { Built, Water, type Person, type World } from '../types';
import { createWorld } from '../sim/world';
import { act, endActivity, startActivity, teachable, walkToward } from './act';
import { countOf, tileIndex, walkable } from './village';

function setup(seed = 2) {
	const { world } = createWorld(seed);
	const p = world.people[2];
	const camp = world.villages[0];
	p.x = camp.x;
	p.y = camp.y;
	return { world, p, camp, rng: new Rng(seed) };
}

const tick = (world: World, rng: Rng, p: Person, n: number, changes = new Set<number>()) => {
	for (let i = 0; i < n; i++) act(world, rng, p, changes);
	return changes;
};

describe('walking', () => {
	it('goes at most WALK_TILES_PER_TICK a tick', () => {
		const { world, p } = setup();
		const x = p.x;
		const y = p.y;
		walkToward(world, p, x + 40, y, 0.9);
		expect(Math.hypot(p.x - x, p.y - y)).toBeLessThanOrEqual(6.01);
	});

	it('goes around a lake instead of through it', () => {
		const { world, p } = setup();
		const { map } = world;
		const cx = Math.floor(p.x);
		const cy = Math.floor(p.y);
		// clear a patch of dry land and wall it with a lake
		for (let dy = -14; dy <= 14; dy++) {
			for (let dx = -14; dx <= 14; dx++) {
				const i = tileIndex(map, cx + dx, cy + dy);
				map.water[i] = Water.none;
				map.biome[i] = 2;
			}
		}
		for (let dy = -8; dy <= 8; dy++) map.water[tileIndex(map, cx + 4, cy + dy)] = Water.lake;
		p.x = cx + 0.5;
		p.y = cy + 0.5;
		let state = 'moving';
		for (let i = 0; i < 20 && state === 'moving'; i++) {
			state = walkToward(world, p, cx + 10.5, cy + 0.5, 0.9);
			expect(walkable(map, tileIndex(map, p.x, p.y))).toBe(true);
		}
		expect(state).toBe('there');
	});
});

describe('deeds', () => {
	it('foraging takes from the plants and marks the tile changed', () => {
		const { world, p, rng } = setup();
		const { map } = world;
		const i = tileIndex(map, p.x + 3, p.y);
		// make sure it is somewhere with something to eat
		map.biome[i] = 3;
		map.water[i] = Water.none;
		map.plants[i] = 0.9;
		startActivity(p, 'forage', (i % map.size) + 0.5, Math.floor(i / map.size) + 0.5, 1);
		p.needs.food = 0.2;
		const changes = tick(world, rng, p, 3);
		expect(map.plants[i]).toBeLessThan(0.9);
		expect(changes.has(i)).toBe(true);
		const food = p.carrying.length + (p.needs.food > 0.2 ? 1 : 0);
		expect(food).toBeGreaterThan(0);
	});

	it('hunting a herd brings meat, hide and bone, and the herd shrinks', () => {
		const { world, p, rng } = setup();
		const herd = world.herds.find((h) => h.kind === 'deer');
		expect(herd).toBeTruthy();
		if (!herd) return;
		herd.x = p.x + 1;
		herd.y = p.y;
		herd.count = 50;
		p.skills.hunting = 1;
		p.traits.bold = 1;
		let meat = 0;
		for (let n = 0; n < 12; n++) {
			p.x = herd.x;
			p.y = herd.y;
			startActivity(p, 'hunt', herd.x, herd.y, 1, { with: herd.id });
			act(world, rng, p, new Set());
			meat = countOf(p.carrying, 'raw-meat');
		}
		expect(meat).toBeGreaterThan(0);
		expect(herd.count).toBeLessThan(50);
		expect(countOf(p.carrying, 'hide')).toBeGreaterThan(0);
	});

	it('hunting goats, wolves and aurochs sometimes yields a young animal', () => {
		const { world, p, rng } = setup();
		const herd = { id: 99, kind: 'goat', x: p.x, y: p.y, count: 500, tame: false };
		world.herds.push(herd);
		p.skills.hunting = 1;
		for (let n = 0; n < 150; n++) {
			startActivity(p, 'hunt', herd.x, herd.y, 1, { with: 99 });
			p.x = herd.x;
			p.y = herd.y;
			p.health = 1;
			act(world, rng, p, new Set());
		}
		expect(countOf(p.carrying, 'kid')).toBeGreaterThan(0);
	});

	it('gathering from a deposit uses it up', () => {
		const { world, p, rng } = setup();
		const { map } = world;
		const i = tileIndex(map, p.x + 2, p.y);
		map.deposit[i] = 1;
		map.depositLeft[i] = 3;
		map.water[i] = Water.none;
		startActivity(p, 'gather', (i % map.size) + 0.5, Math.floor(i / map.size) + 0.5, 1);
		world.villages[0].store.push({ material: 'wood', count: 20 }); // wants flint first
		tick(world, rng, p, 2);
		expect(
			countOf(p.carrying, 'flint') + countOf(world.villages[0].store, 'flint')
		).toBeGreaterThan(0);
		expect(map.depositLeft[i]).toBeLessThan(3);
	});

	it('leaves surplus at camp but keeps a little food', () => {
		const { world, p, camp, rng } = setup();
		p.carrying = [
			{ material: 'nuts', count: 6 },
			{ material: 'flint', count: 2 }
		];
		startActivity(p, 'wander', p.x, p.y, 1);
		act(world, rng, p, new Set());
		expect(countOf(camp.store, 'flint')).toBe(2);
		expect(countOf(p.carrying, 'nuts')).toBe(2);
		expect(countOf(camp.store, 'nuts')).toBe(4);
	});

	it('talking raises affection and teaching moves a learner toward the teacher', () => {
		const { world, p, rng } = setup();
		const other = world.people[3];
		other.x = p.x + 1;
		other.y = p.y;
		p.knowledge['fire-making'] = 0.8;
		expect(teachable(p, other)).toBe('fire-making');
		const before = p.relations[other.id]?.affection ?? 0;
		for (let n = 0; n < 12; n++) {
			startActivity(p, 'teach', other.x, other.y, 1, { with: other.id });
			act(world, rng, p, new Set());
		}
		expect(p.relations[other.id].affection).toBeGreaterThan(before);
		expect(other.knowledge['fire-making']).toBeGreaterThan(0);
		expect(other.knowledge['fire-making']).toBeLessThanOrEqual(0.8);
	});

	it('praying leaves a prayer in the chronicle, but not again at once', () => {
		const { world, p, rng } = setup();
		startActivity(p, 'pray', p.x, p.y, 1);
		act(world, rng, p, new Set());
		startActivity(p, 'pray', p.x, p.y, 1);
		act(world, rng, p, new Set());
		expect(world.chronicle.filter((e) => e.kind === 'prayer')).toHaveLength(1);
	});
});

describe('crafting', () => {
	it('gathers what it needs, then tries it at camp, and learns on success', () => {
		const { world, p, camp, rng } = setup();
		// plenty of flint and stone in the store
		camp.store.push({ material: 'flint', count: 4 }, { material: 'river-stone', count: 4 });
		p.skills.crafting = 1;
		let learned = false;
		for (let n = 0; n < 30 && !learned; n++) {
			p.carrying = [];
			startActivity(p, 'craft', camp.x, camp.y, 8, {
				craft: { action: 'strike', items: ['flint', 'river-stone'] }
			});
			tick(world, rng, p, 4);
			learned = (p.knowledge.knapping ?? 0) > 0;
			endActivity(p);
		}
		expect(learned).toBe(true);
		expect(countOf(p.carrying, 'flake')).toBeGreaterThan(0);
		expect(world.chronicle.some((e) => e.kind === 'first' && /sharp|flakes/.test(e.text))).toBe(
			true
		);
		expect(camp.customs).toContain('first:knapping');
	});

	it('onlookers pick up a little of a craft', () => {
		const { world, p, camp, rng } = setup();
		const watcher = world.people[3];
		watcher.x = p.x + 1;
		watcher.y = p.y;
		watcher.activity.kind = 'wander';
		camp.store.push({ material: 'flint', count: 40 }, { material: 'river-stone', count: 40 });
		for (let n = 0; n < 30; n++) {
			p.carrying = [];
			startActivity(p, 'craft', camp.x, camp.y, 8, {
				craft: { action: 'strike', items: ['flint', 'river-stone'] }
			});
			tick(world, rng, p, 3);
			if ((p.knowledge.knapping ?? 0) > 0) break;
		}
		expect(watcher.knowledge.knapping ?? 0).toBeGreaterThan(0);
	});

	it('products that are places become buildings, and taming makes a herd', () => {
		const { world, p, camp, rng } = setup();
		p.skills.building = 1;
		camp.store.push(
			{ material: 'branch', count: 60 },
			{ material: 'grass', count: 60 },
			{ material: 'kid', count: 40 },
			{ material: 'roots', count: 40 },
			{ material: 'flake', count: 2 }
		);
		p.knowledge.shelter = 1;
		p.knowledge.herding = 1;
		for (let n = 0; n < 40; n++) {
			startActivity(p, 'craft', camp.x, camp.y, 8, {
				craft: { action: 'build', items: ['flake', 'branch', 'branch', 'grass'] }
			});
			tick(world, rng, p, 3);
			startActivity(p, 'craft', camp.x, camp.y, 8, {
				craft: { action: 'tame', items: ['kid', 'roots'] }
			});
			tick(world, rng, p, 3);
		}
		expect(camp.customs).toContain('shelter');
		const huts = world.map.built.filter((b) => b === Built.hut).length;
		expect(huts).toBeGreaterThan(0);
		expect(world.herds.some((h) => h.tame && h.kind === 'goat')).toBe(true);
	});

	it('gives up when the materials cannot be had', () => {
		const { world, p, camp, rng } = setup();
		startActivity(p, 'craft', camp.x, camp.y, 8, {
			craft: { action: 'heat', items: ['tin-ore', 'charcoal'] }
		});
		tick(world, rng, p, 3);
		expect(p.activity.kind).toBe('idle');
	});
});
