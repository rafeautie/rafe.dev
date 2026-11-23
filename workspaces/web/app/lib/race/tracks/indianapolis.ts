import { corners, WORLD, type Checks, type Layout } from './layout';

/**
 * A rectangle with its corners rounded off: two long straights, two short
 * ones between the corners at each end, and four corners alike, all of a
 * quarter turn and hardly banked. The pits are on the infield of the front
 * straight, in from the short straight before it; the way out runs on round
 * the infield of the first two corners and joins on the back straight.
 */
export const layout: Layout = {
	name: 'Indianapolis',
	kind: 'oval',
	world: WORLD,
	...corners(
		[
			[127, 56, 22, 'L', 9],
			[127, 34, 22, 'L', 9],
			[33, 34, 22, 'L', 9],
			[33, 56, 22, 'L', 9]
		],
		0.6
	),
	pits: { from: 275, slip: 34, thirst: 1, away: [134, 184], boxes: 323 }
};

/** What the tests race on it (Checks). */
export const checks: Checks = { wreck: 6, clean: 4, behind: [[195, 2], [165, -1.5], 25] };
