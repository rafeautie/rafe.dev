import { describe, it, expect } from 'vitest';
import { selectRaceView, carsOnClock, autoFocusCarId, turnPrompt } from './raceView';
import type { Card, PublicCarState, PublicGameState } from './types';
import type { SelectionState } from './types';
import { livery, liveryTeamId } from './liveries';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const reg = (value: number): Card => ({
	id: `gears:${value}`,
	kind: 'regular',
	value,
	suit: 'gears'
});
const redline: Card = { id: 'fuel:redline', kind: 'redline', suit: 'fuel' };

function car(id: number, position: number, hand: Card[] = []): PublicCarState {
	return {
		id,
		position,
		handSize: hand.length,
		hand,
		liveryId: id,
		teamId: liveryTeamId(id),
		overtakes: 0,
		defensesHeld: 0,
		gridPosition: position
	};
}

function makeState(overrides: Partial<PublicGameState> = {}): PublicGameState {
	return {
		phase: 'race',
		players: [
			{ id: 'p1', name: 'Alice', carIds: [0], isHost: true, connected: true },
			{ id: 'p2', name: 'Bob', carIds: [1], isHost: false, connected: true }
		],
		cars: [car(0, 2, [reg(1), reg(5)]), car(1, 3, [reg(2)])],
		pendingThisRound: [0, 1],
		endAfterRound: false,
		challengeWinsThisTurn: 0,
		qualifiedCarIds: [],
		log: [],
		...overrides
	};
}

const NO_SEL: SelectionState = {};

// ─── Round-level projection ───────────────────────────────────────────────────

describe('selectRaceView round-level', () => {
	it('resolves the viewer cars and defaults the selected car to the first owned', () => {
		const v = selectRaceView(makeState(), NO_SEL, 'p1', undefined);
		expect(v.myCarIds).toEqual([0]);
		expect(v.myCars.map((c) => c.id)).toEqual([0]);
		expect(v.selectedCarId).toBe(0);
	});

	it('honours the preferred car when provided', () => {
		const state = makeState({
			players: [{ id: 'p1', name: 'Alice', carIds: [0, 1], isHost: true, connected: true }]
		});
		const v = selectRaceView(state, NO_SEL, 'p1', 1);
		expect(v.selectedCarId).toBe(1);
	});

	it('carsNeedingCard lists only the next car to act on a solo turn', () => {
		// Gap ahead (car 1 at pos 7): car 0 is the lowest-position pending car, so
		// it alone is on the clock — not every car still pending this round.
		const open = makeState({ cars: [car(0, 2, [reg(1), reg(5)]), car(1, 7, [reg(2)])] });
		const v = selectRaceView(open, NO_SEL, 'p1', undefined);
		expect(v.carsNeedingCard).toEqual([0]);
	});

	it('carsNeedingCard lists only the uncommitted sides during a challenge', () => {
		const state = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: true,
				defenderCommitted: false
			}
		});
		const v = selectRaceView(state, NO_SEL, 'p1', undefined);
		expect(v.carsNeedingCard).toEqual([1]);
	});

	it('holdAtStart only while qualifying and not every car has qualified', () => {
		const qualifying = makeState({ phase: 'qualifying', qualifiedCarIds: [0] });
		expect(selectRaceView(qualifying, NO_SEL, 'p1', undefined).holdAtStart).toBe(true);

		const allIn = makeState({ phase: 'qualifying', qualifiedCarIds: [0, 1] });
		expect(selectRaceView(allIn, NO_SEL, 'p1', undefined).holdAtStart).toBe(false);

		expect(selectRaceView(makeState(), NO_SEL, 'p1', undefined).holdAtStart).toBe(false);
	});
});

// ─── Turn focus (activeCarIds / carsOnClock) ───────────────────────────────────

