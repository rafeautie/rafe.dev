import { describe, it, expect } from 'vitest';
import { assignLiveries, livery, liveryTeams, liveryTeamId } from './liveries';

// Declaration-order team groups: [[0,1],[2,3],[4,5],[6,7],[8,9],[10,11]]. Passing
// them unshuffled keeps these assertions deterministic — assignLiveries is pure.
const TEAMS = liveryTeams();

describe('livery', () => {
	it('returns the livery with the given id', () => {
		const l = livery(0);
		expect(l.id).toBe(0);
		expect(l.driverName).toBe('Max Verstappen');
	});

	it('resolves every declared id to its own livery', () => {
		for (const ids of TEAMS) {
			for (const id of ids) {
				expect(livery(id).id).toBe(id);
			}
		}
	});

	it('throws for an unknown id', () => {
		expect(() => livery(999)).toThrow('No livery with id 999');
	});
});

describe('liveryTeams', () => {
	it('groups the 12 liveries into 6 teams of 2, in declaration order', () => {
		expect(liveryTeams()).toEqual([
			[0, 1],
			[2, 3],
			[4, 5],
			[6, 7],
			[8, 9],
			[10, 11]
		]);
	});

	it('pairs ids that share a teamName', () => {
		for (const [a, b] of liveryTeams()) {
			expect(livery(a!).teamName).toBe(livery(b!).teamName);
		}
	});

	it('returns a fresh array each call (no shared mutable state)', () => {
		const first = liveryTeams();
		first[0]!.push(999);
		expect(liveryTeams()[0]).toEqual([0, 1]);
	});
});

describe('liveryTeamId', () => {
	it('returns the teamId both teammates share', () => {
		expect(liveryTeamId(0)).toBe(liveryTeamId(1));
		expect(liveryTeamId(0)).toBe(0);
	});

	it('maps each declaration-order team to its 0-based index', () => {
		TEAMS.forEach((ids, teamIndex) => {
			for (const id of ids) expect(liveryTeamId(id)).toBe(teamIndex);
		});
	});

	it('falls back to the livery id itself for an unknown id', () => {
		expect(liveryTeamId(999)).toBe(999);
	});
});

describe('assignLiveries', () => {
	it('gives every car a livery', () => {
		const map = assignLiveries(TEAMS, 4, 2);
		expect(Object.keys(map)).toHaveLength(4);
		for (let i = 0; i < 4; i++) expect(map[i]).toBeTypeOf('number');
	});

	it('Team Mode: a player two cars share a team but get distinct liveries', () => {
		// carsPerPlayer = 2 → cars (0,1) are player 0, cars (2,3) are player 1.
		const map = assignLiveries(TEAMS, 4, 2);
		for (const [a, b] of [
			[0, 1],
			[2, 3]
		]) {
			expect(liveryTeamId(map[a]!)).toBe(liveryTeamId(map[b]!));
			expect(map[a]).not.toBe(map[b]);
			// Teammates are told apart only by the cockpit-camera (tertiary) colour.
			expect(livery(map[a]!).tertiary).not.toBe(livery(map[b]!).tertiary);
		}
	});

	it('Team Mode: the two players are on different teams', () => {
		const map = assignLiveries(TEAMS, 4, 2);
		expect(liveryTeamId(map[0]!)).not.toBe(liveryTeamId(map[2]!));
	});

	it('single-car mode: every car is on a distinct team', () => {
		const map = assignLiveries(TEAMS, 6, 1);
		const teamIds = Object.values(map).map(liveryTeamId);
		expect(new Set(teamIds).size).toBe(6);
	});

	it('wraps teams when there are more cars than teams', () => {
		// More single cars than the 6 teams → assignment cycles through teams again.
		const map = assignLiveries(TEAMS, 7, 1);
		expect(liveryTeamId(map[6]!)).toBe(liveryTeamId(map[0]!));
	});
});
