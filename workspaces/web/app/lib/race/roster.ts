// The cars that can race: each race draws as many of them as /admin/race
// asks for (settings.ts), so a field may be smaller than this. Each stat runs from 0 to 1 and none is
// simply better: speed is engine power, grip is cornering, aggression is how
// near the limit the driver runs (quicker, with more mistakes), and
// reliability is how much of a beating the car takes before it retires. Crew
// is not the car's at all: it is how quick and how sure its pit crew is.

export type Entry = {
	id: string;
	name: string;
	number: number;
	/** Body colour and a darker shade of it, as CSS hex. */
	color: string;
	shade: string;
	speed: number;
	grip: number;
	aggression: number;
	reliability: number;
	crew: number;
};

export const ROSTER: Entry[] = [
	{
		id: 'vixen',
		name: 'Vixen',
		number: 7,
		color: '#e5484d',
		shade: '#8f2428',
		speed: 0.9,
		grip: 0.5,
		aggression: 0.7,
		reliability: 0.3,
		crew: 0.5
	},
	{
		id: 'brick',
		name: 'Brick',
		number: 12,
		color: '#b8b3a7',
		shade: '#6b665c',
		speed: 0.3,
		grip: 0.6,
		aggression: 0.4,
		reliability: 0.95,
		crew: 0.85
	},
	{
		id: 'wasp',
		name: 'Wasp',
		number: 3,
		color: '#f5c518',
		shade: '#94740a',
		speed: 0.5,
		grip: 0.9,
		aggression: 0.9,
		reliability: 0.4,
		crew: 0.6
	},
	{
		id: 'duke',
		name: 'Duke',
		number: 21,
		color: '#3b82f6',
		shade: '#1e448c',
		speed: 0.6,
		grip: 0.6,
		aggression: 0.5,
		reliability: 0.6,
		crew: 0.7
	},
	{
		id: 'comet',
		name: 'Comet',
		number: 44,
		color: '#f97316',
		shade: '#93400b',
		speed: 0.95,
		grip: 0.3,
		aggression: 0.85,
		reliability: 0.5,
		crew: 0.3
	},
	{
		id: 'moss',
		name: 'Moss',
		number: 9,
		color: '#3fb950',
		shade: '#216b2c',
		speed: 0.45,
		grip: 0.75,
		aggression: 0.15,
		reliability: 0.8,
		crew: 0.75
	},
	{
		id: 'jinx',
		name: 'Jinx',
		number: 13,
		color: '#a855f7',
		shade: '#5b2591',
		speed: 0.75,
		grip: 0.4,
		aggression: 0.6,
		reliability: 0.65,
		crew: 0.4
	},
	{
		id: 'frost',
		name: 'Frost',
		number: 88,
		color: '#22c3d6',
		shade: '#126b77',
		speed: 0.55,
		grip: 0.75,
		aggression: 0.25,
		reliability: 0.45,
		crew: 0.65
	}
];

// How a car turns up on the day. The stats above never change; each race,
// every car draws a condition that nudges one of them for that race only,
// and everyone can see it before they bet.

export type Condition = {
	label: string;
	stat?: 'speed' | 'grip' | 'aggression' | 'reliability' | 'crew';
	by: number;
};

export const CONDITIONS: Record<string, Condition> = {
	normal: { label: 'As usual', by: 0 },
	tuned: { label: 'Engine tuned', stat: 'speed', by: 0.25 },
	rough: { label: 'Engine running rough', stat: 'speed', by: -0.25 },
	fresh: { label: 'Fresh tyres', stat: 'grip', by: 0.25 },
	worn: { label: 'Worn tyres', stat: 'grip', by: -0.25 },
	fired: { label: 'Driver fired up', stat: 'aggression', by: 0.25 },
	wary: { label: 'Driver wary', stat: 'aggression', by: -0.25 },
	braced: { label: 'Bodywork braced', stat: 'reliability', by: 0.25 },
	patched: { label: 'Patched up', stat: 'reliability', by: -0.25 },
	drilled: { label: 'Crew drilled', stat: 'crew', by: 0.25 },
	short: { label: 'Crew a man short', stat: 'crew', by: -0.25 }
};

/** A condition for each of `count` cars: half the time nothing special. */
export function drawConditions(rand: () => number, count: number): string[] {
	const special = Object.keys(CONDITIONS).filter((id) => id !== 'normal');
	return Array.from({ length: count }, () =>
		rand() < 0.5 ? 'normal' : special[Math.floor(rand() * special.length)]
	);
}

/** A car (or anything with its stats) as it is for one race, in the condition it drew. */
export function inCondition<T extends Record<NonNullable<Condition['stat']>, number>>(
	entry: T,
	condition: string
): T {
	const change = CONDITIONS[condition];
	return change?.stat
		? { ...entry, [change.stat]: Math.max(0, Math.min(1, entry[change.stat] + change.by)) }
		: entry;
}
