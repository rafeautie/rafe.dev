// The numbers behind a game, kept close to Black Ops 2's where they are known.

export const START_POINTS = 500;
// paid for every shot or stab that lands, the killing one included; there is
// no bonus for the kill itself. A shotgun blast pays once per zombie it hits.
export const POINTS = { hit: 20, headshot: 30, knife: 50 };
// share of points lost when downed, rounded down to tens
export const DOWNED_LOSS = 0.1;

export const PLAYER = {
	health: 100,
	radius: 0.35,
	eye: 1.6,
	downedEye: 0.45,
	walk: 4.2,
	sprint: 6.4,
	crawl: 1.1,
	jump: 5.6,
	gravity: 16,
	// health comes back this long after the last hit, at this rate
	regenDelay: 2.5,
	regenRate: 60,
	bleedOut: 30,
	reviveTime: 3,
	reviveRange: 1.8,
	// solo players get back up on their own, a few times, like Quick Revive
	soloRevives: 3,
	soloReviveTime: 10
};

export const ZOMBIE = {
	radius: 0.35,
	speeds: [1.3, 3, 4.3] as const, // walk, run, sprint
	reach: 1.15,
	hitRange: 1.6,
	damage: 45,
	windup: 0.45,
	cooldown: 1.1,
	rise: 1.2,
	maxAlive: 24
};

export const BREAK = { first: 4, between: 10 };

export function zombieHealth(round: number): number {
	if (round < 10) return 150 + 100 * (round - 1);
	return Math.round(950 * Math.pow(1.1, round - 9));
}

const EARLY_COUNTS = [6, 8, 13, 18, 24];

// How many zombies a round sends. More players, more zombies.
export function zombieCount(round: number, players: number): number {
	const base =
		round <= EARLY_COUNTS.length
			? EARLY_COUNTS[round - 1]
			: Math.round(0.09 * round * round + 0.7 * round + 20);
	return Math.round(base * (1 + 0.5 * (Math.max(1, players) - 1)));
}

// Seconds between spawns.
export function spawnDelay(round: number): number {
	return Math.max(0.5, 2 - round * 0.12);
}

// 0 walks, 1 runs, 2 sprints. Early rounds walk; runners and then sprinters
// take over.
export function speedClass(round: number, roll: number): 0 | 1 | 2 {
	const sprint = Math.min(0.7, Math.max(0, (round - 7) * 0.1));
	const run = Math.min(1 - sprint, Math.max(0, (round - 2) * 0.18));
	if (roll < sprint) return 2;
	if (roll < sprint + run) return 1;
	return 0;
}
