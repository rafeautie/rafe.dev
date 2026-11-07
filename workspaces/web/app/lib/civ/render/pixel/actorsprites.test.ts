import { describe, expect, it } from 'vitest';
import type { ActivityKind } from '../../types';
import {
	ANIMAL_KINDS,
	ANIMAL_STATES,
	BODIES,
	BUBBLE_DEFS,
	HERD_ICON_DEFS,
	ITEM_KINDS,
	PERSON_ICONS,
	POSES,
	POSE_FPS,
	POSE_FRAMES,
	RECOLOR_KEYS,
	STYLES,
	Z_DEF,
	animalDef,
	figureHeight,
	itemDef,
	itemKindOf,
	lieLayout,
	lookOf,
	personDef,
	poseOf,
	walkPose
} from './actorsprites';
import { pixels, type SpriteDef } from './sprite';

const ACTIVITIES: ActivityKind[] = [
	'idle',
	'sleep',
	'walk',
	'forage',
	'drink',
	'eat',
	'hunt',
	'fish',
	'gather',
	'craft',
	'build',
	'socialize',
	'teach',
	'care',
	'pray',
	'wander',
	'flee'
];

function check(def: SpriteDef): void {
	expect(def.rows.length).toBeGreaterThan(0);
	const w = def.rows[0].length;
	for (const row of def.rows) {
		expect(row.length).toBe(w);
		for (const ch of row)
			if (ch !== '.') expect(def.key[ch], `'${ch}' has no colour`).toBeDefined();
	}
	// resolves every pixel to a colour (throws on an unkeyed one)
	pixels(def);
	if (def.foot) {
		expect(def.foot[0]).toBeGreaterThanOrEqual(0);
		expect(def.foot[0]).toBeLessThan(w);
		expect(def.foot[1]).toBeGreaterThanOrEqual(0);
		expect(def.foot[1]).toBeLessThan(def.rows.length);
	}
}

