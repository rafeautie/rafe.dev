import { DEBT_CAP, SEED, START } from './betting';
import { BETTING_MS, RESULTS_MS } from './room';
import { ROSTER, type Entry } from './roster';
import { RULES, type Rules } from './sim';
import { isTrackId, MPH, type TrackId } from './track';

// The numbers /admin/race can change without a deploy. The room keeps the
// admin's choice in storage, and every race takes a copy of them when it
// opens, so a change applies from the next race and one in progress keeps the
// rules it started with. Unset, they are the constants in the code.

export const STATS = ['speed', 'grip', 'aggression', 'reliability', 'crew'] as const;
export type CarStats = Pick<Entry, (typeof STATS)[number]>;

export type Settings = {
	/** The track the races run on. */
	track: TrackId;
	/** How many cars race, drawn at random from the roster for each race. */
	count: number;
	/** Each car's stats by id, 0 to 1. */
	cars: Record<string, CarStats>;
	/** How many laps a race is. */
	laps: number;
	/** Whether the cars burn fuel, wear their tires and pit for more. */
	pits: boolean;
	/** How much a full tank holds, in tenths of a lap of hard running. */
	tank: number;
	/** How fast tyres wear, as a percentage of the usual. */
	tyreWear: number;
	/** How much damage a knock does, as a percentage of what it did before this could be set. */
	damage: number;
	/** The pit lane's speed limit, in whole miles an hour. */
	pitMph: number;
	/** Chips the house spreads over each market's outcomes. */
	seed: number;
	/** Chips a new player starts with, and a bankrupt one is put back to. */
	start: number;
	/**
	 * The re-up limit: the most a player out of chips may owe the house. Kept
	 * under its old name, from when it was how far below zero a balance went.
	 */
	debtCap: number;
	bettingSeconds: number;
	resultsSeconds: number;
	/** Practice runs of each race, to judge how likely every outcome is before seeding the pools. */
	trials: number;
};

export const DEFAULT_SETTINGS: Settings = {
	track: 'oval',
	count: 6,
	cars: Object.fromEntries(
		ROSTER.map(({ id, speed, grip, aggression, reliability, crew }) => [
			id,
			{ speed, grip, aggression, reliability, crew }
		])
	),
	laps: RULES.laps,
	pits: RULES.pits,
	tank: Math.round(RULES.tank * 10),
	tyreWear: Math.round(RULES.wear * 100),
	damage: Math.round(RULES.damage * 100),
	pitMph: Math.round(RULES.limit * MPH),
	seed: SEED,
	start: START,
	debtCap: DEBT_CAP,
	bettingSeconds: BETTING_MS / 1000,
	resultsSeconds: RESULTS_MS / 1000,
	trials: 30
};

/** The whole numbers, and what each may be. */
export const LIMITS = {
	// three at least, for the top three market; at most the whole roster
	count: [3, ROSTER.length],
	// a recording of a longer race than this would not fit where it is kept
	laps: [2, 5],
	tank: [10, 80],
	tyreWear: [0, 300],
	damage: [0, 1000],
	pitMph: [13, 56],
	seed: [100, 100_000],
	start: [1, 1_000_000],
	debtCap: [0, 1_000_000],
	bettingSeconds: [10, 600],
	resultsSeconds: [5, 120],
	trials: [5, 60]
} as const satisfies Partial<Record<keyof Settings, readonly [number, number]>>;

const NAMES: Record<keyof typeof LIMITS, string> = {
	count: 'Cars per race',
	laps: 'Laps',
	tank: 'Fuel tank',
	tyreWear: 'Tire wear',
	damage: 'Damage',
	pitMph: 'Pit lane speed limit',
	seed: 'Pool seed',
	start: 'Starting chips',
	debtCap: 'Re-up limit',
	bettingSeconds: 'Betting seconds',
	resultsSeconds: 'Results seconds',
	trials: 'Practice runs'
};

/** Settings as sent from the admin page, checked; or why they will not do. */
export function checkSettings(input: unknown): Settings | string {
	if (!input || typeof input !== 'object') return 'Settings missing';
	const given = input as Record<string, unknown>;
	if (!isTrackId(given.track)) return 'No such track';
	const cars: Record<string, CarStats> = {};
	for (const { id, name } of ROSTER) {
		const car = (given.cars as Record<string, Record<string, unknown>> | undefined)?.[id];
		if (!car || typeof car !== 'object') return `${name} has no stats`;
		const stats = {} as CarStats;
		for (const stat of STATS) {
			const value = car[stat];
			if (typeof value !== 'number' || !(value >= 0 && value <= 1)) {
				return `${name}'s ${stat} must be between 0 and 1`;
			}
			stats[stat] = value;
		}
		cars[id] = stats;
	}
	if (typeof given.pits !== 'boolean') return 'Pits must be on or off';
	const settings = { track: given.track, cars, pits: given.pits } as Settings;
	for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
		const [low, high] = LIMITS[key];
		const value = given[key];
		if (!Number.isInteger(value) || (value as number) < low || (value as number) > high) {
			return `${NAMES[key]} must be a whole number from ${low} to ${high}`;
		}
		settings[key] = value as number;
	}
	return settings;
}

/** The roster as the settings have it. */
export const tuned = (settings: Settings): Entry[] =>
	ROSTER.map((entry) => ({ ...entry, ...settings.cars[entry.id] }));

/** The rules of a race run to these settings. */
export const rulesOf = (settings: Settings): Rules => ({
	laps: settings.laps,
	pits: settings.pits,
	tank: settings.tank / 10,
	wear: settings.tyreWear / 100,
	damage: settings.damage / 100,
	// to the half metre a second, so 27 mph is the 12 the pits are tuned to, and
	// any whole number of metres a second kept from before is what it was
	limit: Math.round((settings.pitMph / MPH) * 2) / 2
});

/**
 * Settings kept from before one of them existed, with `base` for whatever
 * they have not got: every car has every stat, and every number is there.
 */
export function complete(saved: Partial<Settings>, base: Settings = DEFAULT_SETTINGS): Settings {
	// the pit lane's limit was kept in whole metres a second before it was in miles an hour
	const { pitSpeed, ...kept } = saved as Partial<Settings> & { pitSpeed?: number };
	return {
		...base,
		...(pitSpeed !== undefined && { pitMph: Math.round(pitSpeed * MPH) }),
		...kept,
		cars: Object.fromEntries(
			Object.entries(base.cars).map(([id, stats]) => [id, { ...stats, ...saved.cars?.[id] }])
		)
	};
}
