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

// what may sit between the items of a list, and how many items make one
const LIST_GAP = /^[\s,;/]*(?:(?:or|and)\s+)?$/i;
const LIST_LENGTH = 3;

export function mentionKey(mention: Mention): string {
	return mention.kind === 'arrow'
		? `arrow:${mention.from}${mention.to}`
		: `${mention.kind}:${mention.square}`;
}

// `chess` is the position the model is thinking about, with it to move.
export function findMentions(text: string, chess: Chess): Mention[] {
	text = withoutEchoes(text);
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

	// Small models often recite the legal moves back ("Nc6, Na6, Qe7, …"). A
	// run of three or more moves or squares with nothing but commas and "or" /
	// "and" between them is a list, not a thought, so none of it is marked.
	const matches = [...text.matchAll(SAN)].filter((match) => {
		const start = match.index ?? 0;
		return !covered.some(([from, to]) => start >= from && start < to);
	});
	const listed = new Set<RegExpExecArray>();
	for (let i = 0; i < matches.length; ) {
		let j = i;
		while (
			j + 1 < matches.length &&
			LIST_GAP.test(text.slice(matches[j].index! + matches[j][0].length, matches[j + 1].index))
		)
			j++;
		if (j - i + 1 >= LIST_LENGTH) for (let k = i; k <= j; k++) listed.add(matches[k]);
		i = j + 1;
	}

	for (const match of matches) {
		if (listed.has(match)) continue;
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
		add(named && piece?.type === named ? { kind: 'piece', square } : { kind: 'square', square });
	}

	return [...found.values()];
}

// Blanks out what the model quotes, and sentences about the prompt itself
// ("the legal moves are …", "the user says …"): that's it re-reading the
// question, not weighing moves. Blanked with spaces, so positions still line
// up with the text.
const QUOTED = /"[^"\n]*"|“[^”\n]*”/g;
const ECHO = /[^.!?\n]*\b(?:legal moves?|the list|the user|user says|the prompt)\b[^.!?\n]*/gi;
function withoutEchoes(text: string) {
	const blank = (part: string) => ' '.repeat(part.length);
	return text.replace(QUOTED, blank).replace(ECHO, blank);
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
