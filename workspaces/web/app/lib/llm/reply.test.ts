import { describe, expect, it } from 'vitest';
import { optionTrie } from './options';
import { checkAsk, fieldLine, freeLine, parseReply, planReply, type Ask, type Shape } from './reply';

// one token per character, so a line break is its own token
const encode = (text: string) => [...text].map((char) => char.charCodeAt(0));
const decode = (tokens: number[]) => String.fromCharCode(...tokens);
const NEWLINE = encode('\n')[0];

function shapeOf(ask: Pick<Ask, 'free' | 'fields'>): Shape {
	return {
		free: ask.free?.maxTokens,
		fields: (ask.fields ?? []).map((field) => ({
			label: field.label,
			trie: optionTrie(field.options, encode, (option) => fieldLine(field.label, option))
		})),
		newline: NEWLINE
	};
}

// Writes a reply the way the worker lets the model: freely where it's free,
// and wherever only some tokens may come, the first of them that `want` has
// next (or the first allowed). Returns what was written and how it ended.
function write(shape: Shape, want: string) {
	const wanted = encode(want);
	const written: number[] = [];
	for (let guard = 0; guard < 500; guard++) {
		const step = planReply(shape, written);
		if (step.kind === 'done' || step.kind === 'lost') return { written, step };
		const next = wanted[written.length];
		if (step.kind === 'free') {
			if (next === undefined) return { written, step };
			written.push(next);
		} else written.push(step.tokens.includes(next) ? next : step.tokens[0]);
	}
	throw new Error('never ended');
}

const IDEA: Pick<Ask, 'free' | 'fields'> = {
	free: { maxTokens: 40 },
	fields: [
		{ label: 'ACTION', options: ['heat', 'heat slowly', 'strike', 'soak'] },
		{ label: 'ITEM', options: ['clay', 'stone', 'reed'] },
		{ label: 'WITH', options: ['fire', 'water', 'nothing'] }
	]
};

describe('planReply', () => {
	it('reads a free line and then every field', () => {
		const shape = shapeOf(IDEA);
		const { written, step } = write(
			shape,
			'Fire hardens clay.\nACTION: heat slowly\nITEM: clay\nWITH: fire\n'
		);
		expect(step).toEqual({
			kind: 'done',
			free: encode('Fire hardens clay.'),
			fields: { ACTION: 'heat slowly', ITEM: 'clay', WITH: 'fire' }
		});
		// the last field stops as soon as its value is certain
		expect(decode(written)).toBe('Fire hardens clay.\nACTION: heat slowly\nITEM: clay\nWITH: f');
	});

	it('forces the label and holds the value to the options', () => {
		const shape = shapeOf(IDEA);
		const written = encode('Hm.\n');
		expect(planReply(shape, written)).toEqual({ kind: 'only', tokens: encode('A') });
		const value = encode('Hm.\nACTION: ');
		expect(
			(planReply(shape, value) as { tokens: number[] }).tokens.map((t) => decode([t])).sort()
		).toEqual(['h', 's']);
		// a field that's a prefix of another is told apart by its line break
		const heat = encode('Hm.\nACTION: heat');
		expect(
			(planReply(shape, heat) as { tokens: number[] }).tokens.map((t) => decode([t])).sort()
		).toEqual(['\n', ' ']);
		const { step } = write(shape, 'Hm.\nACTION: soup\n');
		expect(step.kind === 'done' && step.fields.ACTION).toBe('soak');
	});

	it('ends a free line that runs out of room before the fields', () => {
		const shape = shapeOf({ free: { maxTokens: 3 }, fields: [{ label: 'NEED', options: ['rain'] }] });
		expect(planReply(shape, encode('abc'))).toEqual({ kind: 'only', tokens: [NEWLINE] });
		expect(planReply(shape, encode('abc\n'))).toEqual({
			kind: 'done',
			free: encode('abc'),
			fields: { NEED: 'rain' }
		});
	});

	it('is free while the line is being written', () => {
		const shape = shapeOf(IDEA);
		expect(planReply(shape, [])).toEqual({ kind: 'free', count: 0, last: false, free: [] });
		expect(planReply(shape, encode('Hm'))).toMatchObject({ kind: 'free', count: 2 });
	});

	it('ends a lone free line at its line break or its limit', () => {
		const shape = shapeOf({ free: { maxTokens: 5 } });
		expect(planReply(shape, encode('ab'))).toMatchObject({ kind: 'free', last: true });
		expect(planReply(shape, encode('ab\n'))).toEqual({ kind: 'done', free: encode('ab'), fields: {} });
		expect(planReply(shape, encode('abcde'))).toEqual({
			kind: 'done',
			free: encode('abcde'),
			fields: {}
		});
	});

	it('reads fields alone, from the first token', () => {
		const shape = shapeOf({
			fields: [{ label: 'CHOICE', options: ['move to the river', 'stay', 'send scouts', 'trade'] }]
		});
		expect(planReply(shape, [])).toMatchObject({ kind: 'only', tokens: encode('C') });
		const { step } = write(shape, 'CHOICE: send scouts\n');
		expect(step).toEqual({ kind: 'done', free: [], fields: { CHOICE: 'send scouts' } });
	});

	it('needs nothing written for a last field with one option', () => {
		const shape = shapeOf({ fields: [{ label: 'OK', options: ['yes'] }] });
		expect(planReply(shape, [])).toEqual({ kind: 'done', free: [], fields: { OK: 'yes' } });
	});

	it('notices a reply that left its shape', () => {
		expect(planReply(shapeOf(IDEA), encode('Hm.\nNOPE'))).toEqual({ kind: 'lost' });
	});
});

