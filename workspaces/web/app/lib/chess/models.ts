// The opponents on /chess: small language models from Hugging Face that run in
// the player's browser with Transformers.js (lib/chess/ai.worker.ts). Google's
// Gemma 4, in its two sizes made for phones and laptops. Download sizes are the text-only 4-bit files as listed
// on each repo (October 2026); the vision and audio parts are never fetched.

export type Tier = 'light' | 'medium' | 'heavy' | 'large';

// A model's files for one precision: each ONNX graph it loads, by name
// without the precision suffix, and how many .onnx_data files hold its
// weights. Every model is listed the same way and loaded from this list, not
// from whatever each repo's own config says about its files. Gemma 4 can also
// see and hear, but these lists only name the parts that read and write text.
export type Weights = Record<string, number>;

export type ChessModel = {
	id: string;
	name: string;
	// the family it's listed under in the picker
	family: string;
	maker: string;
	repo: string;
	tier: Tier;
	// download in GB with 16-bit math on the graphics card (q4f16), and without
	// it (q4)
	size: { q4f16: number; q4: number };
	weights: { q4f16: Weights; q4: Weights };
};

// the layout the repos use: the text model, and its word embeddings apart
const split = (decoder = 1, embed = 1): ChessModel['weights'] => ({
	q4f16: { decoder_model_merged: decoder, embed_tokens: embed },
	q4: { decoder_model_merged: decoder, embed_tokens: embed }
});

export const MODELS: ChessModel[] = [
	{
		id: 'gemma4-e2b',
		name: 'Gemma 4 E2B',
		family: 'Gemma 4',
		maker: 'Google',
		repo: 'onnx-community/gemma-4-E2B-it-ONNX',
		tier: 'heavy',
		size: { q4f16: 3.11, q4: 3.63 },
		weights: split()
	},
	{
		id: 'gemma4-e4b',
		name: 'Gemma 4 E4B',
		family: 'Gemma 4',
		maker: 'Google',
		repo: 'onnx-community/gemma-4-E4B-it-ONNX',
		tier: 'large',
		size: { q4f16: 4.91, q4: 5.62 },
		// its 4-bit embeddings without 16-bit math come in two files
		weights: {
			q4f16: { decoder_model_merged: 2, embed_tokens: 1 },
			q4: { decoder_model_merged: 2, embed_tokens: 2 }
		}
	}
];

// What the loader needs to fetch a model's weights: the data file count for
// each graph, by its full file name
export function externalData(model: ChessModel, dtype: Dtype): Record<string, number> {
	return Object.fromEntries(
		Object.entries(model.weights[dtype]).map(([name, chunks]) => [`${name}_${dtype}.onnx`, chunks])
	);
}

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
	// a phone or tablet, whose browser gives a tab far less memory than the
	// device has: too little to load even the smaller model, whose weights are
	// all held in memory at once while they load
	phone?: boolean;
};

export const NO_GPU: DeviceInfo = { webgpu: false, f16: false, maxBuffer: 0 };

type GPUAdapterLike = {
	features: { has(name: string): boolean };
	limits: { maxBufferSize: number; maxStorageBufferBindingSize: number };
};
type NavigatorGPU = Navigator & {
	gpu?: { requestAdapter(): Promise<GPUAdapterLike | null> };
	deviceMemory?: number;
	userAgentData?: { mobile: boolean };
};

// Chrome says so outright; elsewhere, the user agent. iPads ask for the
// desktop site, so a touch screen on a Mac counts too.
function isPhone(nav: NavigatorGPU): boolean {
	if (nav.userAgentData) return nav.userAgentData.mobile;
	return (
		/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) ||
		(/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
	);
}

export async function readDevice(): Promise<DeviceInfo> {
	const nav = navigator as NavigatorGPU;
	const memory = nav.deviceMemory;
	const phone = isPhone(nav);
	const adapter = await nav.gpu?.requestAdapter().catch(() => null);
	if (!adapter) return { ...NO_GPU, memory, phone };
	const { maxBufferSize, maxStorageBufferBindingSize } = adapter.limits;
	return {
		webgpu: true,
		f16: adapter.features.has('shader-f16'),
		maxBuffer: Math.min(maxBufferSize, maxStorageBufferBindingSize) / 2 ** 30,
		memory,
		phone
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
	if (device.phone) return 'too-large';
	// Without WebGPU everything runs on the processor, where only the lightest
	// models keep a game moving.
	if (!device.webgpu) return model.tier === 'light' ? 'slow' : 'too-large';
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

export function dtypeFor(device: DeviceInfo): Dtype {
	return device.webgpu && device.f16 ? 'q4f16' : 'q4';
}

export function downloadSize(model: ChessModel, device: DeviceInfo): number {
	return model.size[dtypeFor(device)];
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
