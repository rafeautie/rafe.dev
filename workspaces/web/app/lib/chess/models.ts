// The opponents on /chess: small language models from Hugging Face that run in
// the player's browser with Transformers.js (lib/chess/ai.worker.ts). The
// newest small model from each maker that has a browser-ready ONNX build, from
// lightest to heaviest. Download sizes are the text-only 4-bit files as listed
// on each repo (October 2026); the vision and audio parts are never fetched.

export type Tier = 'light' | 'medium' | 'heavy' | 'large';

// How a model thinks before it moves. 'native' models have a thinking mode
// their chat template switches on; 'prompted' ones are asked to reason inside
// <think> tags, which looks the same on screen.
export type Thinking = 'native' | 'prompted';

export type ChessModel = {
	id: string;
	name: string;
	maker: string;
	repo: string;
	tier: Tier;
	thinking: Thinking;
	// download in GB with 16-bit math on the graphics card (q4f16), and without
	// it (q4). Phi-4 mini's web build only comes as q4f16.
	size: { q4f16: number; q4?: number };
	// The weights sit in a separate .onnx_data file that the repo's own
	// config forgets to mention, so the loader has to be told to fetch it.
	externalData?: boolean;
};

export const MODELS: ChessModel[] = [
	{
		id: 'qwen3.5-0.8b',
		name: 'Qwen3.5 0.8B',
		maker: 'Alibaba',
		repo: 'onnx-community/Qwen3.5-0.8B-ONNX',
		tier: 'light',
		thinking: 'native',
		size: { q4f16: 0.58, q4: 0.65 }
	},
	{
		id: 'lfm2.5-1.2b',
		name: 'LFM2.5 1.2B',
		maker: 'Liquid AI',
		repo: 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX',
		tier: 'light',
		thinking: 'prompted',
		size: { q4f16: 0.76, q4: 0.85 }
	},
	{
		id: 'llama3.2-1b',
		name: 'Llama 3.2 1B',
		maker: 'Meta',
		repo: 'onnx-community/Llama-3.2-1B-Instruct',
		tier: 'medium',
		thinking: 'prompted',
		size: { q4f16: 1.09, q4: 1.69 }
	},
	{
		id: 'qwen3.5-2b',
		name: 'Qwen3.5 2B',
		maker: 'Alibaba',
		repo: 'onnx-community/Qwen3.5-2B-ONNX',
		tier: 'medium',
		thinking: 'native',
		size: { q4f16: 1.38, q4: 1.54 }
	},
	{
		id: 'smollm3-3b',
		name: 'SmolLM3 3B',
		maker: 'Hugging Face',
		repo: 'HuggingFaceTB/SmolLM3-3B-ONNX',
		tier: 'heavy',
		thinking: 'native',
		size: { q4f16: 2.12, q4: 2.84 }
	},
	{
		id: 'llama3.2-3b',
		name: 'Llama 3.2 3B',
		maker: 'Meta',
		repo: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
		tier: 'heavy',
		thinking: 'prompted',
		size: { q4f16: 2.63, q4: 2.63 },
		externalData: true
	},
	{
		id: 'qwen3.5-4b',
		name: 'Qwen3.5 4B',
		maker: 'Alibaba',
		repo: 'onnx-community/Qwen3.5-4B-ONNX',
		tier: 'heavy',
		thinking: 'native',
		size: { q4f16: 2.81, q4: 3.1 }
	},
	{
		id: 'gemma4-e2b',
		name: 'Gemma 4 E2B',
		maker: 'Google',
		repo: 'onnx-community/gemma-4-E2B-it-ONNX',
		tier: 'heavy',
		thinking: 'prompted',
		size: { q4f16: 3.11, q4: 3.62 }
	},
	{
		id: 'phi4-mini',
		name: 'Phi-4 mini',
		maker: 'Microsoft',
		repo: 'onnx-community/Phi-4-mini-instruct-web-q4f16',
		tier: 'heavy',
		thinking: 'prompted',
		size: { q4f16: 3.41 }
	},
	{
		id: 'gemma4-e4b',
		name: 'Gemma 4 E4B',
		maker: 'Google',
		repo: 'onnx-community/gemma-4-E4B-it-ONNX',
		tier: 'large',
		thinking: 'prompted',
		size: { q4f16: 4.9, q4: 5.6 }
	}
];

