// What the model may write in a free line: plain English text. Small models
// drift into other scripts, emoji, markdown, HTML and math, which a person in
// the simulation would never say, so those tokens are taken away. Letters
// with accents, curly quotes and the ellipsis are fine. A line break may only
// come as a token of its own, which ends the line; tokens that carry one
// along with other text would end it somewhere in the middle.
const PLAIN = /^[\x20-\x23\x25\x27-\x29\x2B-\x3B\x3D\x3F-\x5B\x5D\x61-\x7AÀ-ɏ‘’“”…]*$/;

// Whether a token from the vocabulary, as the tokenizer lists it, is plain.
// Gemma spells a space as ▁, and anything it has no token for byte by byte.
export function plainToken(token: string): boolean {
	if (/^<0x[0-9A-F]{2}>$/.test(token)) return false;
	const text = token.replaceAll('▁', ' ');
	return text === '\n' || (text.length > 0 && PLAIN.test(text));
}

// Every token in the vocabulary that isn't plain, except the ones that end
// the reply, which are handled on their own
export function foreignTokens(vocab: Iterable<[string, number]>, keep: number[]): number[] {
	const kept = new Set(keep);
	const foreign: number[] = [];
	for (const [token, id] of vocab) if (!kept.has(id) && !plainToken(token)) foreign.push(id);
	return foreign;
}
