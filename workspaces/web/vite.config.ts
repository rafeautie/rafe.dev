import { defineConfig, type Plugin } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { imagetools } from 'vite-imagetools';
import { markdown } from './plugins/markdown';

// Vite emits every worker it has built into each environment's output, so the
// server build would carry the read-aloud worker and its 20 MB speech runtime
// (lib/read-aloud.worker.ts) as Worker modules. Only the browser runs them.
const readAloudClientOnly: Plugin = {
	name: 'read-aloud-client-only',
	applyToEnvironment: (environment) => environment.name === 'ssr',
	generateBundle: {
		order: 'post',
		handler(_, bundle) {
			for (const file of Object.keys(bundle)) {
				if (/^assets\/(read-aloud\.worker-|ort-wasm)/.test(file)) delete bundle[file];
			}
		}
	}
};

export default defineConfig({
	resolve: {
		tsconfigPaths: true
	},
	// lib/read-aloud.worker.ts is a module worker, and its model runtime splits
	// into chunks
	worker: {
		format: 'es'
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		tailwindcss(),
		imagetools(),
		markdown(),
		readAloudClientOnly,
		tanstackStart({
			srcDirectory: 'app',
			router: {
				routesDirectory: 'routes'
			}
		}),
		viteReact()
	]
});
