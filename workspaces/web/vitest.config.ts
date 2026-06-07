import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
	resolve: {
		alias: {
			'~/': path.resolve('./app') + '/',
			'@tanstack/react-start/server-entry': path.resolve(
				'./worker/__mocks__/tanstack-start-entry.ts',
			),
		},
	},
});
