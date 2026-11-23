import { corners, WORLD, type Checks, type Layout } from './layout';

/**
 * The tri-oval: two long, steeply banked bends joined by a straight
 * behind and a front stretch bent out in the middle, where the start line
 * is, banked less. The pits are on the infield of the front stretch, in
 * from the end of the last bend; the way out runs on round the infield of
 * the first bend and joins on the back straight.
 */
export const layout: Layout = {
	name: 'Daytona tri-oval',
	kind: 'oval',
	world: WORLD,
	...corners(
		[
			[124, 42, 27, 'L', 31],
			[36, 42, 27, 'L', 31],
			[80, 7, 70, 'L', 18]
		],
		0.35
	),
	pits: { from: 224, slip: 40, thirst: 1, away: [115, 155] }
};

/** What the tests race on it (Checks). */
export const checks: Checks = { wreck: 9, clean: 7, behind: [[190, 2], [160, -1.5], 25] };
