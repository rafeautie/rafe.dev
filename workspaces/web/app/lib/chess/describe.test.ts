import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { describeMove } from './describe';

function last(pgn: string) {
	const chess = new Chess();
	chess.loadPgn(pgn);
	const { notes, ...rest } = describeMove(chess.history({ verbose: true }).at(-1)!);
	return { ...rest, notes: notes.map((note) => note.text) };
}

describe('describeMove', () => {
	it('names the piece and its squares', () => {
		expect(last('1. e4 Nf6')).toEqual({ title: 'Knight to f6', from: 'from g8', notes: [] });
	});

	it('spells out captures and check', () => {
		expect(last('1. e4 e5 2. Bc4 Nc6 3. Bxf7+')).toEqual({
			title: 'Bishop to f7',
			from: 'from c4',
			notes: ['Takes the pawn', 'Check']
		});
	});

	it('calls checkmate', () => {
		expect(last('1. f3 e5 2. g4 Qh4#').notes).toEqual(['Checkmate']);
	});

	it('names castling', () => {
		expect(last('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O')).toEqual({
			title: 'Castles kingside',
			notes: []
		});
	});

	it('names en passant and promotion', () => {
		expect(last('1. e4 a6 2. e5 d5 3. exd6').notes).toEqual(['Takes the pawn en passant']);
		const chess = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
		const move = chess.move('a8=Q');
		expect(describeMove(move).notes).toEqual([
			{ kind: 'promotion', text: 'Promotes to a queen', piece: 'q' }
		]);
	});
});
