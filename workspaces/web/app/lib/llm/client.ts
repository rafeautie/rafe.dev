import { useEffect, useState } from 'react';
import type { LoadStage, MindRequest, MindResponse, ReuseCheck } from './mind.worker';
import { dtypeFor, externalData, type DeviceInfo, type MindModel } from './models';
import type { Ask, MindResult } from './reply';

// The page's side of lib/llm/mind.worker.ts: loads a model, asks it things
// and hands back each answer as a promise.

export type MindState =
	| { status: 'idle' }
	// `starting` until the worker reports what it is doing
	| { status: 'loading'; model: MindModel; stage: LoadStage | 'starting'; progress: number }
	| { status: 'ready'; model: MindModel; reuse: ReuseCheck }
	| { status: 'error'; model: MindModel; message: string };

// A request that was never answered: stopped, or its deadline passed first
export class Dropped extends Error {
	constructor(
		readonly id: number,
		readonly reason: 'stopped' | 'deadline'
	) {
		super(`request ${id} was dropped (${reason})`);
	}
}

type Pending = { resolve: (result: MindResult) => void; reject: (error: Error) => void };

export class Mind {
	private worker?: Worker;
	private pending = new Map<number, Pending>();
	private nextId = 0;
	state: MindState = { status: 'idle' };

	constructor(private onState: (state: MindState) => void = () => {}) {}

	private set(state: MindState) {
		this.state = state;
		this.onState(state);
	}

	load(model: MindModel, device: DeviceInfo) {
		// a fresh worker per model, so the last one's memory is let go
		this.dispose();
		const worker = new Worker(new URL('./mind.worker.ts', import.meta.url), { type: 'module' });
		this.worker = worker;
		let stage: LoadStage | 'starting' = 'starting';
		let progress = 0;
		this.set({ status: 'loading', model, stage, progress });

		worker.onmessage = (event: MessageEvent<MindResponse>) => {
			const message = event.data;
			switch (message.type) {
				case 'stage':
					stage = message.stage;
					this.set({ status: 'loading', model, stage, progress });
					break;
				case 'progress':
					progress = message.progress;
					this.set({ status: 'loading', model, stage, progress });
					break;
				case 'ready':
					this.set({ status: 'ready', model, reuse: message.reuse });
					break;
				case 'load-error':
					this.set({ status: 'error', model, message: message.message });
					break;
				case 'result':
					this.settle(message.result.id)?.resolve(message.result);
					break;
				case 'dropped':
					this.settle(message.id)?.reject(new Dropped(message.id, message.reason));
					break;
				case 'error':
					this.settle(message.id)?.reject(new Error(message.message));
					break;
			}
		};
		const dtype = dtypeFor(device);
		this.send({
			type: 'load',
			repo: model.repo,
			dtype,
			device: device.webgpu ? 'webgpu' : 'wasm',
			files: externalData(model, dtype)
		});
	}

	// Resolves with the answer; rejects with Dropped if it never comes
	ask(request: Omit<Ask, 'id'>): Promise<MindResult> {
		return new Promise((resolve, reject) => {
			if (!this.worker) return reject(new Error('no model is loaded'));
			const id = this.nextId++;
			this.pending.set(id, { resolve, reject });
			this.send({ type: 'ask', request: { ...request, id } });
		});
	}

	// Drops everything waiting and the request in progress
	stop() {
		this.send({ type: 'stop' });
	}

	dispose() {
		this.worker?.terminate();
		this.worker = undefined;
		for (const [id, { reject }] of this.pending) reject(new Dropped(id, 'stopped'));
		this.pending.clear();
	}

	private send(request: MindRequest) {
		this.worker?.postMessage(request);
	}

	private settle(id: number) {
		const pending = this.pending.get(id);
		this.pending.delete(id);
		return pending;
	}
}

// One Mind for a component, its state kept as React state, let go when the
// component goes
export function useMind() {
	const [state, setState] = useState<MindState>({ status: 'idle' });
	const [mind] = useState(() => new Mind(setState));
	useEffect(() => () => mind.dispose(), [mind]);
	return { state, mind };
}
