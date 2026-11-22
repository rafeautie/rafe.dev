import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		projects: [
			// App code runs in workerd, as it does in production.
			{
				plugins: [
					cloudflareTest({
						// The Worker's real entry is the whole site, which only
						// builds through Vite. The tests need just the Durable
						// Object it exports.
						main: './app/lib/race/room.server.ts',
						wrangler: { configPath: './wrangler.jsonc' }
					})
				],
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
