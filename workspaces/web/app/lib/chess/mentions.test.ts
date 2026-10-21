import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { findMentions } from './mentions';

// 1. e4 e5 2. Nf3 Nc6 3. Bc4, black to move
const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

describe('findMentions', () => {
	it('draws legal moves as arrows', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('Maybe Bc5, or Nf6 to hit e4.', chess)).toEqual(
			expect.arrayContaining([
				{ kind: 'arrow', from: 'f8', to: 'c5' },
				{ kind: 'arrow', from: 'g8', to: 'f6' },
				{ kind: 'square', square: 'e4' }
			])
		);
	});

	it('leaves recited lists of moves unmarked', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('My moves are Nf6, Bc5, Be7, d6 or h6.', chess)).toEqual([]);
		expect(findMentions('Options: Nf6 Bc5 and d6. Bc5 eyes f2.', chess)).toEqual([
			{ kind: 'arrow', from: 'f8', to: 'c5' },
			{ kind: 'square', square: 'f2' }
		]);
	});

	it('leaves quotes and talk about the prompt unmarked', () => {
		const chess = new Chess(ITALIAN);
		expect(
			findMentions('The user says "play Bc5". My legal moves include Nf6. I like d6.', chess)
		).toEqual([{ kind: 'arrow', from: 'd7', to: 'd6' }]);
	});

	it('reads moves written out in words', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('the knight to f6 looks natural', chess)).toEqual([
			{ kind: 'arrow', from: 'g8', to: 'f6' }
		]);
	});

	it('marks pieces named with their square', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('your bishop on c4 eyes f7', chess)).toEqual([
			{ kind: 'piece', square: 'c4' },
			{ kind: 'square', square: 'f7' }
		]);
	});

	it('marks pieces named by whose they are', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('my queen is safe', chess)).toEqual([{ kind: 'piece', square: 'd8' }]);
		expect(findMentions('your knights', chess)).toEqual([
			{ kind: 'piece', square: 'f3' },
			{ kind: 'piece', square: 'b1' }
		]);
	});

	it('reads a piece written in notation that is not a move as the piece', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('Nf3 is attacking e5', chess)).toEqual([
			{ kind: 'piece', square: 'f3' },
			{ kind: 'square', square: 'e5' }
		]);
	});

	it('ignores what is not on the board', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('a knight is worth three pawns; Qz9 is not a move', chess)).toEqual([]);
	});

	it('outlines a bare empty square rather than marking a piece', () => {
		const chess = new Chess(ITALIAN);
		expect(findMentions('The d3 square is weak.', chess)).toEqual([
			{ kind: 'square', square: 'd3' }
		]);
	});
});
