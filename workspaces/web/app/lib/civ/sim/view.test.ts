import { describe, expect, it } from 'vitest';
import { Built } from '../types';
import { createWorld } from './world';
import { die } from '../people/life';
import { createViewState, frameMessage, mapMessage } from './view';

describe('view', () => {
	it('sends the fixed layers once with copies of the living ones', () => {
		const { world } = createWorld(2);
		const message = mapMessage(world);
		expect(message.layers.size).toBe(world.map.size);
		expect(message.living.plants).not.toBe(world.map.plants);
		expect(message.living.plants[100]).toBe(world.map.plants[100]);
	});

	it('posts only the living, and the followed person even once dead', () => {
		const { world } = createWorld(2);
		const state = createViewState(world);
		const doomed = world.people[1];
		die(world, doomed, 'sickness');
		state.followed = doomed.id;
		const frame = frameMessage(world, state, new Set());
		expect(frame.people.some((p) => p.id === doomed.id)).toBe(false);
		expect(frame.people).toHaveLength(world.people.length - 1);
		expect(frame.followed?.id).toBe(doomed.id);
		expect(frame.villages.map((v) => v.name)).toEqual([world.villages[0].name]);
		const child = frame.people.find((p) => p.child);
		expect(child).toBeTruthy();
	});

	it('sends new chronicle events once', () => {
		const { world } = createWorld(2);
		const state = createViewState(world);
		const first = frameMessage(world, state, new Set());
		expect(first.events.length).toBeGreaterThan(0);
		expect(frameMessage(world, state, new Set()).events).toHaveLength(0);
	});

	it('sends only tiles that moved enough, and clears the set', () => {
		const { world } = createWorld(2);
		const state = createViewState(world);
		const changes = new Set([10, 11, 12]);
		world.map.plants[10] += 0.01;
		world.map.plants[11] = Math.min(1, world.map.plants[11] + 0.5);
		if (world.map.plants[11] === state.plants[11]) world.map.plants[11] = 0;
		world.map.built[12] = Built.hut;
		const frame = frameMessage(world, state, changes);
		expect(frame.tiles.map((t) => t.i).sort()).toEqual([11, 12]);
		expect(changes.size).toBe(0);
		expect(frame.tiles.find((t) => t.i === 12)?.built).toBe(Built.hut);
	});
});
