import { useState, useSyncExternalStore } from 'react';

// CSS columns can only pack top-to-bottom, filling one column before starting
// the next, so photo 2 lands under photo 1 rather than beside it. Dealing the
// photos into explicit columns keeps the masonry packing (each column is an
// independent stack, so tiles of different heights still tessellate) while
// making the order read left-to-right across the row.
export const COLUMNS_CLASS = 'flex items-start gap-3';
export const COLUMN_CLASS = 'flex min-w-0 flex-1 flex-col gap-3';
export const PHOTO_ITEM_CLASS = 'block w-full';

// Neutral ratio reserving space until the real pixels arrive.
const PLACEHOLDER_RATIO = '3 / 2';

const GRID_WIDTHS = [640, 1024, 1600];
export const GRID_SIZES = '(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw';

export function srcSetFor(imageKey: string, getUrl: (key: string, width: number) => string) {
	return GRID_WIDTHS.map((width) => `${getUrl(imageKey, width)} ${width}w`).join(', ');
}

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

// Dimensions are measured in the browser rather than served: a same-zone
// Worker gets a 404 from /cdn-cgi/image/format=json.
export function usePhotoRatio() {
	const [ratio, setRatio] = useState<string | null>(null);

	const measure = (img: HTMLImageElement | null) => {
		if (img?.naturalWidth && img.naturalHeight) {
			setRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
		}
	};

	return {
		// The ref covers images that finished loading before hydration, where
		// onLoad never fires.
		ref: (img: HTMLImageElement | null) => {
			if (img?.complete) measure(img);
		},
		onLoad: (event: { currentTarget: HTMLImageElement }) => measure(event.currentTarget),
		style: { aspectRatio: ratio ?? PLACEHOLDER_RATIO }
	};
}
