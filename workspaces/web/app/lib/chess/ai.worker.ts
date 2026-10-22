import {
	AutoModelForCausalLM,
	AutoTokenizer,
	cat,
	InterruptableStoppingCriteria,
	LogitsProcessor,
	LogitsProcessorList,
	ones_like,
	StoppingCriteria,
	StoppingCriteriaList,
	TextStreamer,
	type DynamicCache,
	type Tensor,
	type PreTrainedModel,
	type PreTrainedTokenizer
} from '@huggingface/transformers';
import { allowed, follow, moveTrie, restrict, type MoveTrie } from './constrain';
import type { Dtype } from './models';
import type { Speed } from './storage';
import {
	buildMessages,
	CONSIDERING,
	findMove,
	HISTORY_PLIES,
	splitReply,
	type PromptInput
} from './prompt';

// The /chess opponent: a small language model running in the player's browser,
// in a worker so the board never freezes while it thinks. The weights come
// from the Hugging Face Hub on first use and the browser caches them after
// that. It only writes text; the page decides whether that names a legal move
// (lib/chess/use-opponent.ts).

export type WorkerRequest =
	| {
			type: 'load';
			repo: string;
			dtype: Dtype;
			device: 'webgpu' | 'wasm';
			// how many weight files each graph has (models.ts)
			files: Record<string, number>;
	  }
	| { type: 'move'; id: number; input: PromptInput }
	// drop the turn altogether, as when the game is abandoned
	| { type: 'stop' };

// What loading is doing: fetching the weights (from the network, or the
// browser's cache), putting them on the GPU or in memory, then one tiny run so
// the first real move isn't the one that pays for compiling everything.
export type LoadStage = 'downloading' | 'preparing' | 'warming';

export type WorkerResponse =
	| { type: 'stage'; stage: LoadStage }
	| { type: 'progress'; progress: number }
	| { type: 'ready' }
	| { type: 'load-error'; message: string }
	// the reply so far; `opened` when the template began it inside <think>
	| { type: 'stream'; id: number; text: string; opened: boolean }
	| { type: 'done'; id: number; text: string; opened: boolean; speed?: Speed }
	| { type: 'error'; id: number; message: string };

// each reason, a short line
const REASON_TOKENS = 24;
// and at least this many letters of it before it may end
const REASON_MIN = 12;
// room for the whole considered reply (CONSIDERING): its lines, reasons and
// the words written around them
const CONSIDER_TOKENS = 160;
// room to write the move the first time round, and a few words around it
const ANSWER_TOKENS = 24;
// the longest move, a token or so at a time, with room to spare
const MOVE_TOKENS = 12;

type Loaded = {
	model: PreTrainedModel;
	tokenizer: PreTrainedTokenizer;
	context: number;
};

let loaded: Promise<Loaded> | undefined;
let turn: { id: number; stopping: InterruptableStoppingCriteria } | undefined;
// one turn at a time, in the order they were asked for
let queue = Promise.resolve();
// turns asked for before the last stop are skipped when their time comes
let latestId = -1;
let stoppedThrough = -1;

function post(message: WorkerResponse) {
	postMessage(message);
}

const WEIGHTS = /\.onnx(_data(_\d+)?)?$/;

