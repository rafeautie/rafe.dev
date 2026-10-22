import type { Theme } from '.';

// Nudges are grouped in batches, then the batches' themes are merged. The
// counting is done here rather than by the model, so a count is always the
// number of nudges actually behind a theme.

export const BATCH = 500;
export const MAX_THEMES = 8;

// A batch's grouping: each theme lists the numbers of the nudges in it.
export type Grouping = { label: string; nudges: number[] }[];

// Counts a batch of `size` nudges. A nudge is counted once, in the first
// theme that claims it; numbers outside the batch are dropped.
export function countGrouping(grouping: Grouping, size: number): Theme[] {
	const seen = new Set<number>();
	return grouping
		.map(({ label, nudges }) => {
			const mine = [...new Set(nudges)].filter(
				(n) => Number.isInteger(n) && n >= 1 && n <= size && !seen.has(n)
			);
			mine.forEach((n) => seen.add(n));
			return { label: label.trim(), count: mine.length };
		})
		.filter((theme) => theme.label && theme.count > 0);
}

// Folds themes together: each merged theme lists the indexes (from 0) of the
// themes it takes in. A theme is folded once; one left out keeps its own
// label. The biggest MAX_THEMES are kept.
export function mergeThemes(themes: Theme[], merged: { label: string; from: number[] }[]): Theme[] {
	const taken = new Set<number>();
	const result: Theme[] = [];
	for (const { label, from } of merged) {
		const mine = [...new Set(from)].filter(
			(i) => Number.isInteger(i) && themes[i] && !taken.has(i)
		);
		mine.forEach((i) => taken.add(i));
		const count = mine.reduce((total, i) => total + themes[i].count, 0);
		if (label.trim() && count > 0) result.push({ label: label.trim(), count });
	}
	themes.forEach((theme, i) => taken.has(i) || result.push(theme));
	return topThemes(result);
}

export function topThemes(themes: Theme[]): Theme[] {
	return [...themes].sort((a, b) => b.count - a.count).slice(0, MAX_THEMES);
}
