import { useCallback, useEffect, useReducer, useState } from 'react';
import { useRaceWebSocket } from './useRaceWebSocket';
import { useRacePresentation, type RaceReveal, type ChallengeReveal } from './useRacePresentation';
import type { PublicGameState, RaceView } from '../engine/types';
import { selectionReducer, getSelection } from '../engine/selection';
import { selectRaceView, autoFocusCarId } from '../engine/raceView';

// ─── Session return type ──────────────────────────────────────────────────────
//
// Everything the race UI needs. Derived state lives in `view` (built by the pure
// selectRaceView projection); selection/intent actions are bound to the
// currently-viewed car so components never thread a carId around.

export interface RaceSession {
	/** Full public game state from server, or null while connecting. */
	state: PublicGameState | null;
	/** Whether the WebSocket is currently connected. */
	connected: boolean;
	/** Stable player ID (from localStorage). */
	playerId: string;
	/** The viewer's PublicPlayer record, or undefined if not yet in the player list. */
	me: PublicGameState['players'][number] | undefined;
	/** Derived view-model for the race screen; null until state arrives. */
	view: RaceView | null;
	/** Standings reveal overlay during a hold (played cards per car), else null. */
	reveal: RaceReveal | null;
	/** Challenge-resolution overlay: the duel's track cards + outcome, else null.
	 *  Named to avoid colliding with the `challenge` commit action below. */
	challengeReveal: ChallengeReveal | null;
	/** True during the grid-set beat: cars spring onto the grid one at a time. */
	gridReveal: boolean;

	// ─── Selection (bound to the viewed car) ──────────────────────────
	/** Switch which of the viewer's cars is shown. */
	setSelectedCarId: (carId: number) => void;
	/** Select or deselect the main card. Pass null to deselect. */
	selectMain: (cardId: string | null) => void;
	/** Toggle the Redline pair (requires a main selection). */
	toggleRedline: () => void;

	// ─── Named intents ────────────────────────────────────────────────
	/** Host: begin the Season (deal Race 1). */
	startSeason: () => void;
	/** Host: deal the next Race of the Season (from the results screen). */
	advanceRace: () => void;
	/** Host: end the Season and return to the lobby. */
	newSeason: () => void;
	/** Rename yourself (lobby only). Persists to localStorage for the next game. */
	renamePlayer: (name: string) => void;
	/** Submit the viewed car's selection — qualify / discard / extend / challenge. */
	qualify: () => void;
	discard: () => void;
	extend: () => void;
	challenge: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRaceSession(gameId: string): RaceSession {
	const { state: serverState, events, playerId, send, connected } = useRaceWebSocket(gameId);
	// Plays (challenge / discard / extend) are held on screen for a beat (see
	// useRacePresentation), so the UI renders from this presentation state — not the
	// raw feed — and `reveal` overlays the played cards in the standings.
	const {
		state,
		reveal,
		challenge: challengeReveal,
		gridReveal
	} = useRacePresentation(serverState, events);
	const [selections, dispatch] = useReducer(selectionReducer, {});
	const [preferredCarId, setSelectedCarId] = useState<number | undefined>(undefined);

	const view = state ? selectRaceView(state, selections, playerId, preferredCarId) : null;
	const carId = view?.selectedCarId;

	// Auto-switch the HandView tab to whichever of the viewer's cars owes a card —
	// but only ONCE per event, never locking the player in. Keyed solely on the
	// pending set (+ tab order), so it fires when a turn opens or when submitting
	// one of two pending cars shrinks the set — the two moments a switch is wanted.
	// A manual tab change does NOT re-trigger it (carId is read, not a dependency),
	// so the player is free to browse their other cars afterwards.
	const needingKey = view?.carsNeedingCard.join(',') ?? '';
	const myCarsKey = view?.myCars.map((c) => c.id).join(',') ?? '';
	useEffect(() => {
		if (!view) return;
		const next = autoFocusCarId(view.myCars, view.carsNeedingCard, carId);
		if (next !== undefined) setSelectedCarId(next);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [needingKey, myCarsKey]);

	// ─── Per-car primitives (bound below to the viewed car) ───────────

	const selectMainForCar = useCallback((id: number, cardId: string | null) => {
		dispatch({ type: 'SELECT_MAIN', carId: id, cardId });
	}, []);

	const toggleRedlineForCar = useCallback(
		(id: number) => {
			const hand = state?.cars.find((c) => c.id === id)?.hand ?? [];
			const redline = hand.find((c) => c.kind === 'redline');
			if (!redline) return;
			dispatch({ type: 'TOGGLE_REDLINE', carId: id, redlineId: redline.id });
		},
		[state]
	);

	const commitForCar = useCallback(
		(id: number, build: (sel: string[]) => Parameters<typeof send>[0]) => {
			const sel = getSelection(selections, id);
			if (sel.length === 0) return;
			send(build(sel));
			dispatch({ type: 'CLEAR', carId: id });
		},
		[send, selections]
	);

	// ─── Bound actions (operate on the currently-viewed car) ──────────

	const selectMain = useCallback(
		(cardId: string | null) => carId !== undefined && selectMainForCar(carId, cardId),
		[carId, selectMainForCar]
	);
	const toggleRedline = useCallback(
		() => carId !== undefined && toggleRedlineForCar(carId),
		[carId, toggleRedlineForCar]
	);

	const startSeason = useCallback(() => send({ type: 'START_SEASON' }), [send]);
	const advanceRace = useCallback(() => send({ type: 'ADVANCE_RACE' }), [send]);
	const newSeason = useCallback(() => send({ type: 'NEW_SEASON' }), [send]);
	const renamePlayer = useCallback(
		(name: string) => {
			send({ type: 'SET_NAME', name });
			if (typeof localStorage !== 'undefined') localStorage.setItem('playerName', name);
		},
		[send]
	);

	const qualify = useCallback(() => {
		if (carId !== undefined)
			commitForCar(carId, (sel) => ({ type: 'QUALIFY', carId, cardIds: sel }));
	}, [carId, commitForCar]);
	const discard = useCallback(() => {
		if (carId !== undefined)
			commitForCar(carId, (sel) => ({ type: 'DISCARD', carId, cardId: sel[0]! }));
	}, [carId, commitForCar]);
	const extend = useCallback(() => {
		if (carId !== undefined)
			commitForCar(carId, (sel) => ({ type: 'EXTEND', carId, cardId: sel[0]! }));
	}, [carId, commitForCar]);
	const challenge = useCallback(() => {
		if (carId !== undefined)
			commitForCar(carId, (sel) => ({ type: 'COMMIT_CHALLENGE_CARDS', carId, cardIds: sel }));
	}, [carId, commitForCar]);

	const me = state?.players.find((p) => p.id === playerId);

	return {
		state,
		connected,
		playerId,
		me,
		view,
		reveal,
		challengeReveal,
		gridReveal,
		setSelectedCarId,
		selectMain,
		toggleRedline,
		startSeason,
		advanceRace,
		newSeason,
		renamePlayer,
		qualify,
		discard,
		extend,
		challenge
	};
}
