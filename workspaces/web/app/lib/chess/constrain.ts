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