describe('selectRaceView activeCarIds', () => {
	it('lights only the next car to act on a solo turn — not every pending car', () => {
		// Three cars deep in a round with open space ahead and no challenge: only
		// the lowest-position pending car is on the clock. Regression — the
		// standings used to highlight every pending car whenever no auto-declared
		// challenge happened to mask the turn (a car with a gap directly ahead).
		const state = makeState({
			players: [{ id: 'p1', name: 'Solo', carIds: [0, 1, 2], isHost: true, connected: true }],
			cars: [car(0, 4), car(1, 9), car(2, 14)],
			pendingThisRound: [0, 1, 2]
		});
		const v = selectRaceView(state, NO_SEL, 'p1', undefined);
		expect([...v.activeCarIds]).toEqual([0]);
		expect(v.carsNeedingCard).toEqual([0]);
	});

	it('lights both duelling cars during a challenge', () => {
		const state = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false
			}
		});
		const v = selectRaceView(state, NO_SEL, 'p1', undefined);
		expect([...v.activeCarIds].sort()).toEqual([0, 1]);
	});

	it('lights every car still to qualify during qualifying (simultaneous)', () => {
		const state = makeState({ phase: 'qualifying', pendingThisRound: [0, 1] });
		const v = selectRaceView(state, NO_SEL, 'p1', undefined);
		expect([...v.activeCarIds].sort()).toEqual([0, 1]);
		expect(v.carsNeedingCard.slice().sort()).toEqual([0, 1]);
	});
});

describe('carsOnClock', () => {
	const base = makeState();

	it('returns the lowest-position pending car on a solo race turn', () => {
		const state = { ...base, cars: [car(0, 2), car(1, 7)], pendingThisRound: [0, 1] };
		expect([...carsOnClock(state)]).toEqual([0]);
	});

	it('returns both challenge participants when a challenge is pending', () => {
		const state = { ...base, pendingChallenge: { challengerCarId: 1, defenderCarId: 0 } };
		expect([...carsOnClock(state)].sort()).toEqual([0, 1]);
	});

	it('returns an empty set outside the race phase', () => {
		expect(carsOnClock({ ...base, phase: 'qualifying' }).size).toBe(0);
		expect(carsOnClock({ ...base, phase: 'lobby', pendingThisRound: [] }).size).toBe(0);
	});
});

// ─── Auto-focus tab switching ───────────────────────────────────────────────────

describe('autoFocusCarId', () => {
	const cars = (...ids: number[]) => ids.map((id) => ({ id }));

	it('jumps to the first owned car that owes a card when the turn opens', () => {
		// Focused on car 0, which owes nothing; car 1 is on the clock → switch to it.
		expect(autoFocusCarId(cars(0, 1), [1], 0)).toBe(1);
	});

	it('stays put while the focused car still owes a card', () => {
		// Both cars pending: leave the player on car 0 to choose which to play first.
		expect(autoFocusCarId(cars(0, 1), [0, 1], 0)).toBeUndefined();
	});

	it('slides to the other pending car after the focused one is submitted', () => {
		// Car 0 was submitted (dropped from the pending set); car 1 still owes a card.
		expect(autoFocusCarId(cars(0, 1), [1], 0)).toBe(1);
	});

	it('picks the first pending car in tab order', () => {
		expect(autoFocusCarId(cars(0, 1, 2), [2, 1], 0)).toBe(1);
	});

	it('does nothing when none of the viewer cars owe a card', () => {
		// Only an opponent car is on the clock — never switch to a car the viewer
		// does not own (the tabs only show owned cars).
		expect(autoFocusCarId(cars(0, 1), [2], 0)).toBeUndefined();
		expect(autoFocusCarId(cars(0, 1), [], undefined)).toBeUndefined();
	});

	it('focuses the first pending car when nothing is selected yet', () => {
		expect(autoFocusCarId(cars(0, 1), [1], undefined)).toBe(1);
	});
});

// ─── Qualify gating ─────────────────────────────────────────────────────────────

describe('selectRaceView canQualify', () => {
	const qualifying = () => makeState({ phase: 'qualifying' });

	it('is false without a selection', () => {
		expect(selectRaceView(qualifying(), NO_SEL, 'p1', undefined).canQualify).toBe(false);
	});

	it('is true when qualifying, not yet qualified, and a card is selected', () => {
		const v = selectRaceView(qualifying(), { 0: ['gears:1'] }, 'p1', undefined);
		expect(v.canQualify).toBe(true);
	});

	it('is false once the car has already qualified', () => {
		const state = makeState({ phase: 'qualifying', qualifiedCarIds: [0] });
		expect(selectRaceView(state, { 0: ['gears:1'] }, 'p1', undefined).canQualify).toBe(false);
	});
});

