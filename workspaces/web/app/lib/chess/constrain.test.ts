import { describe, expect, it } from 'vitest';
import { allowed, follow, moveTrie, restrict } from './constrain';

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
