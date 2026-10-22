import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

// Facts about the position that a small model can't work out for itself, for
// the prompt (prompt.ts): what each notable move takes and whether it checks,
// which of the model's pieces are under attack, and any mate it faces. And
// for the worker, the moves that don't simply lose (safeMoves), which are all
// the model may finally play. A small model reads a
// warning like "Qg5 can be taken" as a suggestion, so losing moves are kept
// from it rather than pointed out. Checked one move deep, by counting
// attackers and defenders, so pins and longer exchanges slip by.

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
	// the opponent's moves that would mate right now
	mates: string[];
};

export function findFacts(chess: Chess): Facts {
	const side = chess.turn();
	const other: Color = side === 'w' ? 'b' : 'w';
	const notes: string[] = [];
	const losers = losing(chess);
	for (const move of chess.moves({ verbose: true })) {
		if (losers.has(move.san)) continue;
		const note = noteFor(chess, move);
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
	const mates = opponentMoves(chess)
		.filter((move) => move.san.endsWith('#'))
		.map((move) => move.san);
	return { notes, threats, mates };
}

// The legal moves that don't simply lose: ones that leave the moved piece to
// be taken for less than it's worth, or let the opponent mate at once. All of
// them, if every move loses.
export function safeMoves(chess: Chess): string[] {
	const losers = losing(chess);
	const legal = chess.moves();
	const safe = legal.filter((move) => !losers.has(move));
	if (!safe.length) return legal;
	// a knight or bishop going back home undoes its development, and small
	// models like to shuffle them there and out again
	const home = chess.turn() === 'w' ? '1' : '8';
	// and so does taking back its own last move
	const previous = chess.history({ verbose: true }).at(-2);
	const backwards = new Set(
		chess
			.moves({ verbose: true })
			.filter(
				(move) =>
					!move.captured &&
					(('nb'.includes(move.piece) && move.to[1] === home) ||
						(move.from === previous?.to && move.to === previous.from))
			)
			.map((move) => move.san)
	);
	const forwards = safe.filter((move) => !backwards.has(move));
	return forwards.length ? forwards : safe;
}

// It's the slow part, a tenth of a second or so, and the facts and the worker
// both ask about the same position, so the last answer is kept.
let lastLosing: { fen: string; losers: Set<string> } | undefined;

function losing(chess: Chess): Set<string> {
	const fen = chess.fen();
	if (lastLosing?.fen === fen) return lastLosing.losers;
	const side = chess.turn();
	const other: Color = side === 'w' ? 'b' : 'w';
	const losers = new Set<string>();
	for (const move of chess.moves({ verbose: true })) {
		const after = new Chess(chess.fen());
		after.move(move.san);
		if (after.isCheckmate()) continue;
		const type = move.promotion ?? move.piece;
		const gained = move.captured ? VALUE[move.captured] : 0;
		const hangs = type !== 'k' && cheapTaker(after, move.to, type, other, side, gained);
		const mated = after.moves({ verbose: true }).some((reply) => reply.san.endsWith('#'));
		if (hangs || mated) losers.add(move.san);
	}
	lastLosing = { fen, losers };
	return losers;
}

// What the other side could play if it were its turn
export function opponentMoves(chess: Chess): Move[] {
	const fields = chess.fen().split(' ');
	fields[1] = fields[1] === 'w' ? 'b' : 'w';
	fields[3] = '-';
	try {
		return new Chess(fields.join(' ')).moves({ verbose: true });
	} catch {
		return [];
	}
}

function noteFor(chess: Chess, move: Move): string | undefined {
	const parts: string[] = [];
	if (move.captured) parts.push(`takes a ${NAME[move.captured]}`);
	if (move.promotion) parts.push(`promotes to a ${NAME[move.promotion]}`);
	const after = new Chess(chess.fen());
	after.move(move.san);
	if (after.isCheckmate()) parts.push('checkmate');
	else if (after.inCheck()) parts.push('check');
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
