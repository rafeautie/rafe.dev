import type { PhotoEntry } from './api';

// What publishing would do to the gallery: the page's list against the one on
// GitHub now. It is what the photos page sums up beside the publish button, so
// Rafe can see a stray drag or a forgotten edit before it goes live.

export type PhotoChanges = {
	added: number;
	removed: number;
	edited: number;
	moved: number;
	// files whose alt, caption, location or date differ from GitHub's
	editedFiles: Set<string>;
};

const FIELDS = ['alt', 'caption', 'location', 'date'] as const;

export function photoChanges(published: PhotoEntry[], current: PhotoEntry[]): PhotoChanges {
	const before = new Map(published.map((photo) => [photo.file, photo]));
	const now = new Set(current.map((photo) => photo.file));
	const kept = current.filter((photo) => before.has(photo.file));
	const editedFiles = new Set(
		kept
			.filter((photo) => FIELDS.some((field) => photo[field] !== before.get(photo.file)![field]))
			.map((photo) => photo.file)
	);
	return {
		added: current.length - kept.length,
		removed: published.filter((photo) => !now.has(photo.file)).length,
		edited: editedFiles.size,
		moved: moved(
			published.map((photo) => photo.file),
			kept.map((photo) => photo.file)
		),
		editedFiles
	};
}

// How many photos were picked up and put down elsewhere: those outside the
// longest run that kept its order. Dragging one photo across five others
// moves one photo, not six.
function moved(before: string[], after: string[]) {
	const index = new Map(before.map((file, position) => [file, position]));
	const order = after.map((file) => index.get(file)!);
	// longest increasing subsequence, by patience sorting
	const tails: number[] = [];
	for (const value of order) {
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (tails[middle] < value) low = middle + 1;
			else high = middle;
		}
		tails[low] = value;
	}
	return order.length - tails.length;
}

// "2 added · 1 moved", or '' when nothing would change.
export function describeChanges(changes: PhotoChanges) {
	return (
		[
			['added', changes.added],
			['removed', changes.removed],
			['moved', changes.moved],
			['edited', changes.edited]
		] as const
	)
		.filter(([, count]) => count > 0)
		.map(([label, count]) => `${count} ${label}`)
		.join(' · ');
}