describe('checkAsk', () => {
	const ask: Ask = { id: 1, system: 'World.', prompt: 'You.', ...IDEA };

	it('passes a well-formed request', () => {
		expect(checkAsk(ask)).toBeUndefined();
		expect(checkAsk({ ...ask, free: undefined })).toBeUndefined();
		expect(checkAsk({ ...ask, fields: undefined })).toBeUndefined();
	});

	it('catches what would make a reply that cannot be read', () => {
		expect(checkAsk({ ...ask, free: undefined, fields: [] })).toMatch(/neither/);
		expect(checkAsk({ ...ask, free: { maxTokens: 0 } })).toMatch(/maxTokens/);
		expect(checkAsk({ ...ask, fields: [{ label: 'A', options: [] }] })).toMatch(/no options/);
		expect(checkAsk({ ...ask, fields: [{ label: 'A', options: ['x\ny'] }] })).toMatch(/multi-line/);
		expect(checkAsk({ ...ask, fields: [{ label: 'A:', options: ['x'] }] })).toMatch(/plain/);
		const twice = [
			{ label: 'A', options: ['x'] },
			{ label: 'A', options: ['y'] }
		];
		expect(checkAsk({ ...ask, fields: twice })).toMatch(/twice/);
	});
});

describe('parseReply', () => {
	it('reads the free line and the fields back', () => {
		const text = 'Fire  hardens clay.\nACTION: heat slowly\nITEM: clay\nWITH: fire\n';
		expect(parseReply(text, IDEA)).toEqual({
			text: 'Fire hardens clay.',
			fields: { ACTION: 'heat slowly', ITEM: 'clay', WITH: 'fire' }
		});
	});

	it("doesn't mind case or spacing, and leaves out what isn't an option", () => {
		const text = 'Maybe.\naction :  Strike \nITEM: wood\n';
		expect(parseReply(text, IDEA)).toEqual({ text: 'Maybe.', fields: { ACTION: 'strike' } });
	});

	it('reads fields alone when no free line was asked for', () => {
		const ask = { fields: [{ label: 'NEED', options: ['rain', 'food'] }] };
		expect(parseReply('NEED: food', ask)).toEqual({ text: '', fields: { NEED: 'food' } });
	});

	it('reads what the shape writes', () => {
		const line = fieldLine('NEED', 'rain');
		expect(line).toBe('NEED: rain\n');
		expect(parseReply(`Please.\n${line}`, { free: { maxTokens: 9 }, fields: [{ label: 'NEED', options: ['rain'] }] }).fields).toEqual({ NEED: 'rain' });
	});
});

describe('freeLine', () => {
	it('keeps the first line, its spacing tidied', () => {
		expect(freeLine('  The  bowl   is hard. \nACTION: heat')).toBe('The bowl is hard.');
	});
});