describe('person sprites', () => {
	it('only use keyed characters, in every body, pose and frame', () => {
		for (const body of BODIES)
			for (const pose of POSES)
				for (let f = 0; f < POSE_FRAMES[pose]; f++)
					for (const style of STYLES) check(personDef(body, style, pose, f));
	});

	it('stand at the heights the style guide gives', () => {
		const h = (b: (typeof BODIES)[number]) => personDef(b, 'short', 'stand', 0).rows.length;
		expect(h('man')).toBeGreaterThanOrEqual(14);
		expect(h('man')).toBeLessThanOrEqual(16);
		expect(h('woman')).toBeGreaterThanOrEqual(14);
		expect(h('woman')).toBeLessThanOrEqual(16);
		expect(h('child')).toBeGreaterThanOrEqual(10);
		expect(h('child')).toBeLessThanOrEqual(11);
		expect(h('elderM')).toBe(14);
		expect(h('elderF')).toBe(14);
		for (const b of BODIES) expect(figureHeight(b)).toBe(h(b));
	});

	it('keep the recolour keys, so cloth, skin and hair can be swapped', () => {
		for (const pose of POSES) {
			const def = personDef('man', 'short', pose, 0);
			for (const k of RECOLOR_KEYS) expect(def.key[k]).toBeDefined();
		}
		// and actually use cloth, skin and hair
		const text = personDef('woman', 'long', 'stand', 0).rows.join('');
		for (const k of ['c', 's', 'h']) expect(text).toContain(k);
	});

	it('have a pose for every activity, moving or not', () => {
		for (const a of ACTIVITIES) {
			for (const moving of [false, true]) {
				const pose = poseOf(a, moving);
				expect(POSES).toContain(pose);
				expect(POSE_FRAMES[pose]).toBeGreaterThan(0);
				check(personDef('man', 'short', pose, 0));
			}
			for (const carrying of [false, true]) {
				const pose = walkPose(a, carrying);
				expect(POSES).toContain(pose);
				check(personDef('woman', 'bun', pose, 1));
			}
		}
		expect(poseOf('sleep', false)).toBe('lie');
		expect(poseOf('pray', false)).toBe('pray');
		expect(poseOf('gather', false)).toBe('chop');
		expect(poseOf('hunt', false)).toBe('spear');
		expect(poseOf('fish', false)).toBe('rod');
		expect(poseOf('forage', false)).toBe('kneel');
		expect(walkPose('hunt', false)).toBe('walkSpear');
		expect(walkPose('idle', true)).toBe('carry');
	});

	it('never animate faster than six frames a second', () => {
		for (const pose of POSES) expect(POSE_FPS[pose]).toBeLessThanOrEqual(6);
		// a walk cycle of 4 frames at the fastest cycle rate used by actors.ts (1.4/s)
		expect(4 * 1.4).toBeLessThanOrEqual(6);
	});

	it('lie flat and are longer than they are tall', () => {
		for (const body of BODIES) {
			const def = personDef(body, 'short', 'lie', 0);
			expect(def.rows[0].length).toBeGreaterThan(def.rows.length * 2);
			const l = lieLayout(body);
			expect(l.end).toBeGreaterThan(l.headX);
		}
	});

	it('get their looks from the id alone', () => {
		expect(lookOf(5, 'm', false, false)).toEqual(lookOf(5, 'm', false, false));
		const skins = new Set<number>();
		for (let id = 0; id < 100; id++) skins.add(lookOf(id, 'f', false, false).skin);
		expect(skins.size).toBeGreaterThan(3);
		for (let id = 0; id < 50; id++) expect(lookOf(id, 'm', false, true).hair).toBe(4);
	});

	it('draw the speech bubble, z and map icons from keyed pixels too', () => {
		for (const d of [...BUBBLE_DEFS, Z_DEF, PERSON_ICONS.adult, PERSON_ICONS.child]) check(d);
		expect(PERSON_ICONS.adult.rows.length).toBeLessThanOrEqual(4);
		expect(PERSON_ICONS.adult.rows[0].length).toBeLessThanOrEqual(4);
	});
});

describe('carried things', () => {
	it('colour by the kind of material', () => {
		expect(itemKindOf('wood')).toBe(itemKindOf('wood'));
		expect(itemKindOf('wood')).not.toBe(itemKindOf('clay'));
		expect(itemKindOf('some-copper-ingot')).toBe('copper');
	});
	it('are small keyed sprites', () => {
		for (const kind of ITEM_KINDS) {
			const def = itemDef(kind);
			check(def);
			expect(def.rows.length).toBeLessThanOrEqual(6);
			expect(def.rows[0].length).toBeLessThanOrEqual(8);
		}
	});
});

describe('animal sprites', () => {
	const LENGTH: Record<string, [number, number]> = {
		deer: [12, 14],
		aurochs: [18, 20],
		boar: [11, 13],
		goat: [9, 11],
		wolf: [12, 14]
	};
	it('are keyed, in every state and coat', () => {
		for (const kind of ANIMAL_KINDS)
			for (let s = 0; s < ANIMAL_STATES; s++) for (const v of [0, 1]) check(animalDef(kind, s, v));
	});
	it('have the lengths the style guide gives', () => {
		for (const kind of ANIMAL_KINDS) {
			const w = animalDef(kind, 0, 0).rows[0].length;
			expect(w).toBeGreaterThanOrEqual(LENGTH[kind][0]);
			expect(w).toBeLessThanOrEqual(LENGTH[kind][1]);
		}
	});
	it('have tiny map icons of four to six pixels', () => {
		for (const kind of ANIMAL_KINDS) {
			const def = HERD_ICON_DEFS[kind];
			check(def);
			expect(def.rows[0].length).toBeGreaterThanOrEqual(4);
			expect(def.rows[0].length).toBeLessThanOrEqual(6);
		}
	});
});
