import {
	AutoModelForCausalLM,
	AutoTokenizer,
	DynamicCache,
	InterruptableStoppingCriteria,
	LogitsProcessor,
	LogitsProcessorList,
	ones_like,
	StoppingCriteria,
	StoppingCriteriaList,
	Tensor,
	type PreTrainedModel,
	type PreTrainedTokenizer
} from '@huggingface/transformers';
import type { Dtype } from './models';
import { best, optionTrie, restrict, type OptionTrie } from './options';
import { foreignTokens } from './plain';
import { chat, openingText, PROMPT_MARK, sharedLength } from './prompt';
import { AskQueue } from './queue';
import {
	checkAsk,
	fieldLine,
	freeLine,
	MAX_FREE_TOKENS,
	planReply,
	type Ask,
	type MindResult,
	type Shape
} from './reply';

// The mind of the simulation's people: a small language model running in the
// player's browser, in a worker so the world never stops while it thinks. It
// answers one request at a time, from a queue, each with at most one free line
// of text and then a few fields whose values are always one of the options
// given (lib/llm/reply.ts). The weights come from the Hugging Face Hub on
// first use and the browser caches them after that, as on /chess.
//
// Every request starts with an opening shared by many requests (the world,
// the rules of the reply). The model's reading of that opening, its key/value
// cache, is worked out once and kept, so each request only has to read its own
// part. The model updates a cache in place as it goes, and lets go of the GPU
// buffers it replaces, so the kept reading is held as plain arrays and each
// request starts from a fresh copy of them; nothing it does can reach the kept
// one. Whether the model reads correctly from a kept start is checked once when
// it loads (checkReuse), and if not, every request reads its prompt whole.

export type MindRequest =
	| {
			type: 'load';
			repo: string;
			dtype: Dtype;
			device: 'webgpu' | 'wasm';
			// how many weight files each graph has (lib/chess/models.ts)
			files: Record<string, number>;
	  }
	| { type: 'ask'; request: Ask }
	// drop everything waiting, and the request in progress
	| { type: 'stop' };

// What loading is doing: fetching the weights from the network, or reading
// them from the browser's cache when they were downloaded before, putting them
// on the GPU or in memory, then a couple of tiny runs so the first real
// request isn't the one that pays for compiling everything.
export type LoadStage = 'downloading' | 'reading' | 'preparing' | 'warming';

// Whether a request can start from the kept reading of its opening. `agree`:
// the model picks the same next token either way; `drift`: the largest gap
// between the two readings' scores for the likeliest tokens.
export type ReuseCheck =
	| { ok: true; agree: boolean; drift: number }
	| { ok: false; agree?: boolean; drift?: number; reason: string };

export type MindResponse =
	| { type: 'stage'; stage: LoadStage }
	| { type: 'progress'; progress: number }
	| { type: 'ready'; reuse: ReuseCheck }
	| { type: 'load-error'; message: string }
	| { type: 'result'; result: MindResult }
	// not answered: stopped, or its deadline passed while it waited
	| { type: 'dropped'; id: number; reason: 'stopped' | 'deadline' }
	| { type: 'error'; id: number; message: string };

// a free line's sampling: a little randomness, so two people in the same spot
// don't say the same thing. Fields are always the model's likeliest option.
const TEMPERATURE = 0.7;
// Tokens far less likely than the likeliest are never picked. Transformers.js
// samples from the 64 likeliest whatever top_p says, and small models' long
// tail is where the nonsense words are ("I'Wish" for "I wish").
const MIN_P = 0.1;
// kept readings of different openings, the most recently used first
const OPENINGS = 4;
// the most a kept reading may differ from a whole one and still count as the same
const MAX_DRIFT = 2;

type Loaded = {
	model: PreTrainedModel;
	tokenizer: PreTrainedTokenizer;
	context: number;
	newline: number;
	// the tokens that end the reply
	end: number[];
	// the tokens a free line may not have (lib/llm/plain.ts)
	foreign: number[];
	reuse: ReuseCheck;
};

// A kept reading of an opening: each cache tensor's numbers, held apart from
// the model so it never changes them
type Opening = {
	tensors: { name: string; type: Tensor['type']; data: Tensor['data']; dims: number[] }[];
};

