import {
	AutoModelForCausalLM,
	AutoTokenizer,
	cat,
	InterruptableStoppingCriteria,
	ones_like,
	StoppingCriteriaList,
	TextStreamer,
	type DynamicCache,
	type Tensor,
	type PreTrainedModel,
	type PreTrainedTokenizer
} from '@huggingface/transformers';
import type { Dtype } from './models';
import { buildMessages, HISTORY_PLIES, splitReply, type PromptInput } from './prompt';

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
			externalData?: boolean;
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
	| { type: 'done'; id: number; text: string; opened: boolean }
	| { type: 'error'; id: number; message: string };

// Small models can think in circles, so thinking gets a budget of time and
// words. When it runs out the thinking is closed and the move asked for.
const THINK_MS = 30_000;
const THINK_TOKENS = 768;
// the move itself, and a few words around it
const ANSWER_TOKENS = 24;

type Loaded = { model: PreTrainedModel; tokenizer: PreTrainedTokenizer; context: number };

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
	externalData?: boolean
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
		shown = Math.max(shown, done / total);
		post({ type: 'progress', progress: shown });
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
		...(externalData && { use_external_data_format: true }),
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
	onText?: (text: string) => void
) {
	const stopping_criteria = new StoppingCriteriaList();
	stopping_criteria.push(stopping);
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

async function move(id: number, input: PromptInput) {
	const ready = await loaded!;
	const { tokenizer, context } = ready;
	const native = input.think && input.thinking === 'native';
	const budget = (input.think ? THINK_TOKENS : 0) + ANSWER_TOKENS;

	// The prompt is about the same size every turn; if a model's window is
	// still too small for it plus the thinking, older moves go first.
	let plies = HISTORY_PLIES;
	let prompt: string;
	for (;;) {
		// enable_thinking goes through to the chat template, which the types
		// don't know about
		const options = { tokenize: false, add_generation_prompt: true, enable_thinking: native };
		prompt = tokenizer.apply_chat_template(buildMessages(input, plies), options) as string;
		const length = tokenizer.encode(prompt, { add_special_tokens: false }).length;
		if (length + budget <= context || plies === 0) break;
		plies = Math.max(0, plies - 6);
	}
	const opened = /<think>\s*$/.test(prompt);

	const current = { id, stopping: new InterruptableStoppingCriteria() };
	turn = current;
	let text = '';
	// The thinking's clock starts at its first word. Some models take a long
	// while to read the prompt (Qwen3.5 reads it a word at a time in the
	// browser), and that shouldn't count against the time it gets to think.
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stream = (piece: string) => {
		text += piece;
		if (input.think && !timer) timer = setTimeout(() => current.stopping.interrupt(), THINK_MS);
		if (turn === current) post({ type: 'stream', id, text, opened });
	};
	let run: Run | undefined;
	try {
		run = await generate(
			ready,
			ids(tokenizer, prompt),
			undefined,
			budget,
			true,
			current.stopping,
			stream
		);
		if (turn !== current) return;

		// Out of time or words while still thinking: close the thinking and ask
		// for the move straight away, carrying on from where it stopped rather
		// than reading the whole prompt again.
		const reply = splitReply(text, opened);
		if (input.think && !(reply.closed && reply.answer)) {
			current.stopping = new InterruptableStoppingCriteria();
			const tagged = opened || text.includes('<think>');
			const nudge = `${tagged && !reply.closed ? '\n</think>\n\n' : '\n'}Move:`;
			stream(nudge);
			// the answer has its own limit, in words, not time
			clearTimeout(timer);
			// The model's memory is updated in place as it goes. It takes the
			// nudge a token at a time: given several at once, image-and-text
			// models (Qwen3.5) try to look for an image they never loaded. Each
			// step's own next token is thrown away.
			const extra = ids(tokenizer, nudge);
			const count = extra.dims[1];
			for (let k = 0; k < count; k++) {
				const next = k ? cat([run.sequences, extra.slice(null, [0, k])], 1) : run.sequences;
				await generate(ready, next, run.past_key_values, 1, false, current.stopping);
				if (turn !== current) return;
			}
			run = await generate(
				ready,
				cat([run.sequences, extra], 1),
				run.past_key_values,
				ANSWER_TOKENS,
				false,
				current.stopping,
				stream
			);
			if (turn !== current) return;
		}
	} finally {
		clearTimeout(timer);
		await run?.past_key_values.dispose();
	}
	turn = undefined;
	post({ type: 'done', id, text, opened });
}

onmessage = (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	if (request.type === 'load') {
		loaded = load(request.repo, request.dtype, request.device, request.externalData);
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
