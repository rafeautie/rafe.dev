import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../config';
import { Rng } from '../rng';
import type { WeatherKind, World } from '../types';
import { growthFactor, updateWeather } from './weather';

describe('weather', () => {
	// only the weather field matters here
	const fake = { weather: 'clear' } as World;

	// whole years of weather, with the season each day fell in
	function year(seed: number, years = 20) {
		const rng = new Rng(seed);
		fake.weather = 'clear';
		const days: { season: number; weather: WeatherKind }[] = [];
		for (let d = 0; d < DAYS_PER_YEAR * years; d++) {
			updateWeather(fake, rng, d);
			days.push({ season: Math.floor(d / DAYS_PER_SEASON) % 4, weather: fake.weather });
		}
		return days;
	}

	it('snows and chills in winter and never in summer', () => {
		const days = year(1);
		const inSeason = (s: number) => days.filter((d) => d.season === s).map((d) => d.weather);
		const winter = inSeason(3);
		expect(winter).toContain('snow');
		expect(winter).toContain('cold');
		expect(winter).not.toContain('drought');
		const summer = inSeason(1);
		expect(summer).not.toContain('snow');
		expect(summer).not.toContain('cold');
	});

	it('has rain, storms and droughts that last days', () => {
		const days = year(5, 30).map((d) => d.weather);
		for (const kind of ['clear', 'rain', 'storm', 'drought'] as const) {
			expect(days.includes(kind)).toBe(true);
		}
		let longest = 0;
		let run = 0;
		days.forEach((w, i) => {
			run = w === 'drought' && days[i - 1] === 'drought' ? run + 1 : w === 'drought' ? 1 : 0;
			longest = Math.max(longest, run);
		});
		expect(longest).toBeGreaterThan(2);
	});

	it('rain feeds plants and drought starves them', () => {
		expect(growthFactor('rain')).toBeGreaterThan(growthFactor('clear'));
		expect(growthFactor('drought')).toBeLessThan(growthFactor('clear'));
	});
});
