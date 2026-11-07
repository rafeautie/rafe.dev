import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { createWorld } from '../sim/world';
import { decideIdea, maybeInsight, updateVillageHeat } from './insight';
import { ageOf } from './village';
import { ADULT_AGE } from '../config';

// a generator that always has the idea
class Lucky extends Rng {
	override chance(): boolean {
		return true;
	}
}

function setup() {
	const { world } = createWorld(2);
	const p = world.people.find((o) => ageOf(world, o) >= ADULT_AGE);
	if (!p) throw new Error('no adult');
	const camp = world.villages[0];
	p.x = camp.x;
	p.y = camp.y;
	return { world, p, camp };
}

describe('insight', () => {
	it('can start an experiment as a craft activity', () => {
		const { world, p } = setup();
		let started = false;
		for (let n = 0; n < 8 && !started; n++) {
			started = maybeInsight(world, new Lucky(n + 1), p);
		}
		expect(started).toBe(true);
		expect(p.activity.kind).toBe('craft');
		expect(p.activity.craft?.items.length).toBeGreaterThan(0);
	});

	it('is rare for an ordinary day', () => {
		const { world, p } = setup();
		const rng = new Rng(11);
		let hits = 0;
		for (let n = 0; n < 400; n++) {
			if (maybeInsight(world, rng, p)) hits++;
			p.activity = { kind: 'idle', x: p.x, y: p.y, left: 0 };
		}
		expect(hits).toBeGreaterThan(0);
		expect(hits).toBeLessThan(60);
	});

	it('never visits children', () => {
		const { world } = setup();
		const child = world.people.find((o) => ageOf(world, o) < ADULT_AGE);
		if (!child) return;
		expect(maybeInsight(world, new Lucky(1), child)).toBe(false);
	});

	it('decideIdea picks from the offered options, preferring ones that do something', () => {
		const { world, p } = setup();
		const rng = new Rng(3);
		const options = [
			{ action: 'strike', items: ['flint', 'river-stone'] },
			{ action: 'soak', items: ['flint'] }
		];
		let useful = 0;
		for (let n = 0; n < 200; n++) {
			const idea = decideIdea(world, p, options, rng);
			expect(options).toContain(idea);
			if (idea === options[0]) useful++;
		}
		expect(useful).toBeGreaterThan(110);
		expect(decideIdea(world, p, [], rng)).toBeUndefined();
	});

	it('village heat follows what its people know', () => {
		const { world, p, camp } = setup();
		updateVillageHeat(world, camp);
		expect(camp.heat).toBe(0);
		p.knowledge['fire-making'] = 0.3;
		updateVillageHeat(world, camp);
		expect(camp.heat).toBe(600);
	});
});
