import { useSyncExternalStore } from 'react';

// CSS columns can only pack top-to-bottom, filling one column before starting
// the next, so photo 2 lands under photo 1 rather than beside it. Dealing the
// photos into explicit columns keeps the masonry packing (each column is an
// independent stack, so tiles of different heights still tessellate) while
// making the order read left-to-right across the row.
export const COLUMNS_CLASS = 'flex items-start gap-3';
export const COLUMN_CLASS = 'flex min-w-0 flex-1 flex-col gap-3';
export const PHOTO_ITEM_CLASS = 'block w-full';

// A column's width: the viewport less the page's p-8 padding and the gap-3
// between columns, split by the column count at each breakpoint.
export const GRID_SIZES =
	'(min-width: 1280px) calc((100vw - 88px) / 3), (min-width: 640px) calc((100vw - 76px) / 2), calc(100vw - 64px)';

// Dealt round-robin rather than sliced into contiguous chunks: reading order
// runs across the columns, so photo N belongs in column N % count.
export function toColumns<T>(items: T[], count: number): T[][] {
	const columns: T[][] = Array.from({ length: count }, () => []);
	items.forEach((item, index) => columns[index % count].push(item));
	return columns;
}

// Mirrors the Tailwind sm and xl breakpoints, widest first.
const COLUMN_BREAKPOINTS = [
	{ query: '(min-width: 1280px)', columns: 3 },
	{ query: '(min-width: 640px)', columns: 2 }
];
const NARROW_COLUMNS = 1;

function subscribeToWidth(onChange: () => void) {
	const lists = COLUMN_BREAKPOINTS.map(({ query }) => window.matchMedia(query));
	lists.forEach((list) => list.addEventListener('change', onChange));
	return () => lists.forEach((list) => list.removeEventListener('change', onChange));
}

// Widest first, so the first match wins.
function currentColumnCount() {
	return (
		COLUMN_BREAKPOINTS.find(({ query }) => window.matchMedia(query).matches)?.columns ??
		NARROW_COLUMNS
	);
}

// Dealing photos into columns needs the count as a number, which CSS alone will
// not hand over. The viewport is an external store rather than React state, so
// it is read through useSyncExternalStore: the server has no viewport and
// renders the single-column case, then the client widens on hydration.
export function useColumnCount() {
	return useSyncExternalStore(subscribeToWidth, currentColumnCount, () => NARROW_COLUMNS);
}
