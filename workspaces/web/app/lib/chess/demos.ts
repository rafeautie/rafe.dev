import { Chess } from 'chess.js';
import type { Entry } from './storage';

// Finished games to look at how each ending shows, opened with ?demo=win,
// ?demo=loss or ?demo=draw while developing. They're never saved over the
// game in progress.

export type Demo = 'win' | 'loss' | 'draw';

// The model's thinking for each of its moves, in the order it played them
const GAMES: Record<Demo, { moves: string[]; thoughts: string[] }> = {
	// Scholar's mate
	win: {
		moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
		thoughts: [
			'White has taken the centre with e4. e5 stakes my own claim to it, Nf6 hits the e4 pawn, and c5 fights for d4 from the side.',
			'The bishop on c4 eyes f7. Nc6 develops and guards e5, Nf6 develops and covers h5, and Bc5 mirrors White.',
			'The queen on h5 attacks e5 and, with the bishop, f7. Nf6 develops and attacks the queen, g6 kicks it away, and Qe7 guards both.'
		]
	},
	// Fool's mate
	loss: {
		moves: ['f3', 'e5', 'g4', 'Qh4#'],
		thoughts: [
			'f3 weakens the diagonal to White’s king. e5 opens the line for my queen, d5 takes the centre, and Nc6 develops.',
			'g4 leaves the e1–h4 diagonal wide open. Qh4 is checkmate: nothing can block it or take the queen.'
		]
	},
	// Sam Loyd's ten-move stalemate
	draw: {
		moves: [
			'e3',
			'a5',
			'Qh5',
			'Ra6',
			'Qxa5',
			'h5',
			'h4',
			'Rah6',
			'Qxc7',
			'f6',
			'Qxd7+',
			'Kf7',
			'Qxb7',
			'Qd3',
			'Qxb8',
			'Qh7',
			'Qxc8',
			'Kg6',
			'Qe6'
		],
		thoughts: [
			'a5 makes room for the rook, h6 is solid, and e5 takes the centre.',
			'The queen on h5 eyes f7. Ra6 swings the rook out, g6 kicks the queen, and Nf6 develops.',
			'h5 gives my other rook a way out, e6 opens the bishop, and Nf6 develops.',
			'Rah6 doubles the rooks, Nc6 develops, and e6 covers d5.',
			'The queen threatens d7. f6 opens a square for the king, Qc7 trades, and Nc6 defends.',
			'Kf7 gets out of check, and Qxd7 is no longer possible.',
			'Qd3 brings the queen out, Nc6 blocks, and e5 opens lines.',
			'Qh7 tucks the queen behind the rooks, and Nd7 develops.',
			'Kg6 steps up, Qd3 attacks, and e5 opens the centre.'
		]
	}
};

export function demoGame(demo: string | null): { chess: Chess; entries: Entry[] } | undefined {
	if (!demo || !(demo in GAMES)) return undefined;
	const { moves, thoughts } = GAMES[demo as Demo];
	const chess = new Chess();
	const entries: Entry[] = [];
	let thought = 0;
	moves.forEach((move, i) => {
		const san = chess.move(move).san;
		entries.push(
			i % 2 === 0
				? { san, by: 'you' }
				: {
						san,
						by: 'ai',
						thinking: thoughts[thought++],
						seconds: 2.4,
						speed: { prompt: 320, reading: 0.3, written: 70, writing: 2.1 }
					}
		);
	});
	return { chess, entries };
}
