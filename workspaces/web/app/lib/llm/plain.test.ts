import { describe, expect, it } from 'vitest';
import { foreignTokens, plainToken } from './plain';

describe('plainToken', () => {
	it('lets plain words, punctuation and a line break on its own through', () => {
		for (const token of ['▁bowl', 'hard', ',', '▁“yes”', 'café', '\n', '?'])
			expect(plainToken(token), token).toBe(true);
	});

	it('keeps out markup, symbols, other scripts, bytes and line breaks inside a token', () => {
		for (const token of ['**', '<turn|>', '▁$x$', '火', '\u{1F525}', '<0x0A>', '.\n', '\n\n', ''])
			expect(plainToken(token), token).toBe(false);
	});
});

describe('foreignTokens', () => {
	it('lists the tokens that are not plain, except those kept', () => {
		const vocab = new Map([
			['▁fire', 0],
			['<eos>', 1],
			['<turn|>', 2],
			['#', 3],
			['\n', 4]
		]);
		expect(foreignTokens(vocab, [2])).toEqual([1, 3]);
	});
});