export function findModel(id: string | undefined): ChessModel | undefined {
	return MODELS.find((model) => model.id === id);
}

// What the browser says about the machine, read without downloading anything.
export type DeviceInfo = {
	webgpu: boolean;
	// 16-bit math on the graphics card (the shader-f16 feature)
	f16: boolean;
	// the largest single block of graphics memory the browser hands out, in GB
	maxBuffer: number;
	// device memory in GB: Chrome and Edge only, and capped at 8
	memory?: number;
};

export const NO_GPU: DeviceInfo = { webgpu: false, f16: false, maxBuffer: 0 };

type GPUAdapterLike = {
	features: { has(name: string): boolean };
	limits: { maxBufferSize: number; maxStorageBufferBindingSize: number };
};
type NavigatorGPU = Navigator & {
	gpu?: { requestAdapter(): Promise<GPUAdapterLike | null> };
	deviceMemory?: number;
};

export async function readDevice(): Promise<DeviceInfo> {
	const nav = navigator as NavigatorGPU;
	const memory = nav.deviceMemory;
	const adapter = await nav.gpu?.requestAdapter().catch(() => null);
	if (!adapter) return { ...NO_GPU, memory };
	const { maxBufferSize, maxStorageBufferBindingSize } = adapter.limits;
	return {
		webgpu: true,
		f16: adapter.features.has('shader-f16'),
		maxBuffer: Math.min(maxBufferSize, maxStorageBufferBindingSize) / 2 ** 30,
		memory
	};
}

export type Fit = 'good' | 'slow' | 'too-large';

export const FIT_LABELS: Record<Fit, string> = {
	good: 'Runs well',
	slow: 'May be slow',
	'too-large': 'Too large for this device'
};

// An estimate, not a promise: the browser only hints at what the machine has,
// so a model marked too large can still be picked from "show all".
export function fitFor(model: ChessModel, device: DeviceInfo): Fit {
	// Without WebGPU everything runs on the processor, where only the lightest
	// models keep a game moving.
	if (!device.webgpu) return model.tier === 'light' ? 'slow' : 'too-large';
	if (!dtypeFor(model, device)) return 'too-large';
	// unknown outside Chrome and Edge; there, judge by the graphics card alone
	const memory = device.memory ?? 8;
	switch (model.tier) {
		case 'light':
			return 'good';
		case 'medium':
			return memory >= 4 ? 'good' : 'slow';
		case 'heavy':
			if (memory < 4) return 'too-large';
			return memory >= 8 && device.f16 && device.maxBuffer >= 1 ? 'good' : 'slow';
		case 'large':
			if (memory < 8) return 'too-large';
			return device.f16 && device.maxBuffer >= 2 ? 'good' : 'slow';
	}
}

export type Dtype = 'q4f16' | 'q4';

export function dtypeFor(model: ChessModel, device: DeviceInfo): Dtype | undefined {
	if (device.webgpu && device.f16) return 'q4f16';
	return model.size.q4 ? 'q4' : undefined;
}

export function downloadSize(model: ChessModel, device: DeviceInfo): number {
	const dtype = dtypeFor(model, device) ?? 'q4f16';
	return model.size[dtype] ?? model.size.q4f16;
}

// The model picked when nothing was picked before: the largest that runs well,
// short of the Large tier, which nobody should download without choosing it.
export function defaultModel(device: DeviceInfo): ChessModel {
	const good = MODELS.filter((model) => model.tier !== 'large' && fitFor(model, device) === 'good');
	return good.at(-1) ?? MODELS[0];
}

// Models the browser already holds, which start without a download.
// Transformers.js keeps its files in this Cache Storage bucket.
export async function findCached(): Promise<Set<string>> {
	try {
		const cache = await caches.open('transformers-cache');
		const urls = (await cache.keys()).map((request) => request.url);
		return new Set(
			MODELS.filter((model) =>
				urls.some((url) => url.includes(`/${model.repo}/`) && url.includes('/onnx/'))
			).map((model) => model.id)
		);
	} catch {
		return new Set();
	}
}
