import type { Chess, Color, PieceSymbol, Square } from 'chess.js';

// What the model's thinking points at on the board, read from the text as it
// streams in: squares ("e4"), pieces ("my knight on f3", "your queen") and
// moves it is weighing ("Bxf7", "knight to g5"). A move only counts when it is
// legal for the side to move, so nonsense never gets an arrow.

export type Mention =
	| { kind: 'square'; square: Square }
	| { kind: 'piece'; square: Square }
	| { kind: 'arrow'; from: Square; to: Square };

const PIECES: Record<string, PieceSymbol> = {
	pawn: 'p',
	knight: 'n',
	bishop: 'b',
	rook: 'r',
	queen: 'q',
	king: 'k'
};

// "my knight on f3", "your queen", "the bishop takes e5"
const PIECE_PHRASE =
	/\b(my|your|white's|black's|white|black|the|a)?\s*(pawn|knight|bishop|rook|queen|king)s?\b(?:\s+(on|at|to|takes|captures|from|into)\s+([a-h][1-8])\b)?/gi;
// a move in standard notation, or a bare square
const SAN = /(?<![\w-])(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[NBRQ])?)[+#]?(?![\w-])/g;

export function mentionKey(mention: Mention): string {
	return mention.kind === 'arrow'
		? `arrow:${mention.from}${mention.to}`
		: `${mention.kind}:${mention.square}`;
}

// `chess` is the position the model is thinking about, with it to move.
export function findMentions(text: string, chess: Chess): Mention[] {
	const side = chess.turn();
	const legal = chess.moves({ verbose: true });
	const found = new Map<string, Mention>();
	const add = (mention: Mention) => found.set(mentionKey(mention), mention);
	// where a phrase already placed something, so its square isn't counted twice
	const covered: [number, number][] = [];

	for (const match of text.matchAll(PIECE_PHRASE)) {
		const [whole, owner, name, link, target] = match;
		const type = PIECES[name.toLowerCase()];
		const start = match.index ?? 0;
		covered.push([start, start + whole.length]);
		const color = ownerColor(owner?.toLowerCase(), side);
		if (target) {
			const square = target as Square;
			const verb = link.toLowerCase();
			if (verb === 'on' || verb === 'at' || verb === 'from') {
				const piece = chess.get(square);
				add(piece?.type === type ? { kind: 'piece', square } : { kind: 'square', square });
			} else {
				const move = legal.find((m) => m.piece === type && m.to === square);
				add(move ? { kind: 'arrow', from: move.from, to: move.to } : { kind: 'square', square });
			}
		} else if (color) {
			for (const square of squaresOf(chess, type, color).slice(0, 2))
				add({ kind: 'piece', square });
		}
	}

	for (const match of text.matchAll(SAN)) {
		const start = match.index ?? 0;
		if (covered.some(([from, to]) => start >= from && start < to)) continue;
		const written = match[1].replace('=', '');
		const move = legal.find((m) => m.san.replace(/[+#=]/g, '') === written);
		if (move) {
			add({ kind: 'arrow', from: move.from, to: move.to });
			continue;
		}
		const square = written.slice(-2) as Square;
		if (!/^[a-h][1-8]$/.test(square)) continue;
		// "Nf3" that isn't a legal move is most likely the piece standing there
		const piece = chess.get(square);
		const named = /^[NBRQK]/.test(written) ? written[0].toLowerCase() : undefined;
		add(piece?.type === named ? { kind: 'piece', square } : { kind: 'square', square });
	}

	return [...found.values()];
}

function ownerColor(owner: string | undefined, side: Color): Color | undefined {
	if (owner === 'my') return side;
	if (owner === 'your') return side === 'w' ? 'b' : 'w';
	if (owner === "white's" || owner === 'white') return 'w';
	if (owner === "black's" || owner === 'black') return 'b';
	return undefined;
}

function squaresOf(chess: Chess, type: PieceSymbol, color: Color): Square[] {
	return chess
		.board()
		.flat()
		.filter((piece) => piece?.type === type && piece.color === color)
		.map((piece) => piece!.square);
}
