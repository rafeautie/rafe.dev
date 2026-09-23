import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
	resolve: {
		tsconfigPaths: true
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		tailwindcss(),
		imagetools(),
		tanstackStart({
			srcDirectory: 'app',
			router: {
				routesDirectory: 'routes'
			}
		}),
		viteReact()
	]
});
