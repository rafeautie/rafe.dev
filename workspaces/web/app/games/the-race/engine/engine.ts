import type {
	Action,
	ActionResult,
	Card,
	Car,
	CreateGameOpts,
	CreateGamePlayer,
	GameState,
	Player,
	RaceCarResult,
	RaceEvent
} from './types';
import { canExtendWithCard, leaderPos, occupiedPositions } from './legalMoves';
import { createDeck, effectiveValue, isExtendCard } from './cards';
import { buildStartingGrid, computeScores, resolveChallenge } from './rules';
import { accrueRace, emptySeason } from './season';
import {
	challengeResolvedEvent,
	discardedEvent,
	extendedEvent,
	gameStartedEvent,
	qualifyingLockedInEvent,
	qualifyRevealEvents
} from './events';

// ─── State helpers ────────────────────────────────────────────────────────────

const HAND_SIZE = 13;

function drawCards(car: Car, count: number): Car {
	const needed = Math.min(count, car.deck.length);
	const drawn = car.deck.slice(0, needed);
	return {
		...car,
		hand: [...car.hand, ...drawn],
		deck: car.deck.slice(needed)
	};
}

function isOutOfCards(car: Car): boolean {
	return car.hand.length === 0 && car.deck.length === 0;
}

function removeFromPending(state: GameState, carId: number): GameState {
	return { ...state, pendingThisRound: state.pendingThisRound.filter((id) => id !== carId) };
}

function carById(state: GameState, id: number): Car {
	const car = state.cars.find((c) => c.id === id);
	if (!car) throw new Error(`Car ${id} not found`);
	return car;
}

function updateCar(state: GameState, updated: Car): GameState {
	return { ...state, cars: state.cars.map((c) => (c.id === updated.id ? updated : c)) };
}

function leaderPosition(state: GameState): number {
	return Math.max(...state.cars.map((c) => c.position));
}

function isLeader(state: GameState, carId: number): boolean {
	return carById(state, carId).position === leaderPosition(state);
}

/** True when the car is locked into the current pending challenge (either side). */
function isInChallenge(state: GameState, carId: number): boolean {
	const pc = state.pendingChallenge;
	return !!pc && (pc.challengerCarId === carId || pc.defenderCarId === carId);
}

/** True when another car sits directly ahead (position + 1), forcing a challenge. */
function hasCarDirectlyAhead(state: GameState, carId: number): boolean {
	return occupiedPositions(state).has(carById(state, carId).position + 1);
}

function autoDeclareChallengeIfNeeded(state: GameState): GameState {
	if (state.pendingThisRound.length === 0) return state;
	if (state.pendingChallenge) return state;
	const nextCarId = state.pendingThisRound[0]!;
	const nextCar = state.cars.find((c) => c.id === nextCarId);
	if (!nextCar) return state;
	const carAhead = state.cars.find((c) => c.position === nextCar.position + 1);
	if (carAhead) {
		return {
			...state,
			pendingChallenge: { challengerCarId: nextCarId, defenderCarId: carAhead.id }
		};
	}
	return state;
}

function advanceRoundIfDone(state: GameState): GameState {
	if (state.pendingThisRound.length > 0) {
		return autoDeclareChallengeIfNeeded(state);
	}

	if (state.endAfterRound) {
		return enterResults(state);
	}

	// Start next round: deal up to HAND_SIZE cards from each car's remaining deck,
	// then sort ascending position so last-place acts first.
	const carsAfterDraw = state.cars.map((car) => drawCards(car, HAND_SIZE - car.hand.length));
	const sorted = [...carsAfterDraw].sort((a, b) => a.position - b.position);
	const s: GameState = {
		...state,
		cars: carsAfterDraw,
		pendingThisRound: sorted.map((c) => c.id),
		challengeWinsThisTurn: 0
	};
	return autoDeclareChallengeIfNeeded(s);
}

function cardsByIds(hand: Card[], ids: string[]): Card[] {
	return ids.map((id) => {
		const card = hand.find((c) => c.id === id);
		if (!card) throw new Error(`Card ${id} not in hand`);
		return card;
	});
}

function removeCardsByIds(hand: Card[], ids: string[]): Card[] {
	// Remove one card per id (not every card sharing it). With the real deck every
	// id is unique so this matches a plain filter; it stays correct even if a hand
	// ever holds two cards with the same id (e.g. synthetic test hands).
	const remaining = [...ids];
	return hand.filter((c) => {
		const i = remaining.indexOf(c.id);
		if (i === -1) return true;
		remaining.splice(i, 1);
		return false;
	});
}

