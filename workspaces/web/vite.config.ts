import { defineConfig, type Plugin } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { imagetools } from 'vite-imagetools';
import { markdown } from './plugins/markdown';

// Vite emits every worker it has built into each environment's output, so the
// server build would carry the chess worker and its model runtime
// (lib/chess/ai.worker.ts) as Worker modules. Only the browser runs them.
const workersClientOnly: Plugin = {
	name: 'workers-client-only',
	applyToEnvironment: (environment) => environment.name === 'ssr',
	generateBundle: {
		order: 'post',
		handler(_, bundle) {
			for (const file of Object.keys(bundle)) {
				if (/^assets\/(ai\.worker-|ort-wasm)/.test(file)) delete bundle[file];
			}
		}
	}
};

// Transformers.js 4 (lib/chess/ai.worker.ts) loads its WebAssembly runtime
// from the jsDelivr CDN, but onnxruntime-web still names a local copy as a
// fallback, so Vite emits it: 27 MB, over Cloudflare's 25 MiB limit for a
// single asset. The fallback is never used, so the copy is dropped.
const chessRuntimeFromCdn: Plugin = {
	name: 'chess-runtime-from-cdn',
	applyToEnvironment: (environment) => environment.name === 'client',
	generateBundle: {
		order: 'post',
		handler(_, bundle) {
			for (const file of Object.keys(bundle)) {
				if (/^assets\/ort-wasm-simd-threaded\.asyncify-.*\.wasm$/.test(file)) delete bundle[file];
			}
		}
	}
};

export default defineConfig({
	resolve: {
		tsconfigPaths: true
	},
	// lib/chess/ai.worker.ts is a module worker, and its model runtime splits
	// into chunks
	worker: {
		format: 'es'
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		tailwindcss(),
		imagetools(),
		markdown(),
		workersClientOnly,
		chessRuntimeFromCdn,
		tanstackStart({
			srcDirectory: 'app',
			router: {
				routesDirectory: 'routes'
			}
		}),
		viteReact()
	]
});
