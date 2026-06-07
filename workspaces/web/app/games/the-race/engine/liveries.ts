import type { F1Livery } from './types';

// Teammates share an identical team livery (primary + secondary); the cockpit
// camera colour (tertiary) is the only thing that separates the two drivers,
// just as the black vs. fluoro-yellow onboard cameras do in real life.
const CAMERA_BLACK = '#16161D';
const CAMERA_YELLOW = '#F2E500';

const F1_LIVERIES: F1Livery[] = [
	// Red Bull Racing — navy + red
	{
		id: 0,
		teamId: 0,
		teamName: 'Red Bull Racing',
		driverName: 'Max Verstappen',
		number: 1,
		primary: '#1B3A6B',
		secondary: '#CC1E4A',
		tertiary: CAMERA_BLACK
	},
	{
		id: 1,
		teamId: 0,
		teamName: 'Red Bull Racing',
		driverName: 'Yuki Tsunoda',
		number: 22,
		primary: '#1B3A6B',
		secondary: '#CC1E4A',
		tertiary: CAMERA_YELLOW
	},
	// Ferrari — red + yellow
	{
		id: 2,
		teamId: 1,
		teamName: 'Ferrari',
		driverName: 'Charles Leclerc',
		number: 16,
		primary: '#DC0000',
		secondary: '#FFF200',
		tertiary: CAMERA_BLACK
	},
	{
		id: 3,
		teamId: 1,
		teamName: 'Ferrari',
		driverName: 'Lewis Hamilton',
		number: 44,
		primary: '#DC0000',
		secondary: '#FFF200',
		tertiary: CAMERA_YELLOW
	},
	// McLaren — orange + blue
	{
		id: 4,
		teamId: 2,
		teamName: 'McLaren',
		driverName: 'Lando Norris',
		number: 4,
		primary: '#FF8000',
		secondary: '#0067FF',
		tertiary: CAMERA_BLACK
	},
	{
		id: 5,
		teamId: 2,
		teamName: 'McLaren',
		driverName: 'Oscar Piastri',
		number: 81,
		primary: '#FF8000',
		secondary: '#0067FF',
		tertiary: CAMERA_YELLOW
	},
	// Mercedes — teal + white
	{
		id: 6,
		teamId: 3,
		teamName: 'Mercedes',
		driverName: 'George Russell',
		number: 63,
		primary: '#00D2BE',
		secondary: '#FFFFFF',
		tertiary: CAMERA_BLACK
	},
	{
		id: 7,
		teamId: 3,
		teamName: 'Mercedes',
		driverName: 'Andrea Kimi Antonelli',
		number: 12,
		primary: '#00D2BE',
		secondary: '#FFFFFF',
		tertiary: CAMERA_YELLOW
	},
	// Aston Martin — forest green + lime
	{
		id: 8,
		teamId: 4,
		teamName: 'Aston Martin',
		driverName: 'Fernando Alonso',
		number: 14,
		primary: '#006F51',
		secondary: '#CEFC06',
		tertiary: CAMERA_BLACK
	},
	{
		id: 9,
		teamId: 4,
		teamName: 'Aston Martin',
		driverName: 'Lance Stroll',
		number: 18,
		primary: '#006F51',
		secondary: '#CEFC06',
		tertiary: CAMERA_YELLOW
	},
	// Alpine — sky blue + pink
	{
		id: 10,
		teamId: 5,
		teamName: 'Alpine',
		driverName: 'Pierre Gasly',
		number: 10,
		primary: '#0090FF',
		secondary: '#FF0080',
		tertiary: CAMERA_BLACK
	},
	{
		id: 11,
		teamId: 5,
		teamName: 'Alpine',
		driverName: 'Jack Doohan',
		number: 7,
		primary: '#0090FF',
		secondary: '#FF0080',
		tertiary: CAMERA_YELLOW
	}
];

export function livery(id: number): F1Livery {
	const found = F1_LIVERIES.find((l) => l.id === id);
	if (!found) throw new Error(`No livery with id ${id}`);
	return found;
}

/**
 * The livery a car is racing this Season — resolved through the per-car livery
 * map, falling back to treating the carId as a liveryId for the static grid where
 * the two coincide. The view layer derives a car's badge/driver/team from this.
 */
export function liveryOf(carId: number, carLiveries: Record<number, number>): F1Livery {
	return livery(carLiveries[carId] ?? carId);
}

/**
 * Livery ids grouped by team, in declaration order. Each team holds the ids of
 * its paired liveries — the unit handed to a single player so both their cars
 * race under one team.
 */
export function liveryTeams(): number[][] {
	const byTeam = new Map<string, number[]>();
	for (const l of F1_LIVERIES) {
		const ids = byTeam.get(l.teamName) ?? [];
		ids.push(l.id);
		byTeam.set(l.teamName, ids);
	}
	return [...byTeam.values()];
}

/**
 * The 0-based team index (in declaration order) a livery belongs to. This is the
 * value surfaced as a car's teamId, so two cars on the same team compare equal.
 * Falls back to the livery id itself if it maps to no known team.
 */
export function liveryTeamId(liveryId: number): number {
	return F1_LIVERIES.find((l) => l.id === liveryId)?.teamId ?? liveryId;
}

/**
 * Maps each car id (0..numCars-1, in player×car creation order) to a livery id,
 * assigning one whole team per player so a player's cars race under the same team
 * — teammates share a livery and are told apart only by the tertiary
 * cockpit-camera colour.
 *
 * Cars are built in player×car order, so car i belongs to player ⌊i / carsPerPlayer⌋
 * and is that player's (i mod carsPerPlayer)-th car. `teams` is the team-grouped
 * livery ids (from liveryTeams), already shuffled by the caller — the same
 * inject-the-non-determinism contract createGame uses for `suits`, which keeps
 * this function pure and the team-pairing invariant unit-testable.
 */
export function assignLiveries(
	teams: number[][],
	numCars: number,
	carsPerPlayer: number
): Record<number, number> {
	const map: Record<number, number> = {};
	for (let i = 0; i < numCars; i++) {
		const team = teams[Math.floor(i / carsPerPlayer) % teams.length]!;
		map[i] = team[(i % carsPerPlayer) % team.length]!;
	}
	return map;
}
