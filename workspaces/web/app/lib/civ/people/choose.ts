// Reflexes: when someone's activity ends, weigh everything they could do now
// by how urgent the need is, how likely it is to work and how far it is, nudge
// that with their traits and skills, and take the best. This is the rules-only
// layer; a language model can later choose for notable people instead.

import { ADULT_AGE, ELDER_AGE, TICKS_PER_DAY } from '../config';
import type { Rng } from '../rng';
import type { ActivityKind, Herd, Person, Village, World } from '../types';
import { endActivity, prayedRecently, startActivity, teachable } from './act';
import { CAMP_RADIUS, nearWolf } from './needs';
import {
	ageOf,
	clamp01,
	countOf,
	dist,
	foodCount,
	indexOf,
	isNight,
	living,
	peopleNear,
	phaseOf,
	stillGood,
	tileIndex,
	walkable
} from './village';

// ---- tuning knobs
// how far from camp anyone goes at evening, when the day is closing
const EVENING_RANGE = 14;
// children under this stay at camp or by a parent
const SMALL_CHILD = 8;
const CHILD_RANGE = 16;
// hunters go no further than this from camp
const HUNT_RANGE = 55;
// food in store per person that counts as a comfortable pantry
// Sleep lasts into the next tick: needs are counted before the deed, so a
// sleeper must still be asleep when the next tick's needs run.
const SLEEP_TICKS = 2;
// good tiles weighed when looking for the nearest
const LOOK_AT = 24;
const PANTRY_PER_PERSON = 3;
// the materials a village likes to keep a few of
const STOCK_WANTED = ['flint', 'river-stone', 'clay', 'wood', 'branch', 'grass', 'earth', 'reed'];

type Option = {
	kind: ActivityKind;
	x: number;
	y: number;
	score: number;
	with?: number;
};

// how pressing a need is: nothing when nearly met, everything when empty
export function urgency(need: number): number {
	return Math.pow(clamp01((0.9 - need) / 0.9), 1.5);
}

const near = (d: number) => 1 / (1 + d / 15);

type Target = { x: number; y: number; d: number };

// the nearest still-good tile of a list, with a little jitter so people
// don't all stand on one tile
function nearestTile(
	world: World,
	p: Person,
	list: number[] | undefined,
	kind: string,
	within = Infinity,
	centre?: { x: number; y: number }
): Target | undefined {
	if (!list) return undefined;
	const { map } = world;
	let best: Target | undefined;
	let bestScore = Infinity;
	let seen = 0;
	for (const i of list) {
		if (!stillGood(map, kind as 'plants', i)) continue;
		// the list runs nearest-to-camp first, so a few good ones are enough
		if (++seen > LOOK_AT) break;
		const x = (i % map.size) + 0.5;
		const y = Math.floor(i / map.size) + 0.5;
		if (centre && dist(x, y, centre.x, centre.y) > within) continue;
		const d = dist(p.x, p.y, x, y);
		// a fixed wobble per person and tile, so people spread out without drawing numbers
		const jittered = d * (0.9 + (0.4 * (((i * 2654435761) ^ (p.id * 40503)) >>> 0)) / 4294967296);
		if (jittered < bestScore) {
			bestScore = jittered;
			best = { x, y, d };
		}
	}
	return best;
}

function nearestHerd(world: World, p: Person, v: Village): Herd | undefined {
	let best: Herd | undefined;
	let bestD = Infinity;
	for (const h of world.herds) {
		if (h.tame || h.count <= 0) continue;
		if (dist(h.x, h.y, v.x, v.y) > HUNT_RANGE) continue;
		const d = dist(p.x, p.y, h.x, h.y) + (h.kind === 'wolf' ? 25 : 0);
		if (d < bestD) {
			bestD = d;
			best = h;
		}
	}
	return best;
}

// Food in the village store against what everyone there will need
const pantryCache = new WeakMap<Village, { tick: number; value: number }>();

