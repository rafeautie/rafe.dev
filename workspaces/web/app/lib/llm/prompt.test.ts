import { describe, expect, it } from 'vitest';
import { openingText, PROMPT_MARK, sharedLength } from './prompt';

describe('openingText', () => {
	it('is everything before where the prompt goes', () => {
		const marked = `<bos><|turn>system\nThe world.<turn|>\n<|turn>user\n${PROMPT_MARK}<turn|>\n`;
		expect(openingText(marked)).toBe('<bos><|turn>system\nThe world.<turn|>\n<|turn>user\n');
	});

	it('fails when the template lost the prompt', () => {
		expect(() => openingText('<bos>nothing here')).toThrow();
	});
});

describe('sharedLength', () => {
	it('counts the tokens two prompts start with in common', () => {
		expect(sharedLength([1, 2, 3, 4], [1, 2, 3, 9, 9])).toBe(3);
		expect(sharedLength([1, 2], [1, 2, 3])).toBe(2);
		expect(sharedLength([5], [1])).toBe(0);
		expect(sharedLength([], [1])).toBe(0);
	});
});
