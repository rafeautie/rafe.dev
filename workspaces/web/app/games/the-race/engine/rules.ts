import type { Card, Car, Score } from './types';
import { effectiveValue } from './cards';

// ─── Game rules (pure) ───────────────────────────────────────────────────────────
//
// Rules over cards and track positions: who wins a Challenge, how finishing
// positions convert to championship points, and how the starting grid is laid out.
// Card vocabulary lives in cards.ts; these compose it into game outcomes. The
// state machine (engine.ts) calls these but holds none of them itself.

const POINTS = [9, 6, 4, 3, 2, 1] as const;

export function resolveChallenge(
	challengerCard: Card,
	defenderCard: Card,
	challengerModifier = 0,
	defenderModifier = 0
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
		points: POINTS[i] ?? 0
	}));
}