function pantryShortage(world: World, v: Village): number {
	const cached = pantryCache.get(v);
	if (cached && cached.tick === world.tick) return cached.value;
	let members = 0;
	for (const p of living(world)) if (p.village === v.id) members++;
	const wanted = Math.max(1, members * PANTRY_PER_PERSON);
	const value = 1 - clamp01(foodCount(v.store) / wanted);
	pantryCache.set(v, { tick: world.tick, value });
	return value;
}

// a spot near a point that can be walked on
function nearbySpot(world: World, rng: Rng, cx: number, cy: number, r: number) {
	const { map } = world;
	for (let tries = 0; tries < 8; tries++) {
		const x = Math.min(map.size - 1, Math.max(0, cx + rng.range(-r, r)));
		const y = Math.min(map.size - 1, Math.max(0, cy + rng.range(-r, r)));
		if (walkable(map, tileIndex(map, x, y))) return { x, y };
	}
	return { x: cx, y: cy };
}

// children keep near their mother, or father, or the camp
function guardian(world: World, p: Person, v: Village): { x: number; y: number } {
	for (const id of [p.mother, p.father]) {
		if (id === undefined) continue;
		const parent = living(world).find((o) => o.id === id);
		if (parent) return parent;
	}
	return v;
}

export function choose(world: World, rng: Rng, p: Person) {
	const v = world.villages[p.village];
	if (!v) return endActivity(p);

	if (isNight(world)) return startActivity(p, 'sleep', v.x, v.y, SLEEP_TICKS);

	const age = ageOf(world, p);
	const child = age < ADULT_AGE;
	const small = age < SMALL_CHILD;
	const d_camp = dist(p.x, p.y, v.x, v.y);
	const evening = phaseOf(world) === TICKS_PER_DAY - 2;
	const n = p.needs;
	const hungry = urgency(n.food);
	const thirsty = urgency(n.water);

	// as the light goes, head back unless the body can't wait
	if (evening && d_camp > EVENING_RANGE && hungry < 0.5 && thirsty < 0.5) {
		return startActivity(p, 'walk', v.x, v.y, 1);
	}

	const index = indexOf(world, v);
	const options: Option[] = [];
	const add = (o: Option) => {
		if (o.score > 0) options.push(o);
	};
	// how far a child may roam; evening shortens everyone's range
	const home = small ? guardian(world, p, v) : v;
	const range = small ? 6 : child ? CHILD_RANGE : evening ? EVENING_RANGE : Infinity;
	const around = child || evening ? { centre: { x: home.x, y: home.y }, within: range } : undefined;

	// ---- drink
	if (thirsty > 0.02) {
		const t = nearestTile(world, p, index.water, 'water', around?.within, around?.centre);
		if (t) add({ kind: 'drink', x: t.x, y: t.y, score: thirsty * 1.6 * near(t.d) });
	}

	// ---- eat what we have
	if (hungry > 0.02) {
		if (foodCount(p.carrying) > 0) {
			add({ kind: 'eat', x: p.x, y: p.y, score: hungry * 1.5 });
		} else if (foodCount(v.store) > 0) {
			add({ kind: 'eat', x: v.x, y: v.y, score: hungry * 1.4 * near(d_camp) });
		}
	}

	// ---- find food: the village's shortage pushes the fed to help
	const shortage = pantryShortage(world, v);
	const drive = Math.max(hungry, n.food < 0.85 && !child ? shortage * 0.45 : 0);
	if (drive > 0.02 && !small) {
		const t = nearestTile(world, p, index.plants, 'plants', around?.within, around?.centre);
		if (t) {
			const success = 0.55 + p.skills.foraging * 0.35 + (p.traits.patient - 0.5) * 0.1;
			add({ kind: 'forage', x: t.x, y: t.y, score: drive * success * near(t.d) });
		}
		const w = nearestTile(world, p, index.water, 'water', around?.within, around?.centre);
		if (w) {
			const success = 0.35 + p.skills.foraging * 0.3;
			add({ kind: 'fish', x: w.x, y: w.y, score: drive * success * 0.8 * near(w.d) });
		}
	}
	if (drive > 0.02 && !child && age < ELDER_AGE + 12 && p.health > 0.5 && !evening) {
		const herd = nearestHerd(world, p, v);
		if (herd) {
			const d = dist(p.x, p.y, herd.x, herd.y);
			const success = 0.3 + p.skills.hunting * 0.35 + p.traits.bold * 0.15;
			// a kill feeds many, so hunting is worth a longer walk
			const reward = 1.35 * (0.6 + p.traits.bold * 0.8);
			add({
				kind: 'hunt',
				x: herd.x,
				y: herd.y,
				with: herd.id,
				score: drive * success * reward * near(d / 2)
			});
		}
	}

	// ---- company, and teaching
	const social = urgency(n.company) * (0.4 + p.traits.social);
	if (!evening || d_camp < CAMP_RADIUS * 2) {
		const others = peopleNear(world, p.x, p.y, 16, p);
		if (others.length) {
			const other = rng.weighted(others, (o) => 0.1 + (p.relations[o.id]?.affection ?? 0.2));
			if (other) {
				const teach = teachable(p, other);
				const wish = teach ? 0.2 + p.traits.kind * 0.25 : 0;
				add({
					kind: teach ? 'teach' : 'socialize',
					x: other.x,
					y: other.y,
					with: other.id,
					score: (social + wish) * near(dist(p.x, p.y, other.x, other.y))
				});
			}
		}
	}

	// ---- stock the camp with useful materials, and see the world
	const spare = n.food > 0.6 && n.water > 0.6 && n.rest > 0.4;
	if (spare && !small) {
		const short = STOCK_WANTED.filter((id) => countOf(v.store, id) < 6);
		const material = short.length ? short[Math.floor(rng.next() * short.length)] : undefined;
		const t =
			material &&
			nearestTile(
				world,
				p,
				index.materials.get(material),
				material,
				around?.within,
				around?.centre
			);
		if (t)
			add({ kind: 'gather', x: t.x, y: t.y, score: (0.1 + 0.2 * p.traits.curious) * near(t.d) });
	}
	const restless = urgency(n.curiosity) * (0.3 + p.traits.curious);
	if (restless > 0.02 || small) {
		const spot = nearbySpot(world, rng, home.x, home.y, small ? 4 : child ? 12 : evening ? 10 : 25);
		add({ kind: 'wander', x: spot.x, y: spot.y, score: small ? 0.2 : restless * 0.9 });
	}

	// ---- rest in the day if worn out
	if (n.rest < 0.25) {
		add({ kind: 'sleep', x: v.x, y: v.y, score: urgency(n.rest) * 1.2 * near(d_camp) });
	}

	// ---- danger and desperation
	if (n.safety < 0.5 && nearWolf(world, p)) {
		add({ kind: 'flee', x: v.x, y: v.y, score: 2 - p.traits.bold });
	}
	if (Math.min(n.food, n.water, n.warmth, n.safety) < 0.15 && !prayedRecently(world, p)) {
		add({ kind: 'pray', x: p.x, y: p.y, score: 0.3 });
	}

	// ---- nothing pressing: potter about near where we are
	add({ kind: 'idle', x: p.x, y: p.y, score: 0.01 });

	// the best of them, each shaken a little so near-ties vary
	let best = options[0];
	let bestScore = -1;
	for (const o of options) {
		const noisy = o.score * rng.range(0.9, 1.1);
		if (noisy > bestScore) {
			bestScore = noisy;
			best = o;
		}
	}
	startActivity(
		p,
		best.kind,
		best.x,
		best.y,
		best.kind === 'sleep' ? SLEEP_TICKS : 1,
		best.with !== undefined ? { with: best.with } : {}
	);
}
