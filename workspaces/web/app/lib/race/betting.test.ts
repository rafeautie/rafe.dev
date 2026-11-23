import { describe, expect, it } from 'vitest';
import {
	cleanName,
	MARKETS,
	outcomes,
	pays,
	pickDuel,
	returns,
	seed,
	SEED,
	winners,
	type Duel,
	type Result
} from './betting';

const CARS = ['a', 'b', 'c', 'd', 'e', 'f'];
const RESULT: Result = { order: ['c', 'a', 'f', 'b', 'e', 'd'], firstOut: 'd', fastest: 'a' };
const CLEAN: Result = { ...RESULT, firstOut: null };
const DUEL: Duel = ['b', 'f'];

describe('what can be bet on', () => {
	it('is every car, every ordered pair of cars, the two in the duel, or yes and no', () => {
		expect(outcomes('win', CARS)).toEqual(CARS);
		expect(outcomes('exacta', CARS)).toHaveLength(30);
		expect(outcomes('exacta', CARS)).toContain('c>a');
		expect(outcomes('exacta', CARS)).not.toContain('a>a');
		expect(outcomes('clean', CARS)).toEqual(['yes', 'no']);
		expect(outcomes('duel', CARS, DUEL)).toEqual(['b', 'f']);
		// a race with no duel has nothing to bet on in it
		expect(outcomes('duel', CARS)).toEqual([]);
	});
});

describe('which bets win', () => {
	it('follows the result', () => {
		expect(winners('win', RESULT)).toEqual(['c']);
		expect(winners('podium', RESULT)).toEqual(['c', 'a', 'f']);
		expect(winners('exacta', RESULT)).toEqual(['c>a']);
		expect(winners('duel', RESULT, DUEL)).toEqual(['f']);
		expect(winners('duel', RESULT, ['a', 'e'])).toEqual(['a']);
		expect(winners('lap', RESULT)).toEqual(['a']);
		expect(winners('clean', RESULT)).toEqual(['no']);
		expect(winners('clean', CLEAN)).toEqual(['yes']);
	});

	it('hands bets back when there is nothing to be first at', () => {
		expect(winners('duel', RESULT)).toBeNull();
		expect(winners('lap', { ...RESULT, fastest: null })).toBeNull();
		// and on a market that is no longer run
		expect(winners('crash' as 'duel', RESULT, DUEL)).toBeNull();
	});
});

describe('what a bet pays', () => {
	const pool = { a: 100, b: 300, c: 50, d: 50, e: 250, f: 250 };

	it('shares the whole pool among the chips on the winner', () => {
		expect(pays(pool, 'win', 'c', RESULT)).toBe(20);
		expect(pays(pool, 'win', 'a', RESULT)).toBe(0);
		// every chip staked comes back out to somebody
		expect(50 * pays(pool, 'win', 'c', RESULT)).toBe(1000);
	});

	it('gives each of the top three a third of the pool', () => {
		expect(pays(pool, 'podium', 'c', RESULT)).toBeCloseTo(1000 / 3 / 50);
		expect(pays(pool, 'podium', 'f', RESULT)).toBeCloseTo(1000 / 3 / 250);
		expect(pays(pool, 'podium', 'b', RESULT)).toBe(0);
	});

	it('never pays a winner less than was staked', () => {
		expect(pays({ ...pool, a: 900 }, 'podium', 'a', RESULT)).toBe(1);
	});

	it('returns the stake when the market is handed back', () => {
		expect(pays(pool, 'lap', 'a', { ...RESULT, fastest: null })).toBe(1);
		expect(pays(pool, 'duel', 'a', RESULT)).toBe(1);
	});

	it('pays the duel to whichever of its two cars finished ahead', () => {
		const duel = { b: 300, f: 100 };
		expect(pays(duel, 'duel', 'f', RESULT, DUEL)).toBe(4);
		expect(pays(duel, 'duel', 'b', RESULT, DUEL)).toBe(0);
	});

	it('shows the odds as what the outcome would pay', () => {
		expect(pays(pool, 'win', 'b')).toBeCloseTo(1000 / 300);
	});
});