// Transition into the results phase, accruing this Race's per-car fact-table rows
// into the Season (ADR 0005). Reached exactly once per Race — no turn action is
// legal once the phase is 'results' — so this is the single producer of a
// RaceResult. Rank and points come from computeScores; the rest from the Car's
// accumulated counters (overtakes/defenses) and its snapshotted starting grid.
function enterResults(state: GameState): GameState {
	const carsById = new Map(state.cars.map((c) => [c.id, c]));
	const rows: RaceCarResult[] = computeScores(state.cars).map((score) => {
		const car = carsById.get(score.carId);
		return {
			carId: score.carId,
			rank: score.rank,
			points: score.points,
			gridPosition: car?.gridPosition ?? car?.position ?? 0,
			overtakes: car?.overtakes ?? 0,
			defensesHeld: car?.defensesHeld ?? 0
		};
	});
	return { ...state, phase: 'results', season: accrueRace(state.season, rows) };
}

// ─── applyAction ─────────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: Action): ActionResult {
	switch (action.type) {
		case 'START_GAME': {
			const cars = state.cars.map((car) => drawCards(car, HAND_SIZE));
			const sorted = [...cars].sort((a, b) => a.position - b.position);
			return {
				state: {
					...state,
					phase: 'qualifying',
					cars,
					pendingThisRound: sorted.map((c) => c.id),
					endAfterRound: false,
					challengeWinsThisTurn: 0,
					qualifyingCards: {}
				},
				events: [gameStartedEvent()]
			};
		}

		case 'QUALIFY': {
			if (state.qualifyingCards[action.carId])
				throw new Error(`Car ${action.carId} has already qualified`);
			const car = carById(state, action.carId);
			const played = cardsByIds(car.hand, action.cardIds);
			const updatedCar: Car = {
				...car,
				hand: removeCardsByIds(car.hand, action.cardIds),
				discard: [...car.discard, ...played]
			};
			let s = updateCar(state, updatedCar);
			s = {
				...s,
				qualifyingCards: { ...s.qualifyingCards, [action.carId]: played }
			};
			s = removeFromPending(s, action.carId);

			// Still cars to qualify — this one just locked in (blind until the reveal).
			if (s.pendingThisRound.length > 0) {
				return {
					state: s,
					events: played.length > 0 ? [qualifyingLockedInEvent(action.carId)] : []
				};
			}

			// All cars qualified — assign starting positions
			const rankings = s.cars.map((c) => {
				const cards = s.qualifyingCards[c.id] ?? [];
				const value = cards.reduce(
					(sum, card) => sum + effectiveValue(card, cards.length > 1 && card.kind === 'redline'),
					0
				);
				return { carId: c.id, value };
			});
			// Sort descending by value; ties resolved by Math.random()
			rankings.sort((a, b) => b.value - a.value || Math.random() - 0.5);
			const positions = buildStartingGrid(rankings.length);
			const updatedCars = s.cars.map((car) => {
				const rank = rankings.findIndex((r) => r.carId === car.id);
				// pole = highest index, last = 0
				const startPos = positions[rankings.length - 1 - rank]!;
				// Snapshot the starting grid slot for "places gained" (Driver of the Day).
				return { ...car, position: startPos, gridPosition: startPos };
			});

			// Reveal every car's qualifying selection (grid order, pole first) then gridSet.
			// Captured before raceStart clears qualifyingCards.
			const revealEvents = qualifyRevealEvents(
				[...updatedCars].sort((a, b) => b.position - a.position),
				s.qualifyingCards
			);

			const sorted = [...updatedCars].sort((a, b) => a.position - b.position);
			const raceStart: GameState = {
				...s,
				phase: 'race',
				cars: updatedCars,
				pendingThisRound: sorted.map((c) => c.id),
				qualifyingCards: {}
			};
			return { state: autoDeclareChallengeIfNeeded(raceStart), events: revealEvents };
		}

		case 'DISCARD': {
			const car = carById(state, action.carId);
			// Discard is a solo-turn action: only legal when the car has a free
			// space directly ahead. If a car is directly ahead the car must
			// challenge; if it is mid-challenge it must commit challenge cards.
			if (isInChallenge(state, action.carId))
				throw new Error('Cannot discard during a challenge — commit challenge cards instead');
			if (hasCarDirectlyAhead(state, action.carId))
				throw new Error('Cannot discard — a car is directly ahead; you must challenge');
			const card = car.hand.find((c) => c.id === action.cardId);
			if (!card) throw new Error(`Card ${action.cardId} not in hand`);
			const updatedCar: Car = {
				...car,
				hand: removeCardsByIds(car.hand, [action.cardId]),
				discard: [...car.discard, card]
			};

			let s = updateCar(state, updatedCar);
			const events: RaceEvent[] = [discardedEvent(action.carId, card)];

			if (isOutOfCards(carById(s, action.carId))) {
				s = removeFromPending(s, action.carId);
				if (isLeader(s, action.carId)) return { state: enterResults(s), events };
				return { state: advanceRoundIfDone({ ...s, endAfterRound: true }), events };
			}

			s = removeFromPending(s, action.carId);
			return { state: advanceRoundIfDone(s), events };
		}

		case 'EXTEND': {
			const car = carById(state, action.carId);
			// Extend is a solo-turn action — illegal while locked into a challenge.
			if (isInChallenge(state, action.carId))
				throw new Error('Cannot extend during a challenge — commit challenge cards instead');
			const card = car.hand.find((c) => c.id === action.cardId);
			if (!card) throw new Error(`Card ${action.cardId} not in hand`);
			if (!isExtendCard(card)) throw new Error('Only cards with value 1–3 can extend');
			// Use canExtendWithCard — the shared predicate also used by carLegalMoves on the
			// client. The occupied-position and Drafting-card/leader rules live there.
			if (!canExtendWithCard(card, car.position, leaderPos(state), occupiedPositions(state))) {
				// isExtendCard already passed; the failure is either a car directly
				// ahead (must challenge) or the leader using the Drafting card.
				if (hasCarDirectlyAhead(state, action.carId)) {
					throw new Error('Cannot extend — a car is directly ahead; you must challenge');
				}
				throw new Error('Leader cannot use the Drafting Extend card to extend');
			}

			const newPosition = car.position + 1;
			const updatedCar: Car = {
				...car,
				position: newPosition,
				hand: removeCardsByIds(car.hand, [action.cardId]),
				discard: [...car.discard, card]
			};
			let s = updateCar(state, updatedCar);
			const events: RaceEvent[] = [extendedEvent(action.carId, card, newPosition)];

			if (isOutOfCards(carById(s, action.carId))) {
				s = removeFromPending(s, action.carId);
				if (isLeader(s, action.carId)) return { state: enterResults(s), events };
				return { state: advanceRoundIfDone({ ...s, endAfterRound: true }), events };
			}

			s = removeFromPending(s, action.carId);
			return { state: advanceRoundIfDone(s), events };
		}

		case 'COMMIT_CHALLENGE_CARDS': {
			if (!state.pendingChallenge) throw new Error('No active challenge');
			const { challengerCarId, defenderCarId, challengerCards, defenderCards } =
				state.pendingChallenge;
			const isChallenger = action.carId === challengerCarId;
			const isDefender = action.carId === defenderCarId;
			if (!isChallenger && !isDefender)
				throw new Error(`Car ${action.carId} is not part of this challenge`);
			if (isChallenger && challengerCards)
				throw new Error('Challenger has already committed cards');
			if (isDefender && defenderCards) throw new Error('Defender has already committed cards');

			const car = carById(state, action.carId);
			const played = cardsByIds(car.hand, action.cardIds);
			let s = updateCar(state, { ...car, hand: removeCardsByIds(car.hand, action.cardIds) });

			const newChallenge = isChallenger
				? { ...s.pendingChallenge!, challengerCards: played }
				: { ...s.pendingChallenge!, defenderCards: played };
			s = { ...s, pendingChallenge: newChallenge };

			// Partial commit — wait for the other side (no event yet)
			if (!newChallenge.challengerCards || !newChallenge.defenderCards)
				return { state: s, events: [] };

			// Both committed — resolve
			const cPlayed = newChallenge.challengerCards;
			const dPlayed = newChallenge.defenderCards;
			s = { ...s, pendingChallenge: undefined };

			const chal = carById(s, challengerCarId);
			s = updateCar(s, { ...chal, discard: [...chal.discard, ...cPlayed] });
			const def = carById(s, defenderCarId);
			s = updateCar(s, { ...def, discard: [...def.discard, ...dPlayed] });

			const cMain = cPlayed.find((c) => c.kind !== 'redline') ?? cPlayed[0]!;
			const cRedline = cPlayed.find((c) => c.kind === 'redline');
			const dMain = dPlayed.find((c) => c.kind !== 'redline') ?? dPlayed[0]!;
			const dRedline = dPlayed.find((c) => c.kind === 'redline');
			const outcome = resolveChallenge(
				cMain,
				dMain,
				cRedline ? effectiveValue(cRedline, true) : 0,
				dRedline ? effectiveValue(dRedline, true) : 0
			);

			if (outcome === 'challenger') {
				const chalPos = carById(s, challengerCarId).position;
				const defPos = carById(s, defenderCarId).position;
				s = updateCar(s, { ...carById(s, challengerCarId), position: defPos });
				s = updateCar(s, { ...carById(s, defenderCarId), position: chalPos });
				// A won challenge is an overtake — the challenger gains a place. A
				// double-win turn resolves as two challenges, so this lands twice.
				s = updateCar(s, {
					...carById(s, challengerCarId),
					overtakes: (carById(s, challengerCarId).overtakes ?? 0) + 1
				});
				s = removeFromPending(s, defenderCarId);
				const wins = s.challengeWinsThisTurn + 1;
				s = { ...s, challengeWinsThisTurn: wins };
				if (wins >= 2) {
					s = removeFromPending(s, challengerCarId);
					s = { ...s, challengeWinsThisTurn: 0 };
				}
			} else {
				// The defender held its position — a defender win and a tie both keep
				// the place, so both count as a defense held.
				s = updateCar(s, {
					...carById(s, defenderCarId),
					defensesHeld: (carById(s, defenderCarId).defensesHeld ?? 0) + 1
				});
				s = removeFromPending(s, challengerCarId);
				s = { ...s, challengeWinsThisTurn: 0 };
			}

			let leaderRanOut = false;
			for (const carId of [challengerCarId, defenderCarId]) {
				if (isOutOfCards(carById(s, carId))) {
					s = removeFromPending(s, carId);
					if (isLeader(s, carId)) leaderRanOut = true;
					else s = { ...s, endAfterRound: true };
				}
			}

			const events: RaceEvent[] = [
				challengeResolvedEvent({
					challengerCarId,
					challengerCards: cPlayed,
					defenderCarId,
					defenderCards: dPlayed,
					outcome
				})
			];
			if (leaderRanOut) return { state: enterResults(s), events };
			return { state: advanceRoundIfDone(s), events };
		}

		case 'PLAY_AGAIN': {
			return {
				state: {
					...state,
					phase: 'lobby',
					cars: [],
					pendingThisRound: [],
					endAfterRound: false,
					challengeWinsThisTurn: 0,
					qualifyingCards: {},
					pendingChallenge: undefined,
					season: emptySeason()
				},
				events: []
			};
		}

		default: {
			return { state, events: [] };
		}
	}
}

