import type { Color } from 'chess.js';

// What /chess remembers between visits: the player's settings, and the game in
// progress so a refresh doesn't lose it. Storage can be blocked, in which case
// both last for the page view only.

export type Settings = {
	model?: string;
	// whether the model thinks before it moves
	think: boolean;
	// whether the player gets to watch it think (off: a guarded opponent)
	showThinking: boolean;
};

// One per move of the game, the player's and the model's alike
export type Entry = {
	san: string;
	by: 'you' | 'ai';
	thinking?: string;
	seconds?: number;
	// the model's answers weren't legal, so a random legal move was played
	random?: boolean;
	// what it answered instead, when it missed
	missed?: string[];
};

// The player is always white and the model always black.
export type SavedGame = {
	pgn: string;
	model: string;
	entries: Entry[];
	// set once the game has ended
	result?: string;
};

const SETTINGS_KEY = 'chess-settings';
const GAME_KEY = 'chess-game';

export const DEFAULT_SETTINGS: Settings = { think: true, showThinking: true };

function read<T>(key: string): Partial<T> | undefined {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? 'null');
		return value && typeof value === 'object' ? value : undefined;
	} catch {
		return undefined;
	}
}

function write(key: string, value: unknown) {
	try {
		if (value === undefined) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// kept for this page view only
	}
}

export function loadSettings(): Settings {
	const saved = read<Settings>(SETTINGS_KEY) ?? {};
	return {
		model: typeof saved.model === 'string' ? saved.model : undefined,
		think: saved.think !== false,
		showThinking: saved.showThinking !== false
	};
}

export function saveSettings(settings: Settings) {
	write(SETTINGS_KEY, settings);
}

export function loadGame(): SavedGame | undefined {
	// `you` is from when the player could choose a side; a game played as black
	// can't carry on now
	const saved = read<SavedGame & { you?: Color }>(GAME_KEY);
	if (
		!saved ||
		typeof saved.pgn !== 'string' ||
		saved.you === 'b' ||
		typeof saved.model !== 'string' ||
		!Array.isArray(saved.entries)
	) {
		return undefined;
	}
	const { pgn, model, entries, result } = saved;
	return { pgn, model, entries, result };
}

export function saveGame(game: SavedGame | undefined) {
	write(GAME_KEY, game);
}