let loaded: Promise<Loaded> | undefined;
const queue = new AskQueue<Ask>();
const openings = new Map<string, Opening>();
// the request being answered, and whether it was stopped on the way
type Turn = { ask: Ask; stopping: InterruptableStoppingCriteria; stopped: boolean };
let current: Turn | undefined;
let pumping = false;

function post(message: MindResponse) {
	postMessage(message);
}

// Whether the browser holds every weight file already, so loading reads them
// from its cache rather than downloading them (as lib/chess/ai.worker.ts)
async function allCached(repo: string, weightFiles: Record<string, number>): Promise<boolean> {
	try {
		const cache = await caches.open('transformers-cache');
		const urls = (await cache.keys()).map((request) => request.url);
		const names = Object.entries(weightFiles).flatMap(([file, chunks]) => [
			file,
			...Array.from({ length: chunks }, (_, i) => `${file}_data${i ? `_${i}` : ''}`)
		]);
		return names.every((name) =>
			urls.some((url) => url.includes(`/${repo}/`) && url.endsWith(`/onnx/${name}`))
		);
	} catch {
		return false;
	}
}

const WEIGHTS = /\.onnx(_data(_\d+)?)?$/;

async function load(
	repo: string,
	dtype: Dtype,
	device: 'webgpu' | 'wasm',
	weightFiles: Record<string, number>
): Promise<Loaded> {
	// The bar counts only the weights, from the sizes their downloads report
	// as they start, once every one has a size; the small files would read as
	// done before the weights begin. (The same as /chess.)
	const fetching: LoadStage = (await allCached(repo, weightFiles)) ? 'reading' : 'downloading';
	const files = new Map<string, { loaded: number; total?: number }>();
	let shown = 0;
	let modelStep = false;
	let stage: LoadStage | undefined;
	const enter = (next: LoadStage) => {
		if (stage === next) return;
		stage = next;
		post({ type: 'stage', stage: next });
	};
	const report = () => {
		let done = 0;
		let total = 0;
		for (const file of files.values()) {
			if (file.total === undefined) return;
			done += file.loaded;
			total += file.total;
		}
		if (!total) return;
		const next = Math.max(shown, done / total);
		if (Math.floor(next * 100) > Math.floor(shown * 100))
			post({ type: 'progress', progress: next });
		shown = next;
		if (done >= total) enter('preparing');
	};
	const progress_callback = (event: {
		status: string;
		file?: string;
		loaded?: number;
		total?: number;
	}) => {
		if (!modelStep || !event.file || !WEIGHTS.test(event.file)) {
			if (!stage) enter(fetching);
			return;
		}
		const file = files.get(event.file);
		if (event.status === 'initiate') {
			if (!file) files.set(event.file, { loaded: 0 });
		} else if (event.status === 'progress') {
			files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
			report();
		} else if (event.status === 'done' && file) {
			const total = Math.max(file.total ?? 0, file.loaded);
			files.set(event.file, { loaded: total, total });
			report();
		}
	};
	const tokenizer = await AutoTokenizer.from_pretrained(repo, { progress_callback });
	modelStep = true;
	const model = await AutoModelForCausalLM.from_pretrained(repo, {
		dtype,
		use_external_data_format: weightFiles,
		device,
		progress_callback
	});
	enter('warming');
	await model.generate({
		...tokenizer('Hello', { add_special_tokens: false }),
		max_new_tokens: 1,
		do_sample: false
	});
	const config = model.config as {
		max_position_embeddings?: number;
		text_config?: { max_position_embeddings?: number };
	};
	const context =
		config.max_position_embeddings ?? config.text_config?.max_position_embeddings ?? 4096;
	const breaks = encode(tokenizer, '\n');
	if (breaks.length !== 1) throw new Error("this model's tokenizer has no line-break token");
	const eos = model.generation_config?.eos_token_id ?? [];
	const end = (Array.isArray(eos) ? eos : [eos]).map(Number);
	const foreign = foreignTokens(tokenizer.get_vocab() as Map<string, number>, end);
	const ready = { model, tokenizer, context, newline: breaks[0], end, foreign };
	return { ...ready, reuse: await checkReuse(ready) };
}

