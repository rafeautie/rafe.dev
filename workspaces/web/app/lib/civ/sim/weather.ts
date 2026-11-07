// Daily weather. It follows a simple chain: today is mostly like yesterday,
// and what replaces it depends on the season. Droughts and cold snaps last
// days because they are slow to give way.

import { SEASONS_PER_YEAR, season } from '../config';
import type { Rng } from '../rng';
import type { WeatherKind, World } from '../types';

// ---- tuning knobs
// chance that today's weather simply carries on
const STAYS: Record<WeatherKind, number> = {
	clear: 0.6,
	rain: 0.5,
	storm: 0.3,
	drought: 0.92,
	snow: 0.65,
	cold: 0.88
};

// what may come next, by season (spring, summer, autumn, winter)
const NEXT: Record<WeatherKind, number>[] = [
	{ clear: 5, rain: 4, storm: 1, drought: 0, snow: 0, cold: 0 },
	{ clear: 6, rain: 2, storm: 1, drought: 0.8, snow: 0, cold: 0 },
	{ clear: 4, rain: 4, storm: 1.5, drought: 0, snow: 0, cold: 0 },
	{ clear: 3, rain: 0, storm: 0, drought: 0, snow: 3, cold: 3 }
];

const KINDS = Object.keys(STAYS) as WeatherKind[];

export function updateWeather(world: World, rng: Rng, day: number) {
	const s = season(day) % SEASONS_PER_YEAR;
	const table = NEXT[s];
	// a stay only holds if the season still allows that weather
	const stays = table[world.weather] > 0 && rng.chance(STAYS[world.weather]);
	if (stays) return;
	world.weather = rng.weighted(KINDS, (k) => table[k]) ?? 'clear';
}

// how the weather feeds the plants: a multiplier on regrowth
export function growthFactor(weather: WeatherKind): number {
	switch (weather) {
		case 'rain':
			return 1.8;
		case 'storm':
			return 1.4;
		case 'drought':
			return 0.2;
		case 'snow':
		case 'cold':
			return 0.1;
		default:
			return 1;
	}
}
