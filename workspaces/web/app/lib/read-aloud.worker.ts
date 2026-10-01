import { KokoroTTS, TextSplitterStream, type GenerateOptions } from 'kokoro-js';

// Speaks a post with Kokoro, an 82M parameter text-to-speech model, entirely
// in the reader's browser. It runs in a worker so synthesis never stalls the
// page. The weights come from the Hugging Face Hub on first use and the
// browser caches them after that.
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
type Voice = NonNullable<GenerateOptions['voice']>;

export type WorkerRequest =
	| { type: 'start'; id: number; segments: string[]; voice: Voice; speed: number }
	| { type: 'pull'; id: number }
	| { type: 'stop' };

export type WorkerResponse =
	| { type: 'progress'; progress: number }
	| { type: 'chunk'; id: number; segment: number; samples: Float32Array; rate: number }
	| { type: 'done'; id: number }
	| { type: 'error'; id: number; message: string };

type Chunk = { segment: number; samples: Float32Array; rate: number };

let model: Promise<KokoroTTS> | undefined;
let reading: { id: number; chunks: AsyncGenerator<Chunk> } | undefined;
// one chunk at a time, in the order they were asked for
let queue = Promise.resolve();

function post(message: WorkerResponse, transfer: Transferable[] = []) {
	postMessage(message, { transfer });
}

async function load(): Promise<KokoroTTS> {
	// WebGPU is far faster where it exists; otherwise a quantized model on WASM
	const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
	const webgpu = !!(gpu && (await gpu.requestAdapter().catch(() => null)));

	// Several files download at once, so progress is over all of them, and
	// never goes backwards when a new one starts.
	const files = new Map<string, { loaded: number; total: number }>();
	let shown = 0;
	return KokoroTTS.from_pretrained(MODEL, {
		dtype: webgpu ? 'fp32' : 'q8',
		device: webgpu ? 'webgpu' : 'wasm',
		progress_callback: (event) => {
			if (event.status !== 'progress') return;
			files.set(event.file, { loaded: event.loaded, total: event.total });
			let loaded = 0;
			let total = 0;
			for (const file of files.values()) {
				loaded += file.loaded;
				total += file.total;
			}
			shown = Math.max(shown, total ? loaded / total : 0);
			post({ type: 'progress', progress: shown });
		}
	});
}

// Each segment (a heading, a paragraph) is spoken a sentence at a time.
async function* speak(segments: string[], voice: Voice, speed: number): AsyncGenerator<Chunk> {
	model ??= load().catch((error) => {
		model = undefined; // so the next try starts over
		throw error;
	});
	const tts = await model;
	for (const [segment, text] of segments.entries()) {
		// Handed a plain string, stream() never closes its sentence splitter and
		// waits forever after the last sentence (kokoro-js 1.2.1), so it gets a
		// splitter that is already closed.
		const sentences = new TextSplitterStream();
		sentences.push(text);
		sentences.close();
		for await (const { audio } of tts.stream(sentences, { voice, speed })) {
			yield { segment, samples: audio.audio, rate: audio.sampling_rate };
		}
	}
}

onmessage = (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;
	if (request.type === 'start') {
		reading = { id: request.id, chunks: speak(request.segments, request.voice, request.speed) };
	} else if (request.type === 'stop') {
		reading = undefined;
	} else {
		// The page pulls a chunk whenever it is running low, so synthesis keeps
		// only a little ahead of playback.
		const { id } = request;
		queue = queue.then(async () => {
			const chunks = reading?.id === id ? reading.chunks : undefined;
			if (!chunks) return;
			try {
				const next = await chunks.next();
				if (reading?.id !== id) return;
				if (next.done) {
					post({ type: 'done', id });
				} else {
					const { segment, samples, rate } = next.value;
					post({ type: 'chunk', id, segment, samples, rate }, [samples.buffer]);
				}
			} catch (error) {
				post({ type: 'error', id, message: String(error) });
			}
		});
	}
};
