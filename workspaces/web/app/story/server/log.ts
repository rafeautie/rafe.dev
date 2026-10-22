// The daily job runs with no one watching, so its steps and token use are
// logged for Workers Logs (observability in wrangler.jsonc).
export function log(...parts: unknown[]) {
	// eslint-disable-next-line no-console
	console.log('story:', ...parts);
}
