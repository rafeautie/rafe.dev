import type { Color } from 'chess.js';

// What /chess remembers between visits: the player's settings, and the game in
// progress so a refresh doesn't lose it. Storage can be blocked, in which case
// both last for the page view only.

export type Side = Color | 'random';

export type Settings = {
	model?: string;
	side: Side;
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

export type SavedGame = {
	pgn: string;
	you: Color;
	model: string;
	entries: Entry[];
	// set once the game has ended
	result?: string;
};

const SETTINGS_KEY = 'chess-settings';
const GAME_KEY = 'chess-game';

export const DEFAULT_SETTINGS: Settings = { side: 'w', think: true, showThinking: true };

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
		side: saved.side === 'b' || saved.side === 'random' ? saved.side : 'w',
		think: saved.think !== false,
		showThinking: saved.showThinking !== false
	};
}

export function saveSettings(settings: Settings) {
	write(SETTINGS_KEY, settings);
}

export function loadGame(): SavedGame | undefined {
	const saved = read<SavedGame>(GAME_KEY);
	if (
		!saved ||
		typeof saved.pgn !== 'string' ||
		(saved.you !== 'w' && saved.you !== 'b') ||
		typeof saved.model !== 'string' ||
		!Array.isArray(saved.entries)
	) {
		return undefined;
	}
	return saved as SavedGame;
}

export function saveGame(game: SavedGame | undefined) {
	write(GAME_KEY, game);
}
