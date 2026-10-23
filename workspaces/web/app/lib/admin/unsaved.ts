// Edits not yet published, kept in this browser so closing the tab loses
// nothing. Each is tied to the version it was made on: if the file has moved
// on since (edited elsewhere), the old edits are not offered back.
const PREFIX = 'rafe-admin:';

export type Unsaved<T> = { sha: string | null; value: T };

export function readUnsaved<T>(key: string): Unsaved<T> | null {
	try {
		const text = localStorage.getItem(PREFIX + key);
		return text ? (JSON.parse(text) as Unsaved<T>) : null;
	} catch {
		return null;
	}
}

export function writeUnsaved<T>(key: string, unsaved: Unsaved<T>) {
	try {
		localStorage.setItem(PREFIX + key, JSON.stringify(unsaved));
	} catch {
		// storage full or blocked: the edits still live in the page
	}
}

export function clearUnsaved(key: string) {
	try {
		localStorage.removeItem(PREFIX + key);
	} catch {
		// nothing to clear
	}
}
