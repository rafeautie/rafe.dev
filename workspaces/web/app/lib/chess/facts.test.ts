import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { findFacts } from './facts';

function after(...moves: string[]) {
	const chess = new Chess();
	for (const move of moves) chess.move(move);
	return chess;
}

describe('findFacts', () => {
	it('says nothing about quiet moves at the start', () => {
		expect(findFacts(new Chess())).toEqual({ notes: [], threats: [] });
	});

	it('notes captures, checks and pieces left to be taken', () => {
		const { notes } = findFacts(after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4'));
		expect(notes).toContain('Qh4: can be taken by the knight');
		expect(notes).toContain('Qg5: can be taken by the knight');
		expect(notes).not.toContainEqual(expect.stringMatching(/^Nf6:/));
		const takes = findFacts(after('e4', 'd5'));
		expect(takes.notes).toContain('exd5: takes a pawn');
	});

	it('does not count a fair trade as a loss', () => {
		// the bishop takes a defended knight and is taken back by a pawn
		const { notes } = findFacts(after('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'));
		expect(notes).toContain('Bxc6: takes a knight');
	});

	it('calls checkmate', () => {
		const { notes } = findFacts(after('f3', 'e5', 'g4'));
		expect(notes).toContain('Qh4#: checkmate');
	});

	it('lists pieces under attack', () => {
		// a pawn attacks the knight on c6, which pawns guard
		const { threats } = findFacts(after('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'd4', 'a6', 'd5'));
		expect(threats).toContain('knight on c6 (by the pawn on d5)');
	});
});
