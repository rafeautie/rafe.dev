import { useLayoutEffect, useSyncExternalStore } from 'react';

// Dark mode for /writing only. The reader's choice is kept in localStorage;
// until they make one, the OS setting decides. The theme is the `dark` class
// on <html>, so the page background and the shadcn tokens follow it.
const STORAGE_KEY = 'writing-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// Inlined into <head> so the class is set before the first paint and a dark
// reader never sees the page flash white. Kept in step with wantsDark below.
export const THEME_SCRIPT = `(function(){try{var p=location.pathname;if(p!=='/writing'&&p.indexOf('/writing/')!==0)return;var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'||(t!=='light'&&matchMedia('${DARK_QUERY}').matches))document.documentElement.classList.add('dark')}catch(e){}})()`;

function wantsDark(): boolean {
	let saved: string | null = null;
	try {
		saved = localStorage.getItem(STORAGE_KEY);
	} catch {
		// storage blocked: fall through to the OS setting
	}
	if (saved === 'dark' || saved === 'light') return saved === 'dark';
	return window.matchMedia(DARK_QUERY).matches;
}

function subscribe(listener: () => void) {
	const observer = new MutationObserver(listener);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
	return () => observer.disconnect();
}

// Themes the page while the calling component is mounted, and reports whether
// it is dark. A layout effect, so arriving from another page by client-side
// navigation does not paint a light frame first. Leaving takes the class off,
// so the rest of the site stays light.
export function useWritingTheme(): boolean {
	useLayoutEffect(() => {
		const root = document.documentElement;
		const media = window.matchMedia(DARK_QUERY);
		const sync = () => root.classList.toggle('dark', wantsDark());
		sync();
		media.addEventListener('change', sync);
		// a choice made in another tab
		window.addEventListener('storage', sync);
		return () => {
			media.removeEventListener('change', sync);
			window.removeEventListener('storage', sync);
			root.classList.remove('dark');
		};
	}, []);

	return useSyncExternalStore(
		subscribe,
		() => document.documentElement.classList.contains('dark'),
		() => false
	);
}

export function setWritingTheme(dark: boolean) {
	try {
		localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
	} catch {
		// still switches, just for this page view
	}
	const root = document.documentElement;
	// While .theme-switching is on, nothing runs a transition of its own (bar
	// the toggle's icon), so every color lands at once.
	const apply = () => {
		root.classList.add('theme-switching');
		root.classList.toggle('dark', dark);
	};
	// Two frames on, once the new colors have been styled. Sooner and they
	// would transition after all: a hidden tab skips the view transition and
	// finishes it before anything renders.
	const settle = () =>
		requestAnimationFrame(() =>
			requestAnimationFrame(() => root.classList.remove('theme-switching'))
		);

	// The crossfade is a view transition: the browser fades a picture of the
	// old page into the new one, so every pixel shares one duration whatever
	// its CSS (styles/app.css times it). Without view transitions it switches
	// at once.
	if (!document.startViewTransition || window.matchMedia(REDUCED_MOTION).matches) {
		apply();
		settle();
		return;
	}
	document.startViewTransition(apply).finished.finally(settle);
}
