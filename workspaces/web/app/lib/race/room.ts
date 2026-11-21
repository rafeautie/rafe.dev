import type { Market, Pools, Result } from './betting';
import type { Settings } from './settings';

// What the race room and the pages watching it say to each other. The room
// (room.server.ts) runs one race after another for everyone at once; a page
// only ever shows what the room tells it.

/** How long betting stays open before each race, unless /admin/race says otherwise. */
export const BETTING_MS = 45_000;
/** How long the result stays up after one, likewise. */
export const RESULTS_MS = 15_000;
/** From betting closing to the recording's first moment, so it can arrive before it is needed. */
export const LEAD_MS = 1_500;

export type RoomState = {
	/** Counts up with every race. */
	round: number;
	/** Idle is nobody watching: the room waits for someone before starting a race. */
	phase: 'idle' | 'betting' | 'racing' | 'results';
	/** When this phase ends, in ms since 1970 by the room's clock. */
	endsAt: number;
	/** The cars' ids in starting order, and the condition each is in (roster.ts). */
	grid: string[];
	conditions: string[];
	/** When the recording's time 0 is or was, once betting has closed. */
	startsAt: number;
	/** How the race came out, once it is over. */
	result: Result | null;
	/**
	 * The rules this race runs by, copied from the admin's settings when it
	 * opened (settings.ts): the cars' stats, the money, the timings.
	 */
	settings: Settings;
};

/** A bet as its owner sees it. `payout` is null until the race is settled. */
export type Bet = { market: Market; outcome: string; stake: number; payout: number | null };

/** A player as everyone sees them. */
export type Standing = { id: number; name: string; balance: number; bankruptcies: number };

/**
 * What the room sends as text. The recording of the race comes separately,
 * as bytes (recording.ts), right after the state that says it has started.
 */
export type FromRoom =
	/** Where the cycle is, with the chips on every outcome as they stand. */
	| { type: 'state'; state: RoomState; pools: Pools }
	| { type: 'sync'; sent: number; now: number }
	/** To one page: who it is, and its bets on this race. */
	| { type: 'you'; you: Standing; bets: Bet[] }
	/** To all: somebody bet, and what is now on that outcome. */
	| { type: 'bet'; name: string; market: Market; outcome: string; stake: number; pool: number }
	/** To all: the richest players. */
	| { type: 'board'; board: Standing[] }
	/** To one page: why what it asked for was not done. */
	| { type: 'no'; reason: string };

export type ToRoom =
	/** A page's own time, to learn the room's from the reply. */
	| { type: 'sync'; sent: number }
	| { type: 'name'; name: string }
	| { type: 'bet'; market: Market; outcome: string; stake: number }
	/** Wipe a debt and start again on the opening stake. */
	| { type: 'bankrupt' };
