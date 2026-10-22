import type { Facts } from './facts';

// What the model is told each turn, and how its move is read back out of the
// reply. Every turn starts fresh: the model never sees earlier replies or its
// earlier thinking, only the position, the last few moves and the legal moves,
// so the prompt stays about the same size however long the game runs.

export type LegalMove = { san: string; uci: string };

export type PromptInput = {
	color: 'white' | 'black';
	// the board drawn in text (drawBoard)
	board: string;
	// every move of the game so far, in standard notation
	history: string[];
	legal: LegalMove[];
	// notes on the legal moves and the pieces under attack (findFacts)
	facts?: Facts;
	// the moves it may consider: the legal ones that don't simply lose
	// (facts.ts, safeMoves)
	candidates?: string[];
	// the opponent's real threats, the worst first, for the threat it names
	// (facts.ts, findDangers)
	dangers?: string[];
	think: boolean;
	// the previous answer, when it wasn't a legal move
	retry?: string;
};

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

// How many of the latest moves (each side's counts as one) the model is shown
export const HISTORY_PLIES = 20;

// The board as rows of letters, rank 8 at the top. It's the one picture of
// the position in the prompt: the moves so far and the legal moves cover the
// rest of what a FEN would say (whose turn, castling, en passant), and small
// models read a grid more easily than a FEN. Single spaces keep each square
// its own word without spending tokens on a frame.
export function drawBoard(rows: ({ type: string; color: 'w' | 'b' } | null)[][]): string {
	const lines = rows.map(
		(row, i) =>
			`${8 - i} ${row.map((square) => (square ? (square.color === 'w' ? square.type.toUpperCase() : square.type) : '.')).join(' ')}`
	);
	return [...lines, '  a b c d e f g h'].join('\n');
}

// Instead of thinking freely, the model fills in this shape, which the worker
// writes out around it and holds to legal moves (ai.worker.ts):
//
//   Considering:
//   - Nf6 — develops and hits e4
//   - e5 — takes the centre
//   - c5 — keeps it symmetrical
//   Threat: Qa4 — pins the knight
//   Move: Nf6
//
// Each line shows on the board as it's written (mentions.ts, findConsidered).
export const CONSIDERING = {
	heading: 'Considering:\n',
	bullet: '- ',
	dash: ' — ',
	threat: 'Threat: ',
	candidates: 3
};

export function buildMessages(input: PromptInput, historyPlies = HISTORY_PLIES): ChatMessage[] {
	const recent = formatHistory(input.history, historyPlies);
	const lines = [
		`You are playing a game of chess as ${input.color}. It is your move.`,
		'',
		'The board (uppercase is white, lowercase is black, dots are empty squares):',
		input.board
	];
	if (recent) {
		lines.push(`Moves so far${recent.trimmed ? ' (the latest ones)' : ''}: ${recent.text}`);
	}
	lines.push(`Your legal moves: ${input.legal.map((move) => move.san).join(', ')}`);
	// On their own lines, after the bare list, so the list stays one plain run
	// of moves
	if (input.facts?.notes.length) {
		lines.push('About some of them:', ...input.facts.notes.map((note) => `- ${note}`));
	}
	if (input.facts?.threats.length) {
		lines.push(`Under attack: ${input.facts.threats.join('; ')}`);
	}
	if (input.facts?.mates.length) {
		lines.push(`Your opponent threatens mate with ${input.facts.mates.join(' or ')}.`);
	}
	lines.push('');
	if (input.retry) {
		lines.push(
			`Your last answer, "${input.retry}", was not one of your legal moves. Choose from the list.`
		);
	}
	if (input.think) {
		lines.push(
			`Start with "Considering:" and your ${CONSIDERING.candidates} best candidate moves, one per line as "- <move> — <a few words on why>".` +
				(input.dangers?.length
					? ` Then "Threat: <your opponent's most dangerous move> — <why>".`
					: '')
		);
	}
	lines.push(
		`${input.think ? 'Then' : 'Give'} your move on the last line as "Move: <move>", using one move from the list exactly as written.`
	);
	return [{ role: 'user', content: lines.join('\n') }];
}

function formatHistory(history: string[], plies: number) {
	if (!history.length || plies <= 0) return undefined;
	const start = Math.max(0, history.length - plies);
	const parts: string[] = [];
	for (let i = start; i < history.length; i++) {
		const number = Math.floor(i / 2) + 1;
		if (i % 2 === 0) parts.push(`${number}. ${history[i]}`);
		else if (i === start) parts.push(`${number}... ${history[i]}`);
		else parts.push(history[i]);
	}
	return { text: parts.join(' '), trimmed: start > 0 };
}

export type SplitReply = {
	thinking: string;
	answer: string;
	// whether the thinking has finished
	closed: boolean;
};

// Separates the reasoning from the answer, in a finished reply or one still
// streaming. `opened` is for templates that open the <think> block themselves,
// so the reply starts mid-thought. A model that skips the tags has everything
// before its "Move:" line counted as thinking.
export function splitReply(raw: string, opened = false): SplitReply {
	const start = raw.indexOf('<think>');
	if (!opened && start < 0) {
		const move = raw.search(/move\s*:/i);
		if (move < 0) return { thinking: raw.trim(), answer: '', closed: false };
		return { thinking: raw.slice(0, move).trim(), answer: raw.slice(move).trim(), closed: true };
	}
	const body = opened && start < 0 ? raw : raw.slice(start + '<think>'.length);
	const end = body.indexOf('</think>');
	if (end < 0) return { thinking: body.trim(), answer: '', closed: false };
	return {
		thinking: body.slice(0, end).trim(),
		answer: body.slice(end + '</think>'.length).trim(),
		closed: true
	};
}

const UCI = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

// The legal move an answer names, if any. The "Move:" line counts first, and
// failing that the last legal move written anywhere in the answer. Reads
// castling written with zeros, check marks, move numbers and from-to notation.
export function findMove(
	answer: string,
	legal: LegalMove[]
): { move?: string; candidate?: string } {
	const bySan = new Map(legal.map((move) => [bare(move.san), move.san]));
	const byUci = new Map(legal.map((move) => [move.uci, move.san]));
	const match = (word: string) => {
		const cleaned = clean(word);
		return bySan.get(cleaned) ?? byUci.get(cleaned.toLowerCase());
	};

	const lines = [...answer.matchAll(/move\s*:\s*\**\s*([^\s*]+)/gi)];
	const candidate = lines.at(-1)?.[1];
	if (candidate) {
		const move = match(candidate);
		if (move) return { move, candidate };
	}
	const words = answer.split(/\s+/).filter(Boolean);
	for (let i = words.length - 1; i >= 0; i--) {
		const move = match(words[i]);
		if (move) return { move, candidate: words[i] };
	}
	return { candidate: candidate ?? (answer.trim().slice(0, 40) || undefined) };
}

function bare(san: string) {
	return san.replace(/[+#]/g, '');
}

function clean(word: string) {
	let cleaned = word
		.replace(/^[("'`*[]+|[)"'`*.,;:!?\]]+$/g, '')
		// a move number in front: "12.Nf3", "12...Nf6"
		.replace(/^\d+\.+/, '')
		.replace(/[+#!?]+$/, '');
	if (/^0-0-0$/.test(cleaned)) cleaned = 'O-O-O';
	else if (/^0-0$/.test(cleaned)) cleaned = 'O-O';
	if (UCI.test(cleaned.toLowerCase())) return cleaned.toLowerCase();
	return cleaned;
}
