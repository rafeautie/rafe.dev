import {
	AutoModelForCausalLM,
	AutoTokenizer,
	InterruptableStoppingCriteria,
	StoppingCriteriaList,
	TextStreamer,
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
	| { type: 'load'; repo: string; dtype: Dtype; device: 'webgpu' | 'wasm' }
	| { type: 'move'; id: number; input: PromptInput }
	// "Move now": end the thinking and answer with what it has
	| { type: 'finish'; id: number }
	// drop the turn altogether, as when the game is abandoned
	| { type: 'stop' };

export type WorkerResponse =
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
let turn: { id: number; stopping: InterruptableStoppingCriteria; thinking: boolean } | undefined;
// one turn at a time, in the order they were asked for
let queue = Promise.resolve();
// turns asked for before the last stop are skipped when their time comes
let latestId = -1;
let stoppedThrough = -1;

function post(message: WorkerResponse) {
	postMessage(message);
}

async function load(repo: string, dtype: Dtype, device: 'webgpu' | 'wasm'): Promise<Loaded> {
	// Several files download at once, so progress is over all of them, and
	// never goes backwards when a new one starts.
	const files = new Map<string, { loaded: number; total: number }>();
	let shown = 0;
	const progress_callback = (event: {
		status: string;
		file?: string;
		loaded?: number;
		total?: number;
	}) => {
		if (event.status !== 'progress' || !event.file) return;
		files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
		let done = 0;
		let total = 0;
		for (const file of files.values()) {
			done += file.loaded;
			total += file.total;
		}
		shown = Math.max(shown, total ? done / total : 0);
		post({ type: 'progress', progress: shown });
	};
	const tokenizer = await AutoTokenizer.from_pretrained(repo, { progress_callback });
	const model = await AutoModelForCausalLM.from_pretrained(repo, {
		dtype,
		device,
		progress_callback
	});
	const config = model.config as {
		max_position_embeddings?: number;
		text_config?: { max_position_embeddings?: number };
	};
	const context =
		config.max_position_embeddings ?? config.text_config?.max_position_embeddings ?? 4096;
	return { model, tokenizer, context };
}

async function generate(
	{ model, tokenizer }: Loaded,
	prompt: string,
	max_new_tokens: number,
	sample: boolean,
	stopping: InterruptableStoppingCriteria,
	onText: (text: string) => void
) {
	const inputs = tokenizer(prompt, { add_special_tokens: false });
	const stopping_criteria = new StoppingCriteriaList();
	stopping_criteria.push(stopping);
	await model.generate({
		...inputs,
		max_new_tokens,
		do_sample: sample,
		// thinking models are tuned to reason at 0.6; a little randomness
		// keeps games from repeating move for move
		temperature: 0.6,
		top_p: 0.95,
		stopping_criteria,
		streamer: new TextStreamer(tokenizer, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: onText
		})
	});
}

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

	const current = { id, stopping: new InterruptableStoppingCriteria(), thinking: input.think };
	turn = current;
	let text = '';
	const stream = (piece: string) => {
		text += piece;
		if (turn === current) post({ type: 'stream', id, text, opened });
	};
	const timer = input.think ? setTimeout(() => current.stopping.interrupt(), THINK_MS) : undefined;
	try {
		await generate(ready, prompt, budget, true, current.stopping, stream);
	} finally {
		clearTimeout(timer);
	}
	if (turn !== current) return;

	// Out of time or words while still thinking: close the thinking and ask
	// for the move straight away.
	const reply = splitReply(text, opened);
	if (input.think && !(reply.closed && reply.answer)) {
		current.thinking = false;
		current.stopping = new InterruptableStoppingCriteria();
		const tagged = opened || text.includes('<think>');
		stream(`${tagged && !reply.closed ? '\n</think>\n\n' : '\n'}Move:`);
		await generate(ready, prompt + text, ANSWER_TOKENS, false, current.stopping, stream);
		if (turn !== current) return;
	}
	turn = undefined;
	post({ type: 'done', id, text, opened });
}

onmessage = (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	if (request.type === 'load') {
		loaded = load(request.repo, request.dtype, request.device);
		loaded.then(
			() => post({ type: 'ready' }),
			(error) => {
				loaded = undefined;
				post({ type: 'load-error', message: String(error) });
			}
		);
	} else if (request.type === 'finish') {
		if (turn?.id === request.id && turn.thinking) turn.stopping.interrupt();
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
