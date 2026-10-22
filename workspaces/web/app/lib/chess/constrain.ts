// Holds the model to a legal move once it starts writing one. Each legal move
// is spelled out in the model's own tokens, with and without a space in front,
// and at every step the model may only pick a token that keeps it on the way
// to one of them. The model still chooses which move: this only takes away the
// ones that aren't there.

export type MoveTrie = { next: Map<number, MoveTrie>; move?: string };

export function moveTrie(moves: string[], encode: (text: string) => number[]): MoveTrie {
	const root: MoveTrie = { next: new Map() };
	for (const move of moves) {
		for (const spelling of [` ${move}`, move]) {
			let node = root;
			for (const token of encode(spelling)) {
				let child = node.next.get(token);
				if (!child) node.next.set(token, (child = { next: new Map() }));
				node = child;
			}
			node.move = move;
		}
	}
	return root;
}

// Where the tokens written so far lead: undefined if they've left every move
export function follow(trie: MoveTrie, tokens: number[]): MoveTrie | undefined {
	let node: MoveTrie | undefined = trie;
	for (const token of tokens) {
		node = node.next.get(token);
		if (!node) return undefined;
	}
	return node;
}

// What the model may write next: the tokens that carry on a move, and, once a
// move is complete but a longer one starts the same way (O-O and O-O-O), the
// tokens that end the reply. Nothing at all once a move is complete.
export function allowed(node: MoveTrie, end: number[]): number[] {
	const tokens = [...node.next.keys()];
	return node.move && tokens.length ? [...tokens, ...end] : tokens;
}

// Keeps only the allowed scores, in place
export function restrict(scores: Float32Array, keep: number[]) {
	// nothing to keep would leave nothing to pick; better to let it be
	if (!keep.length) return;
	const kept = keep.map((token) => scores[token]);
	scores.fill(-Infinity);
	keep.forEach((token, i) => (scores[token] = kept[i]));
}

// Holds a tag in the thinking ("[Nxe5: wins a pawn]", prompt.ts) to a real
// move: from the "[" to the ":", the model may only spell one of `moves`.
// After the ":" it writes freely again. Works on text rather than tokens, as
// the "[" can come inside a longer token.
export type TagRule = { prefixes: Set<string>; heads: Set<string> };

export function tagRule(moves: string[]): TagRule {
	const prefixes = new Set<string>();
	const heads = new Set<string>();
	for (const move of moves) {
		const head = `${move}:`;
		heads.add(head);
		for (let i = 0; i <= head.length; i++) prefixes.add(head.slice(0, i));
	}
	return { prefixes, heads };
}

// What's been written of an open tag so far: the text after its "[", or
// undefined when no tag is open or the move is already written
export function openTag(text: string, rule: TagRule): string | undefined {
	const start = text.lastIndexOf('[');
	if (start < 0 || text.includes(']', start)) return undefined;
	const written = text.slice(start + 1);
	return rule.prefixes.has(written) && !rule.heads.has(written) ? written : undefined;
}

// The tokens that keep an open tag on its way to a move (spelled out in
// `vocab`, the text of each token)
export function tagTokens(written: string, rule: TagRule, vocab: string[]): number[] {
	const tokens: number[] = [];
	vocab.forEach((piece, token) => {
		if (!piece) return;
		const next = written + piece;
		if (rule.prefixes.has(next)) tokens.push(token);
		else {
			const colon = next.indexOf(':');
			if (colon >= 0 && rule.heads.has(next.slice(0, colon + 1))) tokens.push(token);
		}
	});
	return tokens;
}
