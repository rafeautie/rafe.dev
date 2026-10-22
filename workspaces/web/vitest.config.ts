import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import path from 'path';
import { markdown } from './plugins/markdown';

export default defineConfig({
	test: {
		projects: [
			// App code runs in workerd, as it does in production. Markdown is
			// compiled as in the build, for the story's chapters.
			{
				plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } }), markdown()],
				resolve: {
					alias: {
						'~/': path.resolve('./app') + '/'
					}
				},
				test: { name: 'worker', include: ['app/**/*.test.ts'] }
			},
			// Tooling tests read the repo from disk and run sharp, neither of which
			// workerd can do.
			{
				test: { name: 'node', include: ['scripts/**/*.test.mjs'], environment: 'node' }
			}
		]
	}
});
