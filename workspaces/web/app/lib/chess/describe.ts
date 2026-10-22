import type { Move, PieceSymbol } from 'chess.js';

// A move in plain words, for the card under each of the model's replies:
// "Knight to f6" with "from g8" beneath it, and what else the move does, like
// taking a piece or giving check.

export const PIECE_NAMES: Record<PieceSymbol, string> = {
	p: 'pawn',
	n: 'knight',
	b: 'bishop',
	r: 'rook',
	q: 'queen',
	k: 'king'
};

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

// Something else a move does besides moving, with the piece it concerns
export type Note = {
	kind: 'capture' | 'promotion' | 'check' | 'checkmate';
	text: string;
	piece?: PieceSymbol;
};

export type Described = {
	// "Knight to f6", "Castles kingside"
	title: string;
	// "from g8"
	from?: string;
	// "Takes the bishop", "Check", in the order they happen
	notes: Note[];
};

export function describeMove(move: Move): Described {
	const notes: Note[] = [];
	if (move.isEnPassant()) {
		notes.push({ kind: 'capture', text: 'Takes the pawn en passant', piece: 'p' });
	} else if (move.captured) {
		const piece = move.captured;
		notes.push({ kind: 'capture', text: `Takes the ${PIECE_NAMES[piece]}`, piece });
	}
	if (move.promotion) {
		const piece = move.promotion;
		notes.push({ kind: 'promotion', text: `Promotes to a ${PIECE_NAMES[piece]}`, piece });
	}
	if (move.san.endsWith('#')) notes.push({ kind: 'checkmate', text: 'Checkmate', piece: 'k' });
	else if (move.san.endsWith('+')) notes.push({ kind: 'check', text: 'Check', piece: 'k' });

	if (move.isKingsideCastle()) return { title: 'Castles kingside', notes };
	if (move.isQueensideCastle()) return { title: 'Castles queenside', notes };
	return {
		title: `${capital(PIECE_NAMES[move.piece])} to ${move.to}`,
		from: `from ${move.from}`,
		notes
	};
}
