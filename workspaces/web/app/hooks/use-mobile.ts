import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// Whether the window is phone-sized, for shadcn's Sidebar. The server has no
// window, so it renders the wide layout and the browser switches once hydrated.
function subscribe(onChange: () => void) {
	const query = window.matchMedia(QUERY);
	query.addEventListener('change', onChange);
	return () => query.removeEventListener('change', onChange);
}

export function useIsMobile() {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(QUERY).matches,
		() => false
	);
}