const encode = (tokenizer: PreTrainedTokenizer, text: string): number[] =>
	tokenizer.encode(text, { add_special_tokens: false });

const idsTensor = (ids: number[]) =>
	new Tensor(
		'int64',
		BigInt64Array.from(ids, (id) => BigInt(id)),
		[1, ids.length]
	);

// The prompt's tokens, and how many of them are the shared opening
function promptIds(tokenizer: PreTrainedTokenizer, system: string, prompt: string) {
	// enable_thinking goes through to the chat template, which the types
	// don't know about: the people answer straight away
	const options = { tokenize: false, add_generation_prompt: true, enable_thinking: false };
	const text = tokenizer.apply_chat_template(chat(system, prompt), options) as string;
	const marked = tokenizer.apply_chat_template(chat(system, PROMPT_MARK), options) as string;
	const ids = encode(tokenizer, text);
	const opening = sharedLength(ids, encode(tokenizer, openingText(marked)));
	// at least the last token is always read, to have something to answer from
	return { ids, opening: Math.min(opening, ids.length - 1) };
}

// What a run of the model leaves: every token so far, and the model's memory
// of having read them (all but the last, which it never had to read)
type Run = { sequences: Tensor; past_key_values: DynamicCache };

type GenerateOptions = {
	input_ids: Tensor;
	past_key_values?: DynamicCache;
	max_new_tokens: number;
	do_sample: boolean;
	logits_processor?: LogitsProcessor[];
	stopping_criteria?: StoppingCriteria[];
};

async function generate({ model }: Pick<Loaded, 'model'>, options: GenerateOptions): Promise<Run> {
	const logits_processor = new LogitsProcessorList();
	logits_processor.extend(options.logits_processor ?? []);
	const stopping_criteria = new StoppingCriteriaList();
	stopping_criteria.extend(options.stopping_criteria ?? []);
	return (await model.generate({
		...options,
		attention_mask: ones_like(options.input_ids),
		return_dict_in_generate: true,
		temperature: TEMPERATURE,
		top_k: 64,
		logits_processor,
		stopping_criteria
		// the types don't know about return_dict_in_generate's shape
	} as never)) as unknown as Run;
}

// Reads an opening and keeps the model's reading of it, as plain arrays.
// Generating one token reads the whole opening and leaves a cache for exactly
// those tokens; the token itself is thrown away.
async function readOpening(ready: Pick<Loaded, 'model'>, ids: number[]): Promise<Opening> {
	const run = await generate(ready, {
		input_ids: idsTensor(ids),
		max_new_tokens: 1,
		do_sample: false
	});
	try {
		const tensors: Opening['tensors'] = [];
		for (const [name, tensor] of Object.entries(run.past_key_values)) {
			// on the GPU, its numbers are copied back once, here
			const data =
				tensor.location === 'cpu' || tensor.location === 'cpu-pinned'
					? tensor.data
					: ((await tensor.ort_tensor.getData()) as Tensor['data']);
			tensors.push({ name, type: tensor.type, data, dims: [...tensor.dims] });
		}
		return { tensors };
	} finally {
		await run.past_key_values.dispose();
	}
}

// A cache for one request to start from, which it may change as it likes:
// new tensors over the kept numbers, which the model only ever reads (it
// replaces a cache's tensors, it never writes into them)
const fromOpening = (opening: Opening) =>
	new DynamicCache(
		Object.fromEntries(
			opening.tensors.map(({ name, type, data, dims }) => [name, new Tensor(type, data, dims)])
		)
	);

// The kept reading for an opening, read now if it isn't kept yet
async function openingFor(
	ready: Loaded,
	ids: number[]
): Promise<{ opening: Opening; new: boolean }> {
	const key = ids.join(',');
	const kept = openings.get(key);
	if (kept) {
		openings.delete(key);
		openings.set(key, kept);
		return { opening: kept, new: false };
	}
	const opening = await readOpening(ready, ids);
	openings.set(key, opening);
	while (openings.size > OPENINGS) openings.delete(openings.keys().next().value!);
	return { opening, new: true };
}