describe('what a stake would return', () => {
	const pool = { a: 100, b: 300, c: 50, d: 50, e: 250, f: 250 };

	it('counts the stake into the pool it is paid from', () => {
		// 50 on c: 1050 in the pool, shared over the 100 then on c
		expect(returns(pool, 'win', 'c', 50)).toBe(525);
		expect(returns(pool, 'win', 'c', 50)).toBeLessThan(50 * pays(pool, 'win', 'c'));
		// and is what the bet pays once it is placed
		expect(returns(pool, 'win', 'c', 50)).toBe(50 * pays({ ...pool, c: 100 }, 'win', 'c'));
		expect(returns(pool, 'podium', 'c', 50)).toBeCloseTo((50 * 1050) / 3 / 100);
	});

	it('is never less than the stake, and nothing for no stake', () => {
		expect(returns(pool, 'podium', 'b', 600)).toBe(600);
		expect(returns(pool, 'win', 'c', 0)).toBe(0);
	});
});

describe('the duel', () => {
	const run = (...order: string[]): Result => ({ order, firstOut: null, fastest: null });

	it('is between the two cars the practice runs split most evenly', () => {
		// a always leads; c and d trade places; b is always between
		const trials = [
			run('a', 'b', 'c', 'd'),
			run('a', 'b', 'd', 'c'),
			run('a', 'b', 'c', 'd'),
			run('a', 'b', 'd', 'c')
		];
		expect(pickDuel(['a', 'b', 'c', 'd'], trials)).toEqual(['c', 'd']);
		const seeded = seed('duel', ['a', 'b', 'c', 'd'], trials, SEED, ['c', 'd']);
		expect(seeded).toEqual({ c: SEED / 2, d: SEED / 2 });
	});

	it('is the first such pair in the starting order when several are as close', () => {
		expect(pickDuel(CARS, [])).toEqual(['a', 'b']);
		expect(pickDuel(['d', 'c', 'b'], [run('b', 'c', 'd'), run('d', 'c', 'b')])).toEqual(['d', 'c']);
		expect(pickDuel(['a'], [])).toBeNull();
	});

	it('is seeded by how often each of the two beat the other', () => {
		const seeded = seed('duel', CARS, [RESULT, RESULT, RESULT], SEED, DUEL);
		expect(seeded.f / seeded.b).toBeCloseTo(3.5 / 0.5);
	});
});

describe('the house seed', () => {
	const trials: Result[] = [RESULT, RESULT, RESULT, CLEAN];

	it('puts the same chips on every market, most on what came up most', () => {
		for (const market of MARKETS) {
			const seeded = seed(market, CARS, trials, SEED, DUEL);
			expect(Object.keys(seeded)).toEqual(outcomes(market, CARS, DUEL));
			expect(Object.values(seeded).reduce((sum, chips) => sum + chips, 0)).toBeCloseTo(SEED);
			// nothing is left without odds
			for (const chips of Object.values(seeded)) expect(chips).toBeGreaterThan(0);
		}
		const win = seed('win', CARS, trials);
		expect(win.c).toBeGreaterThan(win.a);
		const clean = seed('clean', CARS, trials);
		expect(clean.no / clean.yes).toBeCloseTo(3.5 / 1.5);
	});

	it('starts an exacta the practice runs never saw by how often its cars won', () => {
		// c won three runs and a one; b, d, e and f never did
		const won: Result[] = [
			RESULT,
			RESULT,
			RESULT,
			{ ...RESULT, order: ['a', 'c', 'f', 'b', 'e', 'd'] }
		];
		const exacta = seed('exacta', CARS, won);
		expect(Object.values(exacta).reduce((sum, chips) => sum + chips, 0)).toBeCloseTo(SEED);
		// none of these came up: the ones with the strong car in are worth more
		expect(exacta['c>b']).toBeGreaterThan(exacta['d>b']);
		expect(exacta['b>c']).toBeGreaterThan(exacta['b>d']);
		expect(exacta['c>b']).toBeGreaterThan(exacta['b>c']);
		expect(exacta['d>e']).toBeCloseTo(exacta['e>f']);
		// and what did come up is still worth most
		expect(exacta['c>a']).toBeGreaterThan(exacta['c>b']);
		// with no runs at all, every pair is the same
		expect(seed('exacta', CARS, [])['a>b']).toBeCloseTo(SEED / 30);
	});
});

describe('a name', () => {
	it('is tidied', () => {
		expect(cleanName('  Rafe   A ')).toBe('Rafe A');
		expect(cleanName('Zoë_99')).toBe('Zoë_99');
	});

	it('is refused when too short, too long, odd or rude', () => {
		expect(cleanName('a')).toBeNull();
		expect(cleanName('a'.repeat(17))).toBeNull();
		expect(cleanName('<b>hi</b>')).toBeNull();
		expect(cleanName('F.u.c.k you')).toBeNull();
	});
});
