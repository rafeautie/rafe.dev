import { settled, type OptionTrie } from './options';

// What a person in the simulation is asked, and how the model's reply is
// shaped and read back. A reply is at most one free line of plain text, then
// one line per field, "LABEL: value", where the value is always one of the
// options given. The worker holds the model to that shape token by token
// (lib/llm/mind.worker.ts), so a reply always reads back.

export type Field = { label: string; options: string[] };

export type Ask = {
	id: number;
	// the opening every request of a kind shares, word for word: the world,
	// the rules of the reply. The model's reading of it is kept and reused.
	system: string;
	// the part about this one person and this moment
	prompt: string;
	// one free line of text, which ends at a line break or after maxTokens
	free?: { maxTokens: number };
	// then each field on its own line, its value one of the options
	fields?: Field[];
	// higher goes first; the same goes in the order asked
	priority?: number;
	// a time (ms since 1970, as Date.now()) after which it's no longer worth
	// asking; it's dropped instead if it hasn't started by then
	deadline?: number;
	// whether it may start from the kept reading of `system` (on unless
	// switched off; the bench measures both)
	reuse?: boolean;
};

export type Speed = {
	// tokens in the whole prompt, the opening included
	promptTokens: number;
	// how many of those were already read, from an earlier request
	reusedTokens: number;
	// from starting the request to the first token of the reply
	readMs: number;
	writtenTokens: number;
	// from the first token of the reply to the last
	writeMs: number;
};

export type MindResult = {
	id: number;
	// the free line, or '' when none was asked for
	text: string;
	fields: Record<string, string>;
	speed: Speed;
};

// The longest free line allowed, whatever is asked
export const MAX_FREE_TOKENS = 160;

// A field as it's written in the reply. The line break is part of it, so
// that an option that starts like a longer one ("heat", "heat stone") is
// still told apart, and the next field starts on a line of its own.
export const fieldLine = (label: string, option: string) => `${label}: ${option}\n`;

// What's wrong with a request, if anything, before it reaches the model
export function checkAsk(ask: Ask): string | undefined {
	if (!ask.free && !ask.fields?.length) return 'asks for neither a free line nor any fields';
	if (ask.free && !(ask.free.maxTokens >= 1)) return 'free.maxTokens must be at least 1';
	const labels = new Set<string>();
	for (const field of ask.fields ?? []) {
		if (!/^[A-Za-z][\w -]*$/.test(field.label)) return `field label "${field.label}" isn't plain`;
		if (labels.has(field.label)) return `field "${field.label}" is asked for twice`;
		labels.add(field.label);
		if (!field.options.length) return `field "${field.label}" has no options`;
		for (const option of field.options)
			if (!option.trim() || /[\r\n]/.test(option))
				return `field "${field.label}" has an empty or multi-line option`;
	}
}

// The reply's shape, in the model's tokens
export type Shape = {
	// the free line's length limit, when there's a free line
	free?: number;
	fields: { label: string; trie: OptionTrie }[];
	// the token that is a line break and nothing else
	newline: number;
};

// Where a reply stands, from the tokens written so far
export type Step =
	// writing the free line, `count` tokens in; `last` when no fields follow
	| { kind: 'free'; count: number; last: boolean; free: number[] }
	// only these tokens may come next
	| { kind: 'only'; tokens: number[] }
	| { kind: 'done'; free: number[]; fields: Record<string, string> }
	// it wrote something the shape doesn't allow, which the worker never lets
	// it do
	| { kind: 'lost' };

export function planReply(shape: Shape, written: number[]): Step {
	let at = 0;
	let free: number[] = [];
	if (shape.free !== undefined) {
		const end = written.indexOf(shape.newline);
		free = written.slice(0, end < 0 ? written.length : end);
		const last = shape.fields.length === 0;
		if (end < 0) {
			if (free.length < shape.free) return { kind: 'free', count: free.length, last, free };
			// it ran out of room: the line ends here, cut short
			if (last) return { kind: 'done', free, fields: {} };
			return { kind: 'only', tokens: [shape.newline] };
		}
		if (last) return { kind: 'done', free, fields: {} };
		at = end + 1;
	}
	const fields: Record<string, string> = {};
	for (const [i, field] of shape.fields.entries()) {
		let node: OptionTrie | undefined = field.trie;
		for (;;) {
			if (node.value !== undefined && node.next.size === 0) break;
			// the last field needn't be written out once its value is certain
			if (i === shape.fields.length - 1 && settled(node) !== undefined) break;
			if (at === written.length) return { kind: 'only', tokens: [...node.next.keys()] };
			node = node.next.get(written[at++]);
			if (!node) return { kind: 'lost' };
		}
		fields[field.label] = node.value ?? settled(node)!;
	}
	return { kind: 'done', free, fields };
}

// The free line as it reads: one line, its spacing tidied
export const freeLine = (text: string) => text.split('\n')[0].replace(/\s+/g, ' ').trim();

// Reads a reply written in this shape back from its text: the free line, if
// one was asked for, and each field's value, matched to its options without
// minding case or stray spaces. A field that can't be read is left out.
export function parseReply(
	text: string,
	ask: Pick<Ask, 'free' | 'fields'>
): { text: string; fields: Record<string, string> } {
	const lines = text.split('\n');
	const free = ask.free ? freeLine(lines.shift() ?? '') : '';
	const fields: Record<string, string> = {};
	for (const field of ask.fields ?? []) {
		const label = field.label.toLowerCase();
		for (const line of lines) {
			const colon = line.indexOf(':');
			if (colon < 0 || line.slice(0, colon).trim().toLowerCase() !== label) continue;
			const said = line
				.slice(colon + 1)
				.replace(/\s+/g, ' ')
				.trim()
				.toLowerCase();
			const option = field.options.find((option) => option.toLowerCase() === said);
			if (option !== undefined) {
				fields[field.label] = option;
				break;
			}
		}
	}
	return { text: free, fields };
}
