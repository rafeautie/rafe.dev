import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { findFacts } from './facts';
import {
	buildMessages,
	drawBoard,
	findMove,
	splitReply,
	type LegalMove,
	type PromptInput
} from './prompt';

function legalMoves(chess: Chess): LegalMove[] {
	return chess
		.moves({ verbose: true })
		.map((move) => ({ san: move.san, uci: move.from + move.to + (move.promotion ?? '') }));
}

function input(chess: Chess, overrides: Partial<PromptInput> = {}): PromptInput {
	return {
		color: chess.turn() === 'w' ? 'white' : 'black',
		board: drawBoard(chess.board()),
		history: chess.history(),
		legal: legalMoves(chess),
		facts: findFacts(chess),
		think: true,
		...overrides
	};
}

describe('buildMessages', () => {
	it('shows the position, the moves so far and the legal moves', () => {
		const chess = new Chess();
		chess.move('e4');
		chess.move('e5');
		const [message] = buildMessages(input(chess));
		expect(message.content).toContain('as white');
		expect(message.content).toContain('5 . . . . p . . .\n4 . . . . P . . .');
		expect(message.content).not.toContain('FEN');
		expect(message.content).toContain('Moves so far: 1. e4 e5');
		expect(message.content).toContain('Nf3');
		expect(message.content).toContain('"Considering:"');
	});

	it('adds facts on their own lines after the list', () => {
		const chess = new Chess();
		const facts = {
			notes: ['exd5: takes a pawn'],
			threats: ['pawn on e4 (by the pawn on d5)'],
			mates: []
		};
		const [message] = buildMessages(input(chess, { facts }));
		expect(message.content).toMatch(
			/Your legal moves: [^\n]*\nAbout some of them:\n- exd5: takes a pawn\nUnder attack: pawn on e4/
		);
	});

	it('only asks it to consider its moves when thinking is on', () => {
		const [message] = buildMessages(input(new Chess(), { think: false }));
		expect(message.content).not.toContain('Considering');
		expect(message.content).toContain('Give your move');
	});

	it('names an answer that was not legal', () => {
		const [message] = buildMessages(input(new Chess(), { retry: 'Ke9' }));
		expect(message.content).toContain('"Ke9", was not one of your legal moves');
	});

	it('stays the same size however long the game runs', () => {
		// a 100-move game of random legal moves, restarted whenever it ends
		const chess = new Chess();
		let seed = 7;
		const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		const history: string[] = [];
		let longest = 0;
		for (let ply = 0; ply < 200; ply++) {
			if (chess.isGameOver()) chess.reset();
			const moves = chess.moves();
			const san = moves[Math.floor(random() * moves.length)];
			chess.move(san);
			history.push(san);
			const [message] = buildMessages(input(chess, { history }));
			longest = Math.max(longest, message.content.length);
		}
		// the board, 20 moves, a few dozen legal moves and notes on the risky
		// ones (random games leave a lot more hanging than real ones)
		expect(longest).toBeLessThan(3000);
		// 200 positions, each with its facts worked out, take several seconds, more on a busy machine
	}, 60_000);

	it('numbers a window that starts on black’s move', () => {
		const history = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'];
		const [message] = buildMessages(input(new Chess(), { history }), 2);
		expect(message.content).toContain('(the latest ones): 2... Nc6 3. Bb5');
	});
});

describe('splitReply', () => {
	it('separates tagged thinking from the answer', () => {
		expect(splitReply('<think>The knight is loose.</think>\nMove: Nf3')).toEqual({
			thinking: 'The knight is loose.',
			answer: 'Move: Nf3',
			closed: true
		});
	});

	it('reads a reply that is still thinking', () => {
		expect(splitReply('<think>If I push e5 then')).toEqual({
			thinking: 'If I push e5 then',
			answer: '',
			closed: false
		});
	});

	it('reads a reply whose template opened the thinking', () => {
		expect(splitReply('Hmm, d4 looks good.</think>\n\nMove: d4', true)).toEqual({
			thinking: 'Hmm, d4 looks good.',
			answer: 'Move: d4',
			closed: true
		});
	});

	it('treats everything before the move line as thinking when there are no tags', () => {
		expect(splitReply('The center matters.\nMove: e4')).toEqual({
			thinking: 'The center matters.',
			answer: 'Move: e4',
			closed: true
		});
	});
});

describe('findMove', () => {
	const legal = legalMoves(new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));

	it('reads the move line', () => {
		expect(findMove('Move: Ra7', legal).move).toBe('Ra7');
		expect(findMove('Move: **Kd1**.', legal).move).toBe('Kd1');
	});

	it('reads castling with zeros, check marks and move numbers', () => {
		expect(findMove('Move: 0-0', legal).move).toBe('O-O');
		expect(findMove('Move: 1.O-O-O', legal).move).toBe('O-O-O');
		expect(findMove('Move: Rxa8+', legal).move).toBe('Rxa8+');
		expect(findMove('Move: Rxa8', legal).move).toBe('Rxa8+');
	});

	it('reads from-to notation', () => {
		expect(findMove('Move: e1g1', legal).move).toBe('O-O');
	});

	it('falls back to the last legal move written', () => {
		expect(findMove('I will play Ra2 or maybe Rb1', legal).move).toBe('Rb1');
	});

	it('gives back what it read when nothing is legal', () => {
		expect(findMove('Move: Qh5', legal)).toEqual({ candidate: 'Qh5' });
		expect(findMove('', legal)).toEqual({});
	});
});
