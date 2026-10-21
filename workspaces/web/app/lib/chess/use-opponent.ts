import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadStage, WorkerRequest, WorkerResponse } from './ai.worker';
import { dtypeFor, type ChessModel, type DeviceInfo } from './models';
import type { PromptInput } from './prompt';

// The page's side of lib/chess/ai.worker.ts: loads a model and asks it for
// replies, streaming them back as they are written.

export type OpponentState =
	| { status: 'idle' }
	// `starting` until the worker reports what it is doing
	| { status: 'loading'; model: ChessModel; stage: LoadStage | 'starting'; progress: number }
	| { status: 'ready'; model: ChessModel }
	| { status: 'error'; model: ChessModel; message: string };

export type Reply = { text: string; opened: boolean };

type Pending = {
	resolve: (reply: Reply) => void;
	reject: (error: Error) => void;
	onStream: (reply: Reply) => void;
};

export function useOpponent() {
	const [state, setState] = useState<OpponentState>({ status: 'idle' });
	const worker = useRef<Worker | undefined>(undefined);
	const pending = useRef(new Map<number, Pending>());
	const nextId = useRef(0);

	const send = (request: WorkerRequest) => worker.current?.postMessage(request);

	const load = useCallback((model: ChessModel, device: DeviceInfo) => {
		// A fresh worker per model, so the last one's memory is let go.
		worker.current?.terminate();
		for (const { reject } of pending.current.values()) reject(new Error('stopped'));
		pending.current.clear();
		const next = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
		worker.current = next;
		let stage: LoadStage | 'starting' = 'starting';
		let progress = 0;
		setState({ status: 'loading', model, stage, progress });

		next.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			switch (message.type) {
				case 'stage':
					stage = message.stage;
					setState({ status: 'loading', model, stage, progress });
					break;
				case 'progress':
					progress = message.progress;
					setState({ status: 'loading', model, stage, progress });
					break;
				case 'ready':
					setState({ status: 'ready', model });
					break;
				case 'load-error':
					setState({ status: 'error', model, message: message.message });
					break;
				case 'stream':
					pending.current.get(message.id)?.onStream(message);
					break;
				case 'done':
					pending.current.get(message.id)?.resolve(message);
					pending.current.delete(message.id);
					break;
				case 'error':
					pending.current.get(message.id)?.reject(new Error(message.message));
					pending.current.delete(message.id);
					break;
			}
		};
		next.postMessage({
			type: 'load',
			repo: model.repo,
			dtype: dtypeFor(model, device) ?? 'q4f16',
			device: device.webgpu ? 'webgpu' : 'wasm',
			externalData: model.externalData
		} satisfies WorkerRequest);
	}, []);

	// Resolves with the whole reply; `onStream` sees it grow.
	const ask = useCallback(
		(input: PromptInput, onStream: (reply: Reply) => void) =>
			new Promise<Reply>((resolve, reject) => {
				const id = nextId.current++;
				pending.current.set(id, { resolve, reject, onStream });
				send({ type: 'move', id, input });
			}),
		[]
	);

	// Drops any turn in progress; its promise never settles.
	const stop = useCallback(() => {
		pending.current.clear();
		send({ type: 'stop' });
	}, []);

	useEffect(() => () => worker.current?.terminate(), []);

	return { state, load, ask, stop };
}
