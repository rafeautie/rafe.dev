// How a request becomes the model's prompt, and which start of it is the
// shared opening whose reading can be kept and reused.

export type ChatMessage = { role: 'system' | 'user'; content: string };

export const chat = (system: string, prompt: string): ChatMessage[] => [
	{ role: 'system', content: system },
	{ role: 'user', content: prompt }
];

// Stands in for the person's part of the prompt, to find where it begins
export const PROMPT_MARK = '@@PROMPT@@';

// The prompt's text up to where the person's part goes, from the prompt
// written with PROMPT_MARK in that place: the chat template's opening, the
// shared opening and the start of the user's turn.
export function openingText(marked: string): string {
	const at = marked.indexOf(PROMPT_MARK);
	if (at < 0) throw new Error("the chat template dropped the prompt; can't find where it goes");
	return marked.slice(0, at);
}

// How many tokens two prompts start with in common. The opening is read in
// tokens, and where it meets the person's part the tokenizer may join the two
// into one token, so the part that can be reused is what the opening alone
// and the whole prompt share.
export function sharedLength(a: ArrayLike<number>, b: ArrayLike<number>): number {
	const most = Math.min(a.length, b.length);
	let i = 0;
	while (i < most && a[i] === b[i]) i++;
	return i;
}
