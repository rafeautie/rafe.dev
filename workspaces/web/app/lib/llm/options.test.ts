import { describe, expect, it } from 'vitest';
import { allowed, best, follow, optionTrie, restrict, settled } from './options';

// one token per character
const encode = (text: string) => [...text].map((char) => char.charCodeAt(0));
const code = (char: string) => char.charCodeAt(0);
const END = [0];

describe('optionTrie', () => {
	const trie = optionTrie(['heat', 'heap', 'strike', 'he'], encode);

	it('starts any option', () => {
		expect(allowed(trie, END).sort()).toEqual(['h', 's'].map(code).sort());
	});

	it('only carries on the options still possible', () => {
		const node = follow(trie, encode('hea'))!;
		expect(allowed(node, END).sort()).toEqual(['p', 't'].map(code).sort());
		expect(follow(trie, encode('hex'))).toBeUndefined();
	});

	it('may end after a whole option only when a longer one starts the same way', () => {
		const short = follow(trie, encode('he'))!;
		expect(short.value).toBe('he');
		expect(allowed(short, END)).toEqual([code('a'), 0]);
		const done = follow(trie, encode('strike'))!;
		expect(done.value).toBe('strike');
		expect(allowed(done, END)).toEqual([]);
	});

	it('spells options out the way it is told', () => {
		const lines = optionTrie(['rain', 'food'], encode, (option) => `NEED: ${option}\n`);
		expect(allowed(lines, END)).toEqual([code('N')]);
		expect(follow(lines, encode('NEED: rain\n'))!.value).toBe('rain');
		expect(follow(lines, encode('rain'))).toBeUndefined();
	});

	it('keeps the first of two options spelled alike', () => {
		const same = optionTrie(['a', 'b'], () => [1, 2]);
		expect(follow(same, [1, 2])!.value).toBe('a');
	});
});

describe('settled', () => {
	const trie = optionTrie(['strike', 'soak', 'stir'], encode);

	it('knows the option once only one is left', () => {
		expect(settled(follow(trie, encode('so'))!)).toBe('soak');
		expect(settled(follow(trie, encode('str'))!)).toBe('strike');
	});

	it("doesn't while there's still a choice", () => {
		expect(settled(trie)).toBeUndefined();
		expect(settled(follow(trie, encode('st'))!)).toBeUndefined();
		const prefix = optionTrie(['he', 'heat'], encode);
		expect(settled(follow(prefix, encode('he'))!)).toBeUndefined();
	});

	it('settles a field with one option before anything is written', () => {
		expect(settled(optionTrie(['yes'], encode))).toBe('yes');
	});
});

describe('restrict and best', () => {
	it('keeps only the allowed scores', () => {
		const scores = new Float32Array([1, 2, 3, 4]);
		restrict(scores, [1, 3]);
		expect([...scores]).toEqual([-Infinity, 2, -Infinity, 4]);
	});

	it('leaves the scores alone with nothing to keep', () => {
		const scores = new Float32Array([1, 2]);
		restrict(scores, []);
		expect([...scores]).toEqual([1, 2]);
	});

	it('picks the allowed token rated highest', () => {
		expect(best(new Float32Array([9, 2, 3, 1]), [1, 2, 3])).toBe(2);
	});
});
