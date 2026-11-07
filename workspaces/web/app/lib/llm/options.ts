// Holds the model to one of a few fixed answers once it starts writing one.
// Each answer is spelled out in the model's own tokens, and at every step the
// model may only pick a token that keeps it on the way to one of them. The
// model still chooses which: this only takes away the ones that aren't there.
// The same idea as the chess move trie (lib/chess/constrain.ts), for any text.

export type OptionTrie = { next: Map<number, OptionTrie>; value?: string };

export function optionTrie(
	options: string[],
	encode: (text: string) => number[],
	// how each option is written out, when that's more than the option itself
	spell: (option: string) => string = (option) => option
): OptionTrie {
	const root: OptionTrie = { next: new Map() };
	for (const option of options) {
		let node = root;
		for (const token of encode(spell(option))) {
			let child = node.next.get(token);
			if (!child) node.next.set(token, (child = { next: new Map() }));
			node = child;
		}
		// two options spelled alike: the first one listed keeps the spelling
		node.value ??= option;
	}
	return root;
}

// Where the tokens written so far lead: undefined if they've left every option
export function follow(trie: OptionTrie, tokens: number[]): OptionTrie | undefined {
	let node: OptionTrie | undefined = trie;
	for (const token of tokens) {
		node = node.next.get(token);
		if (!node) return undefined;
	}
	return node;
}

// What the model may write next: the tokens that carry on an option, and,
// once an option is complete but a longer one starts the same way, the
// tokens that end the reply. Nothing at all once an option is complete.
export function allowed(node: OptionTrie, end: number[]): number[] {
	const tokens = [...node.next.keys()];
	return node.value !== undefined && tokens.length ? [...tokens, ...end] : tokens;
}

// The option it can only end up writing, once only one is left; whatever
// it writes from here is decided already.
export function settled(node: OptionTrie): string | undefined {
	let current = node;
	while (current.value === undefined && current.next.size === 1)
		current = current.next.values().next().value!;
	return current.value !== undefined && current.next.size === 0 ? current.value : undefined;
}

// Keeps only the allowed scores, in place
export function restrict(scores: Float32Array, keep: number[]) {
	// nothing to keep would leave nothing to pick; better to let it be
	if (!keep.length) return;
	const kept = keep.map((token) => scores[token]);
	scores.fill(-Infinity);
	keep.forEach((token, i) => (scores[token] = kept[i]));
}

// The allowed token the model rates highest
export function best(scores: Float32Array, tokens: number[]): number {
	let top = tokens[0];
	for (const token of tokens) if (scores[token] > scores[top]) top = token;
	return top;
}