// The scores for the model's next token after `ids`, read whole or from a
// kept reading of the start
async function nextScores(ready: Loaded | Omit<Loaded, 'reuse'>, ids: number[], from?: Opening) {
	let scores: Float32Array | undefined;
	class Capture extends LogitsProcessor {
		_call(_: bigint[][], logits: Tensor) {
			scores = (logits.data as Float32Array).slice();
			return logits;
		}
	}
	const run = await generate(ready, {
		input_ids: idsTensor(ids),
		past_key_values: from && fromOpening(from),
		max_new_tokens: 1,
		do_sample: false,
		logits_processor: [new Capture()]
	});
	await run.past_key_values.dispose();
	return scores!;
}

// Whether the model reads a prompt the same from a kept reading of its start
// as it does whole. Starting from a kept reading means reading many new tokens
// at once on top of a cache, which some exports of image-and-text models get
// wrong (lib/chess/ai.worker.ts feeds them one at a time). If they disagree,
// or it fails, every prompt is read whole.
async function checkReuse(ready: Omit<Loaded, 'reuse'>): Promise<ReuseCheck> {
	const { ids, opening } = promptIds(
		ready.tokenizer,
		'You live in a small village by a river. Answer in one short plain sentence.',
		'You are Asha, a potter. A bowl you left by the fire came out hard. What do you think?'
	);
	const whole = await nextScores(ready, ids);
	try {
		const kept = await readOpening(ready, ids.slice(0, opening));
		const reused = await nextScores(ready, ids, kept);
		const top = [...whole.keys()].sort((a, b) => whole[b] - whole[a]).slice(0, 20);
		const drift = Math.max(...top.map((token) => Math.abs(whole[token] - reused[token])));
		const agree = argmax(reused) === top[0];
		if (!agree || !(drift <= MAX_DRIFT))
			return { ok: false, agree, drift, reason: 'its reading from a kept start differs' };
		return { ok: true, agree, drift };
	} catch (error) {
		return { ok: false, reason: String(error) };
	}
}

function argmax(scores: Float32Array): number {
	let top = 0;
	for (let i = 1; i < scores.length; i++) if (scores[i] > scores[top]) top = i;
	return top;
}

// Holds the reply to its shape (lib/llm/reply.ts): plain words in the free
// line, which ends with a line break of its own; then each field, a token at
// a time along its options. Fields take the likeliest option.
class Shaped extends LogitsProcessor {
	firstAt?: number;
	constructor(
		private shape: Shape,
		private start: number,
		private ready: Loaded
	) {
		super();
	}
	_call(input_ids: bigint[][], logits: Tensor) {
		this.firstAt ??= performance.now();
		const scores = logits.data as Float32Array;
		const step = planReply(this.shape, input_ids[0].slice(this.start).map(Number));
		if (step.kind === 'free') {
			for (const token of this.ready.foreign) scores[token] = -Infinity;
			// not a blank line, and not the end while fields are still to come
			if (step.count === 0) scores[this.shape.newline] = -Infinity;
			if (!step.last) for (const token of this.ready.end) scores[token] = -Infinity;
			// the scores have been divided by the temperature already
			let top = -Infinity;
			for (const score of scores) if (score > top) top = score;
			const floor = top + Math.log(MIN_P);
			for (let i = 0; i < scores.length; i++) if (scores[i] < floor) scores[i] = -Infinity;
		} else if (step.kind === 'only') {
			restrict(scores, [best(scores, step.tokens)]);
		}
		return logits;
	}
}

class ShapeDone extends StoppingCriteria {
	constructor(
		private shape: Shape,
		private start: number
	) {
		super();
	}
	_call(input_ids: (number | bigint)[][]) {
		return input_ids.map(
			(ids) => planReply(this.shape, ids.slice(this.start).map(Number)).kind === 'done'
		);
	}
}

// the most tokens it takes to write any option of a field
function depth(trie: OptionTrie): number {
	let most = 0;
	for (const child of trie.next.values()) most = Math.max(most, 1 + depth(child));
	return most;
}