async function load(
	repo: string,
	dtype: Dtype,
	device: 'webgpu' | 'wasm',
	weightFiles: Record<string, number>
): Promise<Loaded> {
	// The bar counts the weights (the .onnx files and their data), from the
	// sizes their downloads report as they start. The loader's own overall
	// figure (`progress_total`) isn't used: it rests on sizes looked up
	// beforehand, which the browser can't always read, and then the small
	// files alone look like 100%. The weights are all asked for at once, so
	// the bar waits until each has a size before it shows anything. Configs
	// and the tokenizer are tiny and would read as done before the weights
	// begin, so they don't count.
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
		// only when the whole percent shown on the page changes
		if (Math.floor(next * 100) > Math.floor(shown * 100))
			post({ type: 'progress', progress: next });
		shown = next;
		// every file is in hand: what's left is loading them onto the device
		if (done >= total) enter('preparing');
	};
	const progress_callback = (event: {
		status: string;
		file?: string;
		loaded?: number;
		total?: number;
	}) => {
		if (!modelStep || !event.file || !WEIGHTS.test(event.file)) {
			if (!stage) enter('downloading');
			return;
		}
		const file = files.get(event.file);
		if (event.status === 'initiate') {
			if (!file) files.set(event.file, { loaded: 0 });
		} else if (event.status === 'progress') {
			files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
			report();
		} else if (event.status === 'done' && file) {
			// a file read without progress, e.g. from the cache in some browsers
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
	return { model, tokenizer, context };
}

// What a run of the model leaves: every token so far, and the model's memory
// of having read them, so a follow-up run only has to read what's new.
type Run = { sequences: Tensor; past_key_values: DynamicCache };

async function generate(
	{ model, tokenizer }: Loaded,
	input_ids: Tensor,
	past_key_values: DynamicCache | undefined,
	max_new_tokens: number,
	sample: boolean,
	stopping: InterruptableStoppingCriteria,
	onText?: (text: string) => void,
	more: { stops?: StoppingCriteria[]; processors?: LogitsProcessor[] } = {}
) {
	const stopping_criteria = new StoppingCriteriaList();
	stopping_criteria.push(stopping);
	stopping_criteria.extend(more.stops ?? []);
	const logits_processor = new LogitsProcessorList();
	logits_processor.extend(more.processors ?? []);
	return (await model.generate({
		input_ids,
		attention_mask: ones_like(input_ids),
		past_key_values,
		return_dict_in_generate: true,
		max_new_tokens,
		do_sample: sample,
		// thinking models are tuned to reason at 0.6; a little randomness
		// keeps games from repeating move for move
		temperature: 0.6,
		top_p: 0.95,
		stopping_criteria,
		logits_processor,
		streamer:
			onText &&
			new TextStreamer(tokenizer, {
				skip_prompt: true,
				skip_special_tokens: true,
				callback_function: onText
			})
		// the types don't know about return_dict_in_generate's shape
	} as never)) as unknown as Run;
}

const ids = (tokenizer: PreTrainedTokenizer, text: string) =>
	tokenizer(text, { add_special_tokens: false }).input_ids as Tensor;

// Stops the model just as it starts to write its move ("Move:"), outside its
// thinking, so the move itself can be held to the legal ones (MoveOnly).
class AtMove extends StoppingCriteria {
	constructor(
		private tokenizer: PreTrainedTokenizer,
		private start: number,
		private opened: boolean
	) {
		super();
	}
	_call(input_ids: (number | bigint)[][]) {
		return input_ids.map((ids) => {
			// only what the model has written; the tokenizer won't read nothing
			const written = ids.slice(Math.max(this.start, ids.length - 6));
			if (!written.length) return false;
			const tail = this.tokenizer.decode(written.map(Number));
			if (!/move\**\s*:\s*\**\s*$/i.test(tail)) return false;
			const text = this.tokenizer.decode(ids.slice(this.start).map(Number), {
				skip_special_tokens: true
			});
			const tagged = this.opened || text.includes('<think>');
			return !tagged || splitReply(text, this.opened).closed;
		});
	}
}

// Lets the model write only a legal move, and stops it once one is written
class MoveOnly extends LogitsProcessor {
	constructor(
		private trie: MoveTrie,
		private start: number,
		private end: number[]
	) {
		super();
	}
	_call(input_ids: bigint[][], logits: Tensor) {
		const node = follow(this.trie, input_ids[0].slice(this.start).map(Number));
		if (node) restrict(logits.data as Float32Array, allowed(node, this.end));
		return logits;
	}
}

// The tokens a reason may not use yet: the line break and the end of the
// reply before it has said anything, numbers to start it (small models copy
// the move numbers), and blank lines at any point. Only the ones the tokenizer
// spells as a single token, which are the ones the model uses.
type ReasonWords = { breaks: number[]; blank: number[]; numbers: number[] };

function reasonWords(tokenizer: PreTrainedTokenizer, end: number[]): ReasonWords {
	const one = (text: string) => {
		const tokens = ids(tokenizer, text).data;
		return tokens.length === 1 ? [Number(tokens[0])] : [];
	};
	const digits = [...'0123456789'].flatMap((d) => [d, ` ${d}`, `${d}.`, ` ${d}.`]);
	return {
		breaks: [...one('\n'), ...end],
		blank: ['\n\n', '\n\n\n', ' \n\n'].flatMap(one),
		numbers: [...digits, '.', ' .', '-', ' -'].flatMap(one)
	};
}

class Reason extends LogitsProcessor {
	constructor(
		private tokenizer: PreTrainedTokenizer,
		private start: number,
		private words: ReasonWords
	) {
		super();
	}
	_call(input_ids: bigint[][], logits: Tensor) {
		const written = input_ids[0].slice(this.start);
		const said = written.length ? this.tokenizer.decode(written.map(Number)).trim() : '';
		const block = [...this.words.blank];
		if (said.length < REASON_MIN) block.push(...this.words.breaks);
		if (!said) block.push(...this.words.numbers);
		const scores = logits.data as Float32Array;
		for (const token of block) scores[token] = -Infinity;
		return logits;
	}
}

// Stops the model at the end of a line
class LineEnd extends StoppingCriteria {
	constructor(
		private tokenizer: PreTrainedTokenizer,
		private start: number
	) {
		super();
	}
	_call(input_ids: (number | bigint)[][]) {
		return input_ids.map((ids) => {
			const written = ids.slice(this.start);
			return written.length > 0 && this.tokenizer.decode(written.map(Number)).includes('\n');
		});
	}
}

class MoveWritten extends StoppingCriteria {
	constructor(
		private trie: MoveTrie,
		private start: number
	) {
		super();
	}
	_call(input_ids: (number | bigint)[][]) {
		return input_ids.map((ids) => {
			const node = follow(this.trie, ids.slice(this.start).map(Number));
			return !node || (node.move !== undefined && node.next.size === 0);
		});
	}
}

async function move(id: number, input: PromptInput) {
	const ready = await loaded!;
	const { tokenizer, context } = ready;
	const budget = input.think ? CONSIDER_TOKENS : ANSWER_TOKENS;

	// The prompt is about the same size every turn; if a model's window is
	// still too small for it plus the reply, older moves go first.
	let plies = HISTORY_PLIES;
	let prompt: string;
	for (;;) {
		// enable_thinking goes through to the chat template, which the types
		// don't know about; the model considers its moves in the open instead
		const options = { tokenize: false, add_generation_prompt: true, enable_thinking: false };
		prompt = tokenizer.apply_chat_template(buildMessages(input, plies), options) as string;
		const length = tokenizer.encode(prompt, { add_special_tokens: false }).length;
		if (length + budget <= context || plies === 0) break;
		plies = Math.max(0, plies - 6);
	}
	const opened = /<think>\s*$/.test(prompt);
	// When considering, the reply starts with the shape already begun
	const begin = input.think ? CONSIDERING.heading + CONSIDERING.bullet : '';

	const current = { id, stopping: new InterruptableStoppingCriteria() };
	turn = current;
	let text = '';
	const show = (piece: string) => {
		text += piece;
		if (turn === current) post({ type: 'stream', id, text, opened });
	};
	// what the model writes itself, as against what's written for it
	const begun = performance.now();
	let firstAt: number | undefined;
	const stream = (piece: string) => {
		firstAt ??= performance.now();
		show(piece);
	};
	let run: Run | undefined;
	const prompt_ids = ids(tokenizer, prompt + begin);
	const eos = ready.model.generation_config?.eos_token_id ?? [];
	const end = (Array.isArray(eos) ? eos : [eos]).map(Number);
	let speed: Speed | undefined;

	// Writes `words` into the reply for the model. The model's memory is
	// updated in place as it goes, and it takes them a token at a time: given
	// several at once, image-and-text models (Gemma 4) look for an image they
	// never loaded. Each step's own next token is thrown away.
	const write = async (from: Run, words: string): Promise<Run | undefined> => {
		show(words);
		const extra = ids(tokenizer, words);
		for (let k = 0; k < extra.dims[1]; k++) {
			const next = k ? cat([from.sequences, extra.slice(null, [0, k])], 1) : from.sequences;
			await generate(ready, next, from.past_key_values, 1, false, current.stopping);
			if (turn !== current) return undefined;
		}
		return { ...from, sequences: cat([from.sequences, extra], 1) };
	};
	// Lets the model write one of `moves` and nothing else, carrying on from
	// `from` (or from the prompt), and says which
	const pick = async (from: Run | undefined, moves: string[], spaced = false) => {
		const trie = moveTrie(moves, (move) => [...ids(tokenizer, move).data].map(Number), spaced);
		const sequences = from?.sequences ?? prompt_ids;
		const start = sequences.dims[1];
		const next = await generate(
			ready,
			sequences,
			from?.past_key_values,
			MOVE_TOKENS,
			false,
			current.stopping,
			stream,
			{ processors: [new MoveOnly(trie, start, end)], stops: [new MoveWritten(trie, start)] }
		);
		const tokens = [...next.sequences.slice(null, [start, next.sequences.dims[1]]).data].map(
			Number
		);
		return { run: next, move: follow(trie, tokens)?.move };
	};
	// Lets the model write freely to the end of the line, a few words at
	// least. One cut off at the limit gets an ellipsis.
	const words = reasonWords(tokenizer, end);
	const reason = async (from: Run) => {
		const start = from.sequences.dims[1];
		const next = await generate(
			ready,
			from.sequences,
			from.past_key_values,
			REASON_TOKENS,
			true,
			current.stopping,
			stream,
			{
				processors: [new Reason(tokenizer, start, words)],
				stops: [new LineEnd(tokenizer, start)]
			}
		);
		if (turn !== current || text.endsWith('\n')) return next;
		return write(next, '…');
	};
	// a line it has written ends at a line break; one cut short doesn't yet
	const newline = () => (text.endsWith('\n') ? '' : '\n');

	try {
		if (input.think) {
			// Its candidates, each a different legal move with its reason,
			// then the threat it sees, then its choice among the candidates
			show(begin);
			const legal = input.candidates ?? input.legal.map((move) => move.san);
			const chosen: string[] = [];
			const count = Math.min(CONSIDERING.candidates, legal.length);
			for (let n = 0; n < count; n++) {
				if (run) run = await write(run, newline() + CONSIDERING.bullet);
				if (turn !== current || (n && !run)) return;
				const picked = await pick(
					run,
					legal.filter((move) => !chosen.includes(move))
				);
				if (turn !== current || !picked.move) return;
				chosen.push(picked.move);
				run = await write(picked.run, CONSIDERING.dash);
				if (!run) return;
				run = await reason(run);
				if (turn !== current) return;
			}
			if (input.dangers?.length) {
				run = await write(run!, newline() + CONSIDERING.threat);
				if (!run) return;
				const picked = await pick(run, input.dangers);
				if (turn !== current) return;
				run = await write(picked.run, CONSIDERING.dash);
				if (!run) return;
				run = await reason(run);
				if (turn !== current) return;
			}
			run = await write(run!, `${newline()}Move: `);
			if (!run) return;
			run = (await pick(run, chosen)).run;
			if (turn !== current) return;
		} else {
			run = await generate(ready, prompt_ids, undefined, budget, true, current.stopping, stream, {
				stops: [new AtMove(tokenizer, prompt_ids.dims[1], opened)]
			});
			if (turn !== current) return;
			// Unless it named a legal move, ask for one: write "Move:" for it
			// and let it write only a legal move.
			const reply = splitReply(text, opened);
			const atMove = reply.closed && /move\**\s*:\s*\**\s*$/i.test(reply.answer);
			if (atMove || !findMove(text, input.legal).move) {
				if (!atMove) run = await write(run, '\nMove:');
				if (!run) return;
				run = (
					await pick(
						run,
						input.legal.map((move) => move.san),
						true
					)
				).run;
				if (turn !== current) return;
			}
		}
		const ended = performance.now();
		if (firstAt !== undefined)
			speed = {
				prompt: prompt_ids.dims[1],
				reading: (firstAt - begun) / 1000,
				written: run.sequences.dims[1] - prompt_ids.dims[1],
				writing: (ended - firstAt) / 1000
			};
	} finally {
		await run?.past_key_values.dispose();
	}
	turn = undefined;
	post({ type: 'done', id, text, opened, speed });
}

onmessage = (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	if (request.type === 'load') {
		loaded = load(request.repo, request.dtype, request.device, request.files);
		loaded.then(
			() => post({ type: 'ready' }),
			(error) => {
				loaded = undefined;
				post({ type: 'load-error', message: String(error) });
			}
		);
	} else if (request.type === 'stop') {
		turn?.stopping.interrupt();
		turn = undefined;
		stoppedThrough = latestId;
	} else {
		const { id, input } = request;
		latestId = Math.max(latestId, id);
		queue = queue.then(() => {
			if (id <= stoppedThrough) return;
			return move(id, input).catch((error) => post({ type: 'error', id, message: String(error) }));
		});
	}
};
