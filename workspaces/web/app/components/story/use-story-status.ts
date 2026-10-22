import { useEffect, useState, useSyncExternalStore } from 'react';
import type { StoryStatus } from '~/story/server/nudge';

// The pending page's view of the daily job and the nudges, from
// /api/story/status. Polled every 20 seconds while the tab is showing, so the
// countdown turns into "being written" and then "here" on its own.
export function useStoryStatus() {
	const [status, setStatus] = useState<StoryStatus | null>(null);

	useEffect(() => {
		let live = true;
		const load = async () => {
			if (document.visibilityState !== 'visible') return;
			try {
				const response = await fetch('/api/story/status', { cache: 'no-store' });
				const next = response.ok ? ((await response.json()) as StoryStatus) : null;
				if (live && next) setStatus(next);
			} catch {
				// offline for a moment; the next poll tries again
			}
		};
		load();
		const timer = setInterval(load, 20_000);
		document.addEventListener('visibilitychange', load);
		return () => {
			live = false;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', load);
		};
	}, []);

	return { status, setStatus };
}

// One clock for the page, ticking each second while anything reads it.
let now: Date | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (!timer) {
		now = new Date();
		timer = setInterval(() => {
			now = new Date();
			listeners.forEach((notify) => notify());
		}, 1000);
	}
	return () => {
		listeners.delete(listener);
		if (!listeners.size) {
			clearInterval(timer);
			timer = undefined;
		}
	};
}

// The time now; null on the server and while hydrating, so the two renders
// agree.
export function useNow() {
	return useSyncExternalStore(
		subscribe,
		() => now,
		() => null
	);
}
