import type { Chess, Square } from 'chess.js';
import { opponentMoves } from './facts';

// What the model points at on the board while it thinks: the moves it names,
// each shown once it's written out. A move of its own is one it's weighing; a
// move its opponent could play is a threat it sees. Only legal moves count,
// so nonsense never gets an arrow.

export type Mention =
	| { kind: 'square'; square: Square }
	| { kind: 'piece'; square: Square }
	| { kind: 'arrow'; from: Square; to: Square };

export function mentionKey(mention: Mention): string {
	return mention.kind === 'arrow'
		? `arrow:${mention.from}${mention.to}`
		: `${mention.kind}:${mention.square}`;
}

export type Considered = {
	mention: Extract<Mention, { kind: 'arrow' }>;
	san: string;
	// the opponent's move, not one of its own
	threat: boolean;
};

// a move in standard notation, once something comes after it (so one still
// being written isn't read early)
const SAN = /(?<![\w-])(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[NBRQ])?)[+#]?(?=[^\w-])/g;

// Small models often recite the legal moves back ("Nc6, Na6, Qe7, …"). A run
// of three or more moves with nothing but commas and "or" / "and" between them
// is a list, not a thought, so none of it is marked.
const LIST_GAP = /^[\s,;/]*(?:(?:or|and)\s+)?$/i;
const LIST_LENGTH = 3;

// `chess` is the position the model is thinking about, with it to move.
export function findConsidered(text: string, chess: Chess): Considered[] {
	const ours = chess.moves({ verbose: true });
	const theirs = opponentMoves(chess);
	const matches = [...text.matchAll(SAN)];
	const listed = new Set<RegExpExecArray>();
	for (let i = 0; i < matches.length; ) {
		let j = i;
		while (
			j + 1 < matches.length &&
			LIST_GAP.test(text.slice(matches[j].index + matches[j][0].length, matches[j + 1].index))
		)
			j++;
		if (j - i + 1 >= LIST_LENGTH) for (let k = i; k <= j; k++) listed.add(matches[k]);
		i = j + 1;
	}

	const found = new Map<string, Considered>();
	const bare = (san: string) => san.replace(/[+#=]/g, '');
	for (const match of matches) {
		if (listed.has(match)) continue;
		const written = bare(match[1]);
		const own = ours.find((move) => bare(move.san) === written);
		const move = own ?? theirs.find((m) => bare(m.san) === written);
		if (!move || found.has(move.san)) continue;
		found.set(move.san, {
			mention: { kind: 'arrow', from: move.from, to: move.to },
			san: move.san,
			threat: !own
		});
	}
	return [...found.values()];
}
