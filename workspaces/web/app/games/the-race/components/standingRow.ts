import { cn } from '~/lib/utils';

/**
 * The shared ring/background highlight for a ranked row: champion ▸ you ▸ default.
 * Used by the Championship standings and the Race classification so the "you"
 * and "champion" tints stay identical across every results table.
 */
export function standingRowClass(isChampion: boolean, isMine: boolean): string {
	return cn(
		'ring-1 ring-inset',
		isChampion
			? 'bg-the-race-accent/10 ring-the-race-accent/40'
			: isMine
				? 'bg-white/5 ring-white/20'
				: 'ring-white/10'
	);
}
