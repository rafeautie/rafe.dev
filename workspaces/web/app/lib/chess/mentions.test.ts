import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { findConsidered } from './mentions';

function after(...moves: string[]) {
	const chess = new Chess();
	for (const move of moves) chess.move(move);
	return chess;
}

describe('findConsidered', () => {
	const chess = after('e4', 'e5', 'Nf3');

	it('reads the moves it names, its own and its opponent’s', () => {
		const text =
			'White threatens Nxe5, winning a pawn. Nc6 guards it and develops; d6 does too but is passive.\n';
		expect(findConsidered(text, chess).map(({ san, threat }) => [san, threat])).toEqual([
			['Nxe5', true],
			['Nc6', false],
			['d6', false]
		]);
		expect(findConsidered(text, chess)[0].mention).toEqual({ kind: 'arrow', from: 'f3', to: 'e5' });
	});

	it('waits for a move to be written out, and skips ones that are not legal', () => {
		expect(findConsidered('I like Nc6', chess)).toEqual([]);
		expect(findConsidered('Maybe Qz9 or Ke3 here.', chess)).toEqual([]);
	});

	it('skips a recited list of moves', () => {
		expect(findConsidered('My moves are Nc6, Nf6, d6 or a6. ', chess)).toEqual([]);
	});
});