// ─── Authorization ─────────────────────────────────────────────────────────────

/** True when `playerId` controls the car `carId` in this game. */
export function ownsCar(state: GameState, playerId: string, carId: number): boolean {
	return state.players.find((p) => p.id === playerId)?.carIds.includes(carId) ?? false;
}

// ─── createGame ───────────────────────────────────────────────────────────────
//
// Pure factory that builds the initial GameState (cars with dealt hands, engine
// players). All non-determinism is injected so the function is fully testable.
//
// Parameters:
//   players     – lobby players (id, isHost).
//   opts.suits  – the ordered list of suits to assign, one per car. The caller
//                 is responsible for shuffling / selecting suits.
//   opts.rng    – optional seeded RNG; defaults to Math.random. Used only for
//                 the combined-deck shuffle inside createGame.
//
// Dealing strategy: one suit-deck per car, all combined and shuffled together,
// then 13 cards dealt to each car in player×car order — matching production.

export function createGame(players: CreateGamePlayer[], opts: CreateGameOpts): GameState {
	const { suits, rng = Math.random, season = emptySeason() } = opts;
	const carsPerPlayer = opts.carsPerPlayer ?? 1;
	const numCars = players.length * carsPerPlayer;

	if (suits.length < numCars) {
		throw new Error(`Need at least ${numCars} suits, got ${suits.length}`);
	}

	// Build one combined deck (one suit per car), shuffle it deterministically
	// using the provided rng, then deal 13 cards to each car.
	const assignedSuits = suits.slice(0, numCars);
	const combined: Card[] = assignedSuits.flatMap((suit) => createDeck(suit));

	// Fisher-Yates using the injected rng
	const shuffled = [...combined];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
	}

	const cars: Car[] = [];
	const enginePlayers: Player[] = [];
	const pool = [...shuffled];

	players.forEach((p, pi) => {
		const carIds: number[] = [];
		for (let c = 0; c < carsPerPlayer; c++) {
			const carId = pi * carsPerPlayer + c;
			const hand = pool.splice(0, HAND_SIZE);
			cars.push({
				id: carId,
				position: 0,
				hand,
				deck: [],
				discard: [],
				overtakes: 0,
				defensesHeld: 0,
				gridPosition: 0
			});
			carIds.push(carId);
		}
		enginePlayers.push({ id: p.id, carIds, isHost: p.isHost });
	});

	return {
		phase: 'lobby',
		players: enginePlayers,
		cars,
		pendingThisRound: [],
		endAfterRound: false,
		challengeWinsThisTurn: 0,
		qualifyingCards: {},
		season
	};
}
