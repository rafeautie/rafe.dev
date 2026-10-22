import type { Chess, Square } from 'chess.js';
import { opponentMoves } from './facts';
import { CONSIDERING } from './prompt';

// What the model points at on the board while it considers its move: the
// candidates it lists and the threat it sees (prompt.ts, CONSIDERING), each
// shown once its line is written out, with its own words on why. The worker
// holds every move to a legal one, but they're checked again here.

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
	note: string;
	// the opponent's move, not one of its own
	threat: boolean;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LINE = new RegExp(
	`^(${escape(CONSIDERING.bullet)}|${escape(CONSIDERING.threat)})\\s*(\\S+)${escape(CONSIDERING.dash)}(.+)\\n`,
	'gm'
);

// The finished lines of a reply so far. `chess` is the position the model is
// considering, with it to move.
export function findConsidered(text: string, chess: Chess): Considered[] {
	const ours = chess.moves({ verbose: true });
	const theirs = opponentMoves(chess);
	const found: Considered[] = [];
	for (const [, kind, san, note] of text.matchAll(LINE)) {
		const threat = kind === CONSIDERING.threat;
		const move = (threat ? theirs : ours).find((m) => m.san === san);
		if (move)
			found.push({
				mention: { kind: 'arrow', from: move.from, to: move.to },
				san,
				note: note.trim(),
				threat
			});
	}
	return found;
}