// ─── Discard / Extend gating (turn order) ──────────────────────────────────────

describe('selectRaceView discard/extend', () => {
	it('canDiscard requires the car to be next to act and a card selected', () => {
		// gap ahead of car 0 (car 1 at pos 7) so a discard is a legal solo turn
		const open = makeState({ cars: [car(0, 2, [reg(1), reg(5)]), car(1, 7, [reg(2)])] });
		expect(selectRaceView(open, NO_SEL, 'p1', undefined).canDiscard).toBe(false);
		expect(selectRaceView(open, { 0: ['gears:1'] }, 'p1', undefined).canDiscard).toBe(true);
	});

	it('blocks discard when a car is directly ahead (must challenge)', () => {
		// default fixture: car 0 at pos 2 with car 1 directly ahead at pos 3
		const v = selectRaceView(makeState(), { 0: ['gears:1'] }, 'p1', undefined);
		expect(v.canDiscard).toBe(false);
	});

	it('blocks discarding a pending car that is NOT next to act (turn order)', () => {
		// Car 1 (p2) is second in pendingThisRound, so it is not on the clock — the
		// engine would reject the move, so the UI must not offer it. Give car 1 a
		// gap ahead (car 0 behind it) so the only thing blocking discard is turn order.
		const state = makeState({ cars: [car(0, 2, [reg(1)]), car(1, 5, [reg(2)])] });
		const v = selectRaceView(state, { 1: ['gears:2'] }, 'p2', undefined);
		expect(v.selectedCarId).toBe(1);
		expect(v.canDiscard).toBe(false);
	});

	it('canExtend honours the engine extend predicate for the selected card', () => {
		// Car 0 at position 2; value-1 card extends only if position 3 is free.
		const blocked = makeState(); // car 1 occupies position 3
		expect(selectRaceView(blocked, { 0: ['gears:1'] }, 'p1', undefined).canExtend).toBe(false);

		const open = makeState({ cars: [car(0, 2, [reg(1), reg(5)]), car(1, 7, [reg(2)])] });
		expect(selectRaceView(open, { 0: ['gears:1'] }, 'p1', undefined).canExtend).toBe(true);
	});

	it('blocks discard/extend while the car is mid-challenge', () => {
		const state = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false
			}
		});
		const v = selectRaceView(state, { 0: ['gears:1'] }, 'p1', undefined);
		expect(v.canDiscard).toBe(false);
		expect(v.canExtend).toBe(false);
	});
});

// ─── Challenge gating + label ──────────────────────────────────────────────────

describe('selectRaceView challenge', () => {
	const challengeState = (overrides = {}) =>
		makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false,
				...overrides
			}
		});

	it('labels the action Attack for the challenger and Defend for the defender', () => {
		expect(selectRaceView(challengeState(), NO_SEL, 'p1', 0).challengeLabel).toBe('Attack');
		expect(selectRaceView(challengeState(), NO_SEL, 'p2', 1).challengeLabel).toBe('Defend');
	});

	it('labels Challenge when the viewed car is not in the challenge', () => {
		expect(selectRaceView(makeState(), NO_SEL, 'p1', undefined).challengeLabel).toBe('Challenge');
	});

	it('canChallenge requires a selection and not having committed yet', () => {
		expect(selectRaceView(challengeState(), NO_SEL, 'p1', 0).canChallenge).toBe(false);
		expect(selectRaceView(challengeState(), { 0: ['gears:1'] }, 'p1', 0).canChallenge).toBe(true);
	});

	it('canChallenge is false once this side has committed its cards', () => {
		const state = challengeState({ challengerCards: [reg(1)], challengerCommitted: true });
		expect(selectRaceView(state, { 0: ['gears:1'] }, 'p1', 0).canChallenge).toBe(false);
	});
});

// ─── Selection passthrough ──────────────────────────────────────────────────────

