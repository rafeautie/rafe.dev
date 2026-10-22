import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

// Facts about the position that a small model can't work out for itself, for
// the prompt (prompt.ts): what each notable move takes, whether it checks, and
// whether it leaves the moved piece where it can be taken for less than it's
// worth; and which of the model's pieces are under attack right now. Only
// facts, never advice: the model still chooses. Checked one move deep, by
// counting attackers and defenders, so pins and longer exchanges slip by.

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME: Record<PieceSymbol, string> = {
	p: 'pawn',
	n: 'knight',
	b: 'bishop',
	r: 'rook',
	q: 'queen',
	k: 'king'
};

export type Facts = {
	// one line per notable legal move, like "Qxf2+: takes a pawn, check, can
	// be taken by the king"
	notes: string[];
	// the side to move's pieces that can be taken for less than they're worth,
	// like "knight on c6 (by the bishop on b5)"
	threats: string[];
};

export function findFacts(chess: Chess): Facts {
	const side = chess.turn();
	const other: Color = side === 'w' ? 'b' : 'w';
	const notes: string[] = [];
	for (const move of chess.moves({ verbose: true })) {
		const note = noteFor(chess, move, side, other);
		if (note) notes.push(`${move.san}: ${note}`);
	}
	const threats: string[] = [];
	for (const piece of chess.board().flat()) {
		if (!piece || piece.color !== side || piece.type === 'k') continue;
		const taker = cheapTaker(chess, piece.square, piece.type, other, side);
		if (taker)
			threats.push(
				`${NAME[piece.type]} on ${piece.square} (by the ${NAME[taker.type]} on ${taker.square})`
			);
	}
	return { notes, threats };
}

function noteFor(chess: Chess, move: Move, side: Color, other: Color): string | undefined {
	const parts: string[] = [];
	if (move.captured) parts.push(`takes a ${NAME[move.captured]}`);
	if (move.promotion) parts.push(`promotes to a ${NAME[move.promotion]}`);
	const after = new Chess(chess.fen());
	after.move(move.san);
	if (after.isCheckmate()) parts.push('checkmate');
	else if (after.inCheck()) parts.push('check');
	const type = move.promotion ?? move.piece;
	if (type !== 'k' && !after.isCheckmate()) {
		const gained = move.captured ? VALUE[move.captured] : 0;
		const taker = cheapTaker(after, move.to, type, other, side, gained);
		if (taker) parts.push(`can be taken by the ${NAME[taker.type]}`);
	}
	return parts.length ? parts.join(', ') : undefined;
}

// The cheapest enemy piece that can take the piece on `square` and come out
// ahead: either it's undefended, or the taker is worth less. `gained` is what
// the piece took getting there, which offsets the loss.
function cheapTaker(
	chess: Chess,
	square: Square,
	type: PieceSymbol,
	by: Color,
	owner: Color,
	gained = 0
): { type: PieceSymbol; square: Square } | undefined {
	const takers = chess
		.attackers(square, by)
		.map((from) => ({ square: from, type: chess.get(from)!.type }))
		.sort((a, b) => VALUE[a.type] - VALUE[b.type]);
	const cheapest = takers[0];
	if (!cheapest) return undefined;
	const defended = chess.attackers(square, owner).length > 0;
	const loss = defended ? VALUE[type] - VALUE[cheapest.type] : VALUE[type];
	return loss - gained > 0 ? cheapest : undefined;
}
