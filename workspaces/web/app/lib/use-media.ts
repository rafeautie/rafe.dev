import { useSyncExternalStore } from 'react';

// false during SSR and hydration, then the live match
export function useMedia(query: string): boolean {
	return useSyncExternalStore(
		(listener) => {
			const list = window.matchMedia(query);
			list.addEventListener('change', listener);
			return () => list.removeEventListener('change', listener);
		},
		() => window.matchMedia(query).matches,
		() => false
	);
}
