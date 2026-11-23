// The tests' races for each track (Checks in layout.ts), gathered from the
// track files by name: a track's id is its file's name. Only the tests use it.
import type { Checks } from './layout';

const modules = import.meta.glob<{ checks?: Checks }>('./*.ts', { eager: true });

export const CHECKS: Record<string, Checks> = Object.fromEntries(
	Object.entries(modules)
		.filter(([, module]) => module.checks)
		.map(([path, module]) => [path.slice(2, -3), module.checks!])
);
