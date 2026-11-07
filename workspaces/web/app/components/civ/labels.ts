import { DAYS_PER_YEAR, SEASON_NAMES, season } from '~/lib/civ/config';
import type { ActivityKind, WeatherKind } from '~/lib/civ/types';

// Words and looks the game panels share.

// Every floating panel: see-through enough that the map shows, blurred enough to read
export const PANEL =
	'rounded-xl border border-foreground/10 bg-background/85 shadow-lg backdrop-blur-md';

export const DOING: Record<ActivityKind, string> = {
	idle: 'Resting a moment',
	sleep: 'Sleeping',
	walk: 'Walking',
	forage: 'Foraging',
	drink: 'Drinking',
	eat: 'Eating',
	hunt: 'Hunting',
	fish: 'Fishing',
	gather: 'Gathering',
	craft: 'Trying something',
	build: 'Building',
	socialize: 'Talking',
	teach: 'Teaching',
	care: 'Caring for someone',
	pray: 'Praying',
	wander: 'Wandering',
	flee: 'Running'
};

export const WEATHER: Record<WeatherKind, string> = {
	clear: 'Clear',
	rain: 'Rain',
	storm: 'Storm',
	drought: 'Drought',
	snow: 'Snow',
	cold: 'Cold snap'
};

export const label = (id: string) => id.replaceAll('-', ' ');

export const when = (day: number) =>
	`Year ${Math.floor(day / DAYS_PER_YEAR) + 1}, ${SEASON_NAMES[season(day)]}`;

// The tabs along the bottom
export const TABS = [
	{ id: 'chronicle', name: 'Chronicle' },
	{ id: 'people', name: 'People' },
	{ id: 'knowledge', name: 'Knowledge' },
	{ id: 'world', name: 'World' }
] as const;
export type TabId = (typeof TABS)[number]['id'];
