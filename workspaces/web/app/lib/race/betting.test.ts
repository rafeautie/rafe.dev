import { describe, expect, it } from 'vitest';
import { cleanName, MARKETS, outcomes, pays, seed, SEED, winners, type Result } from './betting';

const CARS = ['a', 'b', 'c', 'd', 'e', 'f'];
const RESULT: Result = { order: ['c', 'a', 'f', 'b', 'e', 'd'], firstOut: 'd', fastest: 'a' };
const CLEAN: Result = { ...RESULT, firstOut: null };

describe('what can be bet on', () => {
	it('is every car, every ordered pair of cars, or yes and no', () => {
		expect(outcomes('win', CARS)).toEqual(CARS);
		expect(outcomes('exacta', CARS)).toHaveLength(30);
		expect(outcomes('exacta', CARS)).toContain('c>a');
		expect(outcomes('exacta', CARS)).not.toContain('a>a');
		expect(outcomes('clean', CARS)).toEqual(['yes', 'no']);
	});
});

describe('which bets win', () => {
	it('follows the result', () => {
		expect(winners('win', RESULT)).toEqual(['c']);
		expect(winners('podium', RESULT)).toEqual(['c', 'a', 'f']);
		expect(winners('exacta', RESULT)).toEqual(['c>a']);
		expect(winners('crash', RESULT)).toEqual(['d']);
		expect(winners('lap', RESULT)).toEqual(['a']);
		expect(winners('clean', RESULT)).toEqual(['no']);
		expect(winners('clean', CLEAN)).toEqual(['yes']);
	});

	it('hands bets back when there is nothing to be first at', () => {
		expect(winners('crash', CLEAN)).toBeNull();
		expect(winners('lap', { ...RESULT, fastest: null })).toBeNull();
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
		expect(pays(pool, 'crash', 'a', CLEAN)).toBe(1);
	});

	it('shows the odds as what the outcome would pay', () => {
		expect(pays(pool, 'win', 'b')).toBeCloseTo(1000 / 300);
	});
});

describe('the house seed', () => {
	const trials: Result[] = [RESULT, RESULT, RESULT, CLEAN];

	it('puts the same chips on every market, most on what came up most', () => {
		for (const market of MARKETS) {
			const seeded = seed(market, CARS, trials);
			expect(Object.keys(seeded)).toEqual(outcomes(market, CARS));
			expect(Object.values(seeded).reduce((sum, chips) => sum + chips, 0)).toBeCloseTo(SEED);
			// nothing is left without odds
			for (const chips of Object.values(seeded)) expect(chips).toBeGreaterThan(0);
		}
		const win = seed('win', CARS, trials);
		expect(win.c).toBeGreaterThan(win.a);
		const clean = seed('clean', CARS, trials);
		expect(clean.no / clean.yes).toBeCloseTo(3.5 / 1.5);
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