describe('selectRaceView selection view', () => {
	it('exposes the main/pair card ids and the selected cards', () => {
		const state = makeState({ cars: [car(0, 2, [reg(1), redline]), car(1, 3, [reg(2)])] });
		const v = selectRaceView(state, { 0: ['gears:1', 'fuel:redline'] }, 'p1', undefined);
		expect(v.mainCardId).toBe('gears:1');
		expect(v.pairCardId).toBe('fuel:redline');
		expect(v.selectedCards).toEqual([reg(1), redline]);
	});

	it('canPairRedline in a challenge when a Redline is in hand and the main card is not the Redline', () => {
		const withRedline = makeState({
			cars: [car(0, 2, [reg(1), redline]), car(1, 3, [reg(2)])],
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false
			}
		});
		expect(selectRaceView(withRedline, { 0: ['gears:1'] }, 'p1', 0).canPairRedline).toBe(true);

		const noRedline = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false
			}
		});
		expect(selectRaceView(noRedline, { 0: ['gears:1'] }, 'p1', 0).canPairRedline).toBe(false);
	});

	it('cannot pair a Redline on a solo turn — only one card may be selected', () => {
		// Open solo turn (car 0 has a free space ahead), Redline in hand, main selected.
		const open = makeState({ cars: [car(0, 0, [reg(1), redline]), car(1, 5, [reg(2)])] });
		expect(selectRaceView(open, { 0: ['gears:1'] }, 'p1', 0).canPairRedline).toBe(false);
	});
});

// ─── Turn prompt ──────────────────────────────────────────────────────────────

describe('turnPrompt', () => {
	const label = (carId: number) => `Car #${livery(carId).number}`;

	it('qualifying: prompts the viewer while their car is still to lock in', () => {
		const state = makeState({ phase: 'qualifying' });
		const p = turnPrompt(state, [0]);
		expect(p.title).toBe('Qualifying');
		expect(p.subtitle).toMatch(/pick a card/i);
	});

	it('qualifying: prompts per-car when both of the viewer cars are pending', () => {
		const state = makeState({
			phase: 'qualifying',
			players: [{ id: 'p1', name: 'Alice', carIds: [0, 1], isHost: true, connected: true }]
		});
		expect(turnPrompt(state, [0, 1]).subtitle).toMatch(/each of your cars/i);
	});

	it('qualifying: waits once the viewer car has locked in', () => {
		const state = makeState({ phase: 'qualifying', pendingThisRound: [1] });
		expect(turnPrompt(state, [0]).subtitle).toMatch(/waiting/i);
	});

	it('race: tells the viewer it is their turn when their car is on the clock', () => {
		// Default state: car 0 (pos 2) is the lowest-position pending car.
		const p = turnPrompt(makeState(), [0]);
		expect(p.title).toBe('Your turn');
	});

	it('race: labels the car on the clock when waiting', () => {
		const p = turnPrompt(makeState(), [1]);
		expect(p.title).toBe(`${label(0)}'s turn`);
		expect(p.subtitle).toMatch(/waiting/i);
	});

	it('challenge: prompts the uncommitted challenger to attack the defender', () => {
		const state = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false
			}
		});
		const p = turnPrompt(state, [0]);
		expect(p.title).toBe('Attack!');
		expect(p.subtitle).toContain(label(1));
	});

	it('challenge: prompts the uncommitted defender to hold off the challenger', () => {
		const state = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false
			}
		});
		const p = turnPrompt(state, [1]);
		expect(p.title).toBe('Defend!');
		expect(p.subtitle).toContain(label(0));
	});

	it('challenge: a committed side waits on the other', () => {
		const state = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: true,
				defenderCommitted: false
			}
		});
		const p = turnPrompt(state, [0]);
		expect(p.title).toBe('Challenge');
		expect(p.subtitle).toContain(label(1));
	});

	it('challenge: an uninvolved viewer sees who is duelling', () => {
		const state = makeState({
			pendingChallenge: {
				challengerCarId: 0,
				defenderCarId: 1,
				challengerCommitted: false,
				defenderCommitted: false
			}
		});
		const p = turnPrompt(state, []);
		expect(p.title).toBe('Challenge!');
		expect(p.subtitle).toContain(label(0));
		expect(p.subtitle).toContain(label(1));
	});
});
