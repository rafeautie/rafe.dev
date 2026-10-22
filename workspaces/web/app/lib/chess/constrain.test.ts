import { describe, expect, it } from 'vitest';
import { allowed, follow, moveTrie, openTag, restrict, tagRule, tagTokens } from './constrain';

// one token per character
const encode = (text: string) => [...text].map((char) => char.charCodeAt(0));
const code = (char: string) => char.charCodeAt(0);
const END = [0];

describe('moveTrie', () => {
	const trie = moveTrie(['Nf3', 'Nc3', 'O-O', 'O-O-O'], encode);

	it('starts any move, with or without a space', () => {
		expect(allowed(trie, END).sort()).toEqual([' ', 'N', 'O'].map(code).sort());
	});

	it('only carries on the moves still possible', () => {
		const node = follow(trie, encode(' N'))!;
		expect(allowed(node, END).sort()).toEqual(['c', 'f'].map(code).sort());
		expect(follow(trie, encode(' Nd'))).toBeUndefined();
	});

	it('stops after a whole move, unless a longer one starts the same way', () => {
		const done = follow(trie, encode(' Nf3'))!;
		expect(done.move).toBe('Nf3');
		expect(allowed(done, END)).toEqual([]);
		const short = follow(trie, encode('O-O'))!;
		expect(short.move).toBe('O-O');
		expect(allowed(short, END)).toEqual([code('-'), 0]);
	});
});

describe('restrict', () => {
	it('keeps only the allowed scores', () => {
		const scores = new Float32Array([1, 2, 3, 4]);
		restrict(scores, [1, 3]);
		expect([...scores]).toEqual([-Infinity, 2, -Infinity, 4]);
	});
});

describe('tags', () => {
	const rule = tagRule(['Nf3', 'Nxe5', 'e4']);
	const vocab = ['N', 'f', '3', ':', 'xe5', ': wins', 'e4', ' the', '[', 'Q'];

	it('only constrains a tag still spelling its move', () => {
		expect(openTag('I like [', rule)).toBe('');
		expect(openTag('I like [N', rule)).toBe('N');
		expect(openTag('I like [Nf3:', rule)).toBeUndefined();
		expect(openTag('[Nf3: develops] then', rule)).toBeUndefined();
		expect(openTag('I like [Qh5', rule)).toBeUndefined();
	});

	it('allows the tokens that carry on a move, and the colon after it', () => {
		const pick = (written: string) => tagTokens(written, rule, vocab).map((t) => vocab[t]);
		expect(pick('').sort()).toEqual(['N', 'e4'].sort());
		expect(pick('N').sort()).toEqual(['f', 'xe5'].sort());
		expect(pick('Nxe5').sort()).toEqual([':', ': wins'].sort());
	});
});
