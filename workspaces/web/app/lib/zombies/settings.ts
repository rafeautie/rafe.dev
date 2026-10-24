// The player's own settings, kept in this browser between games. The game
// reads them every frame, so a change shows straight away.

export type Settings = {
	// 0 to 100
	volume: number;
	// times the usual mouse speed
	sensitivity: number;
	// mouse speed while aiming down sights, as a share of the usual
	aimSensitivity: number;
	// vertical, in degrees
	fov: number;
	invertY: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
	volume: 70,
	sensitivity: 1,
	aimSensitivity: 0.6,
	fov: 75,
	invertY: false
};

// what each slider allows
export const RANGES = {
	volume: { min: 0, max: 100, step: 1 },
	sensitivity: { min: 0.1, max: 3, step: 0.05 },
	aimSensitivity: { min: 0.2, max: 1.5, step: 0.05 },
	fov: { min: 60, max: 100, step: 1 }
} satisfies Record<string, { min: number; max: number; step: number }>;

const KEY = 'zombies-settings';

function load(): Settings {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return clean(typeof saved === 'object' && saved !== null ? saved : {});
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

// keeps only what makes sense, so an old or hand-edited save can't break the game
function clean(raw: Partial<Record<keyof Settings, unknown>>): Settings {
	const out = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
		const value = raw[key];
		const { min, max } = RANGES[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			out[key] = Math.min(max, Math.max(min, value));
		}
	}
	if (typeof raw.invertY === 'boolean') out.invertY = raw.invertY;
	return out;
}

let current: Settings = typeof window === 'undefined' ? { ...DEFAULT_SETTINGS } : load();
const listeners = new Set<() => void>();

export const settings = {
	get: () => current,
	set(patch: Partial<Settings>) {
		current = clean({ ...current, ...patch });
		try {
			localStorage.setItem(KEY, JSON.stringify(current));
		} catch {
			// kept for this visit only
		}
		for (const l of listeners) l();
	},
	reset() {
		settings.set(DEFAULT_SETTINGS);
	},
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}
};
