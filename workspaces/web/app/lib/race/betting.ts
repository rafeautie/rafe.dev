// The rules of the betting, with no storage and no race in them: what can be
// bet on, which bets a result makes winners, and what they pay.
//
// Every market is a pool. All the chips staked on it, on every outcome, go
// in together, and are shared among the chips on what happened. So odds are
// never fixed: they are the pool divided by what is on an outcome, and move
// with every bet until betting closes. The house puts chips of its own on
// every outcome before betting opens (the seed), in proportion to how likely
// it thinks each is, so there are odds to see and something to win even
// when one person is betting alone.

export const MARKETS = ['win', 'podium', 'exacta', 'duel', 'lap', 'clean'] as const;
export type Market = (typeof MARKETS)[number];

export const MARKET_NAMES: Record<Market, string> = {
	win: 'Winner',
	podium: 'Top three',
	exacta: 'First two, in order',
	duel: 'Duel',
	lap: 'Fastest lap',
	clean: 'Clean race'
};

/** Chips a new player starts with, and is put back to by going bankrupt. */
export const START = 1000;
/** The most a player out of chips may owe the house for re-ups. */
export const DEBT_CAP = 1000;
/** Chips the house spreads over each market's outcomes. */
export const SEED = 5000;
/** Bets one player may place on one race. */
export const MAX_BETS = 20;

/** What the house will still lend a player who owes it `debt`, under a re-up limit of `cap`. */
export const credit = (debt: number, cap: number) => Math.max(0, cap - debt);

/** What a race came to, as far as the betting cares. Cars are named by id. */
export type Result = {
	/** Finishing order. */
	order: string[];
	/** The first car to retire, or null if none did. */
	firstOut: string | null;
	/** The car with the quickest lap, or null if no lap was completed. */
	fastest: string | null;
};

/** The two cars the house sets against each other in a race, or null if it has none. */
export type Duel = [string, string] | null;

/** Chips on each outcome of each market, the house's seed included. */
export type Pools = Record<Market, Record<string, number>>;

/** Everything that can be bet on in a market, for a field of cars and the race's duel. */
export function outcomes(market: Market, cars: string[], duel: Duel = null): string[] {
	if (market === 'clean') return ['yes', 'no'];
	// with no duel there is nothing to bet on
	if (market === 'duel') return duel ?? [];
	if (market === 'exacta')
		return cars.flatMap((a) => cars.filter((b) => b !== a).map((b) => `${a}>${b}`));
	return cars;
}

/** The outcomes of a market that won, or null if its bets are handed back. */
export function winners(market: Market, result: Result, duel: Duel = null): string[] | null {
	const { order, firstOut, fastest } = result;
	switch (market) {
		case 'win':
			return [order[0]];
		case 'podium':
			return order.slice(0, 3);
		case 'exacta':
			return [`${order[0]}>${order[1]}`];
		case 'duel':
			// whichever of the two finished ahead of the other
			return duel ? [order.find((car) => duel.includes(car))!] : null;
		case 'lap':
			return fastest ? [fastest] : null;
		case 'clean':
			return [firstOut ? 'no' : 'yes'];
		// a bet kept from a market no longer run
		default:
			return null;
	}
}

/**
 * What one chip on an outcome is paid, stake included, with the pool as it
 * stands and the result given. Without a result it is what the chip would be
 * paid if the outcome came in: the odds on show.
 */
export function pays(
	pool: Record<string, number>,
	market: Market,
	outcome: string,
	result?: Result,
	duel: Duel = null
) {
	const won = result ? winners(market, result, duel) : [outcome];
	if (!won) return 1;
	if (!won.includes(outcome)) return 0;
	const total = Object.values(pool).reduce((sum, chips) => sum + chips, 0);
	// three cars make the top three, so each one's backers share a third
	const share = market === 'podium' ? total / 3 : total;
	// a winning bet never comes back smaller than it went in
	return Math.max(1, share / pool[outcome]);
}

/**
 * What a stake not yet placed would come back as if its outcome came in. The
 * stake joins the pool, so it is less than the odds on show times the stake,
 * and much less on an outcome with few chips on it.
 */
export function returns(
	pool: Record<string, number>,
	market: Market,
	outcome: string,
	stake: number
) {
	if (stake <= 0) return 0;
	const total = Object.values(pool).reduce((sum, chips) => sum + chips, stake);
	const share = market === 'podium' ? total / 3 : total;
	return Math.max(stake, (stake * share) / ((pool[outcome] ?? 0) + stake));
}

/**
 * The two cars of the field that the practice runs say are most evenly
 * matched: the pair whose count of one finishing ahead of the other is
 * nearest half the runs. Of pairs as close, the first in the starting order.
 */
export function pickDuel(cars: string[], trials: Result[]): Duel {
	let duel: Duel = null;
	let closest = Infinity;
	cars.forEach((a, index) => {
		for (const b of cars.slice(index + 1)) {
			const ahead = trials.filter(({ order }) => order.indexOf(a) < order.indexOf(b)).length;
			const off = Math.abs(ahead - trials.length / 2);
			if (off < closest) [duel, closest] = [[a, b], off];
		}
	});
	return duel;
}

/**
 * The house's seed for a market: `chips` (SEED unless tuned) spread over its
 * outcomes by how often each came up in `trials` practice runs of the race.
 * Every outcome gets something, however unlikely, so none is ever without odds.
 *
 * The practice runs are too few to tell an exacta's many pairs apart, so its
 * pairs do not all start level: each starts as likely as the cars' records of
 * winning make it (a to win, then b to be the best of the rest).
 */
export function seed(
	market: Market,
	cars: string[],
	trials: Result[],
	chips = SEED,
	duel: Duel = null
): Record<string, number> {
	const all = outcomes(market, cars, duel);
	const counts = Object.fromEntries(all.map((outcome) => [outcome, 0.5]));
	if (market === 'exacta') {
		const wins = Object.fromEntries(cars.map((car) => [car, 0.5]));
		for (const trial of trials) wins[trial.order[0]]++;
		const runs = cars.reduce((total, car) => total + wins[car], 0);
		for (const outcome of all) {
			const [a, b] = outcome.split('>').map((car) => wins[car] / runs);
			// over every pair these come to 1, so the head start is as big as it was
			counts[outcome] = (0.5 * all.length * a * b) / (1 - a);
		}
	}
	for (const trial of trials) for (const won of winners(market, trial, duel) ?? []) counts[won]++;
	const sum = all.reduce((total, outcome) => total + counts[outcome], 0);
	return Object.fromEntries(all.map((outcome) => [outcome, (chips * counts[outcome]) / sum]));
}

/** A name a player may go by, tidied up, or null if it will not do. */
export function cleanName(name: string): string | null {
	const tidy = name.trim().replace(/\s+/g, ' ');
	if (tidy.length < 2 || tidy.length > 16 || !/^[\p{L}\p{N} _.-]+$/u.test(tidy)) return null;
	const bare = tidy.toLowerCase().replace(/[^a-z]/g, '');
	return RUDE.some((word) => bare.includes(word)) ? null : tidy;
}

// The crudest words, so the leaderboard is not the first place they show up.
// Not a moderation system: /admin is where a name gets dealt with.
const RUDE = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'bitch', 'whore'];
