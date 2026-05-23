import type { Action, Card, Car, GameState, Score } from './types';

// ─── Deck ─────────────────────────────────────────────────────────────────────

export function createDeck(_suit: string): Card[] {
	const cards: Card[] = [];
	for (let v = 1; v <= 12; v++) {
		cards.push({ kind: 'regular', value: v });
	}
	cards.push({ kind: 'redline' });
	return cards;
}

export function shuffleDeck(deck: Card[]): Card[] {
	const out = [...deck];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

const POINTS = [9, 6, 4, 3, 2, 1] as const;

export function effectiveValue(card: Card, paired?: boolean): number {
	if (card.kind === 'regular') return card.value;
	return paired ? 2 : 0;
}

export function resolveChallenge(
	challengerCard: Card,
	defenderCard: Card,
	challengerModifier = 0,
	defenderModifier = 0,
): 'challenger' | 'defender' | 'tie' {
	const c = effectiveValue(challengerCard) + challengerModifier;
	const d = effectiveValue(defenderCard) + defenderModifier;
	if (c > d) return 'challenger';
	if (d > c) return 'defender';
	return 'tie';
}

export function buildStartingGrid(numCars: number): number[] {
	return Array.from({ length: numCars }, (_, i) => i);
}

export function computeScores(cars: Car[]): Score[] {
	const sorted = [...cars].sort((a, b) => b.position - a.position);
	return sorted.map((car, i) => ({
		carId: car.id,
		rank: i + 1,
		points: POINTS[i] ?? 0,
	}));
}

// ─── State helpers ────────────────────────────────────────────────────────────

const HAND_SIZE = 5;

function drawCards(car: Car, count: number): Car {
	const needed = Math.min(count, car.deck.length);
	const drawn = car.deck.slice(0, needed);
	return {
		...car,
		hand: [...car.hand, ...drawn],
		deck: car.deck.slice(needed),
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

function advanceRoundIfDone(state: GameState): GameState {
	if (state.pendingThisRound.length > 0) return state;

	if (state.endAfterRound) {
		return { ...state, phase: 'results' };
	}

	// Start next round — all car IDs, sorted ascending position (last-place acts first)
	const sorted = [...state.cars].sort((a, b) => a.position - b.position);
	return {
		...state,
		pendingThisRound: sorted.map((c) => c.id),
		challengeWinsThisTurn: 0,
	};
}

function cardsAt(hand: Card[], indices: number[]): Card[] {
	return indices.map((i) => {
		const card = hand[i];
		if (!card) throw new Error(`Card index ${i} out of range`);
		return card;
	});
}

function removeCards(hand: Card[], indices: number[]): Card[] {
	const idxSet = new Set(indices);
	return hand.filter((_, i) => !idxSet.has(i));
}

// ─── applyAction ─────────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: Action): GameState {
	switch (action.type) {
		case 'START_GAME': {
			const cars = state.cars.map((car) => drawCards(car, HAND_SIZE));
			const sorted = [...cars].sort((a, b) => a.position - b.position);
			return {
				...state,
				phase: 'qualifying',
				cars,
				pendingThisRound: sorted.map((c) => c.id),
				endAfterRound: false,
				challengeWinsThisTurn: 0,
				qualifyingCards: {},
			};
		}

		case 'QUALIFY': {
			const car = carById(state, action.carId);
			const played = cardsAt(car.hand, action.cardIndices);
			const updatedCar: Car = {
				...car,
				hand: removeCards(car.hand, action.cardIndices),
				discard: [...car.discard, ...played],
			};
			let s = updateCar(state, updatedCar);
			s = {
				...s,
				qualifyingCards: { ...s.qualifyingCards, [action.carId]: played },
			};
			s = removeFromPending(s, action.carId);

			if (s.pendingThisRound.length > 0) return s;

			// All cars qualified — assign starting positions
			const rankings = s.cars.map((c) => {
				const cards = s.qualifyingCards[c.id] ?? [];
				const value = cards.reduce(
					(sum, card, i) =>
						sum + effectiveValue(card, cards.length > 1 && card.kind === 'redline'),
					0,
				);
				return { carId: c.id, value };
			});
			// Sort descending by value; ties resolved by Math.random()
			rankings.sort((a, b) => b.value - a.value || Math.random() - 0.5);
			const positions = buildStartingGrid(rankings.length);
			const updatedCars = s.cars.map((car) => {
				const rank = rankings.findIndex((r) => r.carId === car.id);
				// pole = highest index, last = 0
				return { ...car, position: positions[rankings.length - 1 - rank]! };
			});

			const sorted = [...updatedCars].sort((a, b) => a.position - b.position);
			return {
				...s,
				phase: 'race',
				cars: updatedCars,
				pendingThisRound: sorted.map((c) => c.id),
				qualifyingCards: {},
			};
		}

		case 'DISCARD': {
			const car = carById(state, action.carId);
			const card = car.hand[action.cardIndex];
			if (!card) throw new Error(`Card index ${action.cardIndex} out of range`);
			let updatedCar: Car = {
				...car,
				hand: removeCards(car.hand, [action.cardIndex]),
				discard: [...car.discard, card],
			};

			let s = updateCar(state, updatedCar);

			if (isOutOfCards(s.cars.find((c) => c.id === action.carId)!)) {
				s = { ...s, endAfterRound: true };
			}

			s = removeFromPending(s, action.carId);
			return advanceRoundIfDone(s);
		}

		case 'EXTEND': {
			const car = carById(state, action.carId);
			const card = car.hand[action.cardIndex];
			if (!card) throw new Error(`Card index ${action.cardIndex} out of range`);

			// Leader cannot use the Drafting card (value 3) to extend
			if (card.kind === 'regular' && card.value === 3 && car.position === leaderPosition(state)) {
				throw new Error('Leader cannot use the Drafting Extend card to extend');
			}

			const updatedCar: Car = {
				...car,
				position: car.position + 1,
				hand: removeCards(car.hand, [action.cardIndex]),
				discard: [...car.discard, card],
			};
			let s = updateCar(state, updatedCar);
			s = removeFromPending(s, action.carId);
			return advanceRoundIfDone(s);
		}

		case 'CHALLENGE': {
			const car = carById(state, action.carId);
			const played = cardsAt(car.hand, action.cardIndices);
			const updatedCar: Car = {
				...car,
				hand: removeCards(car.hand, action.cardIndices),
			};
			return {
				...updateCar(state, updatedCar),
				pendingChallenge: {
					challengerCarId: action.carId,
					challengerCards: played,
					defenderCarId: action.defenderCarId,
				},
			};
		}

		case 'DEFEND': {
			if (!state.pendingChallenge) throw new Error('No pending challenge');
			const { challengerCarId, challengerCards, defenderCarId } = state.pendingChallenge;

			const defender = carById(state, defenderCarId);
			const defenderPlayed = cardsAt(defender.hand, action.cardIndices);
			let updatedDefender: Car = {
				...defender,
				hand: removeCards(defender.hand, action.cardIndices),
				discard: [...defender.discard, ...defenderPlayed],
			};

			// Compute effective values
			const cMain = challengerCards.find((c) => c.kind !== 'redline') ?? challengerCards[0]!;
			const cRedline = challengerCards.find((c) => c.kind === 'redline');
			const dMain = defenderPlayed.find((c) => c.kind !== 'redline') ?? defenderPlayed[0]!;
			const dRedline = defenderPlayed.find((c) => c.kind === 'redline');

			const outcome = resolveChallenge(
				cMain,
				dMain,
				cRedline ? effectiveValue(cRedline, true) : 0,
				dRedline ? effectiveValue(dRedline, true) : 0,
			);

			let s: GameState = { ...state, pendingChallenge: undefined };
			s = updateCar(s, updatedDefender);

			const challenger = carById(s, challengerCarId);
			// Also move challenger's played cards to discard
			const updatedChallenger: Car = {
				...challenger,
				discard: [...challenger.discard, ...challengerCards],
			};
			s = updateCar(s, updatedChallenger);

			if (outcome === 'challenger') {
				// Swap positions
				const chalPos = carById(s, challengerCarId).position;
				const defPos = carById(s, defenderCarId).position;
				s = updateCar(s, { ...carById(s, challengerCarId), position: defPos });
				s = updateCar(s, { ...carById(s, defenderCarId), position: chalPos });

				// Cancel defender's turn
				s = removeFromPending(s, defenderCarId);

				// Check outOfCards for defender
				if (isOutOfCards(carById(s, defenderCarId))) {
					s = { ...s, endAfterRound: true };
				}

				// Increment win count; end challenger turn after 2 wins
				const wins = s.challengeWinsThisTurn + 1;
				s = { ...s, challengeWinsThisTurn: wins };
				if (wins >= 2) {
					s = removeFromPending(s, challengerCarId);
					s = { ...s, challengeWinsThisTurn: 0 };
					s = advanceRoundIfDone(s);
				}
			} else {
				// Challenger loses or ties — end challenger's turn
				s = removeFromPending(s, challengerCarId);
				s = { ...s, challengeWinsThisTurn: 0 };
				s = advanceRoundIfDone(s);
			}

			return s;
		}

		case 'PLAY_AGAIN': {
			return {
				...state,
				phase: 'lobby',
				cars: [],
				pendingThisRound: [],
				endAfterRound: false,
				challengeWinsThisTurn: 0,
				qualifyingCards: {},
				pendingChallenge: undefined,
			};
		}

		default: {
			const _exhaustive: never = action;
			return state;
		}
	}
}
