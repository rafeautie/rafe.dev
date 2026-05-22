import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
	resolve: {
		alias: {
			'@tanstack/react-start/server-entry': path.resolve(
				'./src/__mocks__/tanstack-start-entry.ts',
			),
		},
	},
});
