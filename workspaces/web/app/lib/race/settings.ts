import { DEBT_CAP, SEED, START } from './betting';
import { BETTING_MS, RESULTS_MS } from './room';
import { ROSTER, type Entry } from './roster';

// The numbers /admin/race can change without a deploy. The room keeps the
// admin's choice in storage, and every race takes a copy of them when it
// opens, so a change applies from the next race and one in progress keeps the
// rules it started with. Unset, they are the constants in the code.

export const STATS = ['speed', 'grip', 'aggression', 'reliability'] as const;
export type CarStats = Pick<Entry, (typeof STATS)[number]>;

export type Settings = {
	/** Each car's stats by id, 0 to 1. */
	cars: Record<string, CarStats>;
	/** Chips the house spreads over each market's outcomes. */
	seed: number;
	/** Chips a new player starts with, and a bankrupt one is put back to. */
	start: number;
	/** How far below zero a balance may go. */
	debtCap: number;
	bettingSeconds: number;
	resultsSeconds: number;
	/** Practice runs of each race, to judge how likely every outcome is before seeding the pools. */
	trials: number;
};

export const DEFAULT_SETTINGS: Settings = {
	cars: Object.fromEntries(
		ROSTER.map(({ id, speed, grip, aggression, reliability }) => [
			id,
			{ speed, grip, aggression, reliability }
		])
	),
	seed: SEED,
	start: START,
	debtCap: DEBT_CAP,
	bettingSeconds: BETTING_MS / 1000,
	resultsSeconds: RESULTS_MS / 1000,
	trials: 30
};

/** The whole numbers, and what each may be. */
export const LIMITS = {
	seed: [100, 100_000],
	start: [1, 1_000_000],
	debtCap: [0, 1_000_000],
	bettingSeconds: [10, 600],
	resultsSeconds: [5, 120],
	trials: [5, 60]
} as const satisfies Partial<Record<keyof Settings, readonly [number, number]>>;

const NAMES: Record<keyof typeof LIMITS, string> = {
	seed: 'Pool seed',
	start: 'Starting chips',
	debtCap: 'Debt cap',
	bettingSeconds: 'Betting seconds',
	resultsSeconds: 'Results seconds',
	trials: 'Practice runs'
};

/** Settings as sent from the admin page, checked; or why they will not do. */
export function checkSettings(input: unknown): Settings | string {
	if (!input || typeof input !== 'object') return 'Settings missing';
	const given = input as Record<string, unknown>;
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
	const settings = { cars } as Settings;
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
