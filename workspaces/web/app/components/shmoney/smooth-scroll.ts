import Lenis from 'lenis';
import { useEffect, useSyncExternalStore } from 'react';

// Inertial wheel scrolling for the page. Visitors who ask for reduced motion
// keep native scrolling. Touch scrolling stays native either way.

let current: Lenis | null = null;
const listeners = new Set<() => void>();

function set(next: Lenis | null): void {
	current = next;
	listeners.forEach((listener) => listener());
}

export function useLenis(): Lenis | null {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
		() => null
	);
}

export function SmoothScroll() {
	useEffect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const lenis = new Lenis({ autoRaf: true, lerp: 0.08 });
		set(lenis);
		return () => {
			lenis.destroy();
			set(null);
		};
	}, []);
	return null;
}

// a long, soft landing for programmatic scrolls
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);
