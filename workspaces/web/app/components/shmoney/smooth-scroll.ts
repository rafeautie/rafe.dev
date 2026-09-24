import Lenis, { type VirtualScrollData } from 'lenis';
import { useEffect, useSyncExternalStore } from 'react';

// Inertial wheel scrolling for the page. Visitors who ask for reduced motion
// keep native scrolling. Touch scrolling stays native either way.

let current: Lenis | null = null;
const listeners = new Set<() => void>();
let wheel: ((data: VirtualScrollData) => boolean) | null = null;

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
		const lenis = new Lenis({
			autoRaf: true,
			duration: SCROLL_DURATION,
			easing: easeOutQuint,
			virtualScroll: (data) => wheel?.(data) ?? true
		});
		set(lenis);
		return () => {
			lenis.destroy();
			set(null);
		};
	}, []);
	return null;
}

// Lets the page see wheel and touch input before Lenis does; returning false
// keeps Lenis from scrolling for it. Returns a function that lets go.
export function onVirtualScroll(handler: (data: VirtualScrollData) => boolean): () => void {
	wheel = handler;
	return () => {
		if (wheel === handler) wheel = null;
	};
}

// Wheel scrolling, snaps, and jumps to a stop all glide with the same long,
// soft landing; scrollTo calls pick it up as Lenis's defaults.
const SCROLL_DURATION = 1.2;

function easeOutQuint(t: number): number {
	return 1 - Math.pow(1 - t, 5);
}
