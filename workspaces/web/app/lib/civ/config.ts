// The numbers the whole simulation is tuned by, in one place. The plan lives
// in the "Civilization Sim — Plan" doc; these follow its pace: about 18
// seconds of real time per in-game year at 1x, so a 90-minute run covers
// about 300 years.

// Time
export const TICKS_PER_DAY = 4; // morning, midday, evening, night
export const DAYS_PER_SEASON = 12;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;
export const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
// real milliseconds per in-game day at 1x
export const MS_PER_DAY = 375;
export const SPEEDS = [0, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

// Map
export const MAP_SIZE = 256; // tiles per side
export const METERS_PER_TILE = 40;
// heights are 0..1; below this is sea
export const SEA_LEVEL = 0.38;

// People
export const START_BAND = { min: 8, max: 12 };
export const ADULT_AGE = 14;
export const ELDER_AGE = 45;
// the most people simulated one by one in v1
export const POPULATION_CAP = 300;
// tiles a person can cover in one tick
export const WALK_TILES_PER_TICK = 6;

export const season = (day: number) => Math.floor(day / DAYS_PER_SEASON) % SEASONS_PER_YEAR;
export const year = (day: number) => Math.floor(day / DAYS_PER_YEAR);
export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;