async function answer(turn: Turn): Promise<MindResult | undefined> {
	const { ask } = turn;
	if (!loaded) throw new Error('no model is loaded');
	const ready = await loaded;
	const problem = checkAsk(ask);
	if (problem) throw new Error(problem);
	const { tokenizer } = ready;
	const begun = performance.now();
	const { ids, opening } = promptIds(tokenizer, ask.system, ask.prompt);

	const shape: Shape = {
		free: ask.free && Math.min(ask.free.maxTokens, MAX_FREE_TOKENS),
		fields: (ask.fields ?? []).map((field) => ({
			label: field.label,
			trie: optionTrie(
				field.options,
				(text) => encode(tokenizer, text),
				(option) => fieldLine(field.label, option)
			)
		})),
		newline: ready.newline
	};
	const room =
		(shape.free === undefined ? 0 : shape.free + 1) +
		shape.fields.reduce((sum, field) => sum + depth(field.trie), 0);
	if (ids.length + room > ready.context)
		throw new Error(`the prompt is ${ids.length} tokens, too long for this model`);

	let reused = 0;
	let past_key_values: DynamicCache | undefined;
	if (ask.reuse !== false && ready.reuse.ok && opening > 0) {
		const kept = await openingFor(ready, ids.slice(0, opening));
		past_key_values = fromOpening(kept.opening);
		// read just now, it saved nothing this time
		if (!kept.new) reused = opening;
	}
	if (turn.stopped) return undefined;

	const shaped = new Shaped(shape, ids.length, ready);
	let run: Run | undefined;
	try {
		run = await generate(ready, {
			input_ids: idsTensor(ids),
			past_key_values,
			max_new_tokens: Math.max(1, room),
			do_sample: shape.free !== undefined,
			logits_processor: [shaped],
			stopping_criteria: [turn.stopping, new ShapeDone(shape, ids.length)]
		});
	} finally {
		await run?.past_key_values.dispose();
	}
	if (turn.stopped) return undefined;
	const ended = performance.now();

	const written = [...run.sequences.data].slice(ids.length).map(Number);
	const step = planReply(shape, written);
	let free: number[];
	let fields: Record<string, string> = {};
	if (step.kind === 'done') ({ free, fields } = step);
	// a free line alone may also end with the end of the reply, or run out
	else if (step.kind === 'free' && step.last) free = step.free;
	else throw new Error(`the reply came out of shape (${step.kind})`);

	const firstAt = shaped.firstAt ?? ended;
	return {
		id: ask.id,
		text: free.length ? freeLine(tokenizer.decode(free, { skip_special_tokens: true })) : '',
		fields,
		speed: {
			promptTokens: ids.length,
			reusedTokens: reused,
			readMs: firstAt - begun,
			writtenTokens: written.length,
			writeMs: ended - firstAt
		}
	};
}

// Lets the messages already sent arrive. On the processor (WebAssembly) a run
// of the model doesn't give way to them until it's done, so without this the
// next request to arrive would go next, whatever its priority, and a stop
// sent meanwhile would come too late for what was waiting.
const arrivals = () => new Promise((resolve) => setTimeout(resolve, 0));

// Answers what's waiting, one at a time, until nothing is
async function pump() {
	if (pumping) return;
	pumping = true;
	for (;;) {
		await arrivals();
		const { next, expired } = queue.take(Date.now());
		for (const ask of expired) post({ type: 'dropped', id: ask.id, reason: 'deadline' });
		if (!next) break;
		const turn: Turn = { ask: next, stopping: new InterruptableStoppingCriteria(), stopped: false };
		current = turn;
		try {
			const result = await answer(turn);
			if (result) post({ type: 'result', result });
		} catch (error) {
			if (!turn.stopped) post({ type: 'error', id: next.id, message: String(error) });
		} finally {
			current = undefined;
		}
	}
	pumping = false;
}

onmessage = (event: MessageEvent<MindRequest>) => {
	const message = event.data;
	if (message.type === 'load') {
		loaded = load(message.repo, message.dtype, message.device, message.files);
		loaded.then(
			(ready) => post({ type: 'ready', reuse: ready.reuse }),
			(error) => {
				loaded = undefined;
				post({ type: 'load-error', message: String(error) });
			}
		);
	} else if (message.type === 'stop') {
		for (const ask of queue.clear()) post({ type: 'dropped', id: ask.id, reason: 'stopped' });
		if (current && !current.stopped) {
			current.stopped = true;
			current.stopping.interrupt();
			post({ type: 'dropped', id: current.ask.id, reason: 'stopped' });
		}
	} else {
		queue.push(message.request);
		void pump();
	}
};
