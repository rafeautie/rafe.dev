import { corners, WORLD, type Checks, type Layout } from './layout';

/**
 * The paperclip: two long straights and a tight, lightly banked hairpin at
 * each end. The pits run the length of the front straight and on round the
 * infield of the first hairpin, joining on the back straight.
 */
export const layout: Layout = {
	name: 'Martinsville',
	kind: 'oval',
	world: WORLD,
	...corners(
		[
			[132.5, 45, 19.5, 'L', 12],
			[27.5, 45, 19.5, 'L', 12]
		],
		0.55
	),
	pits: { from: 204, slip: 42, thirst: 0.99, away: [76, 118], boxes: 287 }
};

/** What the tests race on it (Checks). */
export const checks: Checks = { wreck: 3, clean: 7, behind: [[190, 2], [160, -1.5], 25] };
