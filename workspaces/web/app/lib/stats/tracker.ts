import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { SIGNED_IN_COOKIE } from '~/lib/admin/config';
import type { Beacon, ViewBeacon } from './beacon';

// Visit tracking for /admin/stats, on every public page. Each page view is
// reported once when it opens, then again with how long it was read and how
// far down whenever the reader leaves or switches away. No cookies: a random
// id in localStorage tells a returning browser from a new one, and a browser
// that asks not to be tracked (Global Privacy Control or Do Not Track) is
// counted without it. Rafe's own visits, and the admin, are not counted.

const VISITOR_KEY = 'rafe-visitor';
const SESSION_KEY = 'rafe-session';
// a visit ends after half an hour away
const SESSION_GAP_MS = 30 * 60 * 1000;
// reading stops counting after this long without a scroll, key or touch
const IDLE_MS = 30 * 1000;

type Session = { id: string; last: number };

function send(beacon: Beacon) {
	const body = JSON.stringify(beacon);
	// sendBeacon survives the page closing; text/plain needs no preflight
	if (!navigator.sendBeacon?.('/seen', body)) {
		fetch('/seen', { method: 'POST', body, keepalive: true }).catch(() => undefined);
	}
}

// localStorage, or null where it is blocked or the browser opted out
function storage() {
	if (optedOut()) return null;
	try {
		const store = window.localStorage;
		store.setItem(SESSION_KEY + '-check', '1');
		store.removeItem(SESSION_KEY + '-check');
		return store;
	} catch {
		return null;
	}
}

function optedOut() {
	const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
	return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

function skip(path: string) {
	return (
		path.startsWith('/admin') ||
		document.cookie.split('; ').includes(`${SIGNED_IN_COOKIE}=1`) ||
		navigator.webdriver
	);
}

// Without storage the visit lives as long as the tab's page does.
let memorySession: Session | undefined;

function saveSession(session: Session) {
	memorySession = session;
	try {
		storage()?.setItem(SESSION_KEY, JSON.stringify(session));
	} catch {
		// full or blocked: the visit is kept in memory
	}
}

// Who is visiting, and whether this page view starts a new visit. A browser
// without the id (opted out, storage blocked) is never new or returning.
function identify(now: number, arrived: boolean) {
	const store = storage();
	let visitor: string | null = null;
	let newVisitor = false;
	let session = memorySession;
	if (store) {
		visitor = store.getItem(VISITOR_KEY);
		if (!visitor) {
			visitor = crypto.randomUUID();
			newVisitor = true;
			store.setItem(VISITOR_KEY, visitor);
		}
		try {
			session = JSON.parse(store.getItem(SESSION_KEY) ?? 'null') ?? undefined;
		} catch {
			session = undefined;
		}
	}
	// arriving from another site starts a new visit, so where it came from
	// is always on the visit's first page
	const landing = !session || now - session.last > SESSION_GAP_MS || arrived;
	const id = !session || landing ? crypto.randomUUID() : session.id;
	saveSession({ id, last: now });
	return { visitor, session: id, landing, newVisitor };
}

// The page that sent the visitor here, when it is on another site.
function externalReferrer() {
	try {
		return document.referrer && new URL(document.referrer).host !== location.host
			? document.referrer
			: null;
	} catch {
		return null;
	}
}

function loadMs() {
	const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
	return nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : null;
}

function scrollDepth() {
	const doc = document.documentElement;
	const height = doc.scrollHeight;
	if (height <= window.innerHeight) return 100;
	return Math.min(100, Math.round(((window.scrollY + window.innerHeight) / height) * 100));
}

// One page view: reading time and scroll depth, reported until the next one.
function track(path: string, first: boolean) {
	const now = Date.now();
	const referrer = first ? externalReferrer() : null;
	const who = identify(now, referrer !== null);
	const params = new URLSearchParams(location.search);
	const view: ViewBeacon = {
		type: 'view',
		id: crypto.randomUUID(),
		...who,
		path,
		// the page that sent them, only on arrival; later pages are this site
		referrer,
		utm: {
			source: params.get('utm_source') ?? params.get('ref'),
			medium: params.get('utm_medium'),
			campaign: params.get('utm_campaign')
		},
		screen: `${screen.width}x${screen.height}`,
		viewport: `${window.innerWidth}x${window.innerHeight}`,
		pixelRatio: window.devicePixelRatio,
		language: navigator.language,
		dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
		touch: navigator.maxTouchPoints > 0,
		loadMs: first ? loadMs() : null
	};
	send(view);

	let engaged = 0;
	let since: number | null = document.visibilityState === 'visible' ? now : null;
	let lastActive = now;
	let scroll = scrollDepth();
	let reported = { engaged: 0, scroll: 0 };

	const pause = () => {
		if (since !== null) engaged += Math.min(Date.now(), lastActive + IDLE_MS) - since;
		since = null;
	};
	const active = () => {
		const at = Date.now();
		if (since !== null && at - lastActive > IDLE_MS) pause();
		if (since === null && document.visibilityState === 'visible') since = at;
		lastActive = at;
	};
	const onScroll = () => {
		scroll = Math.max(scroll, scrollDepth());
		active();
	};
	const report = () => {
		pause();
		// the page may not have finished loading when the view was reported
		const load = first && view.loadMs === null ? loadMs() : null;
		if (engaged !== reported.engaged || scroll !== reported.scroll || load !== null) {
			reported = { engaged, scroll };
			if (load !== null) view.loadMs = load;
			send({ type: 'update', id: view.id, engagedMs: engaged, scroll, loadMs: load });
			if (memorySession) saveSession({ ...memorySession, last: Date.now() });
		}
	};
	const onVisibility = () => {
		if (document.visibilityState === 'hidden') report();
		else active();
	};
	// links off the site, as they are followed
	const onClick = (event: MouseEvent) => {
		const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
		if (!link || link.origin === location.origin || !/^https?:$/.test(link.protocol)) return;
		send({ type: 'click', id: view.id, href: link.href });
	};

	const activity = ['pointerdown', 'keydown', 'touchstart', 'mousemove'] as const;
	activity.forEach((type) => window.addEventListener(type, active, { passive: true }));
	window.addEventListener('scroll', onScroll, { passive: true });
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('pagehide', report);
	document.addEventListener('click', onClick, { capture: true });
	// the page may still be laying out, so the first depth is checked again
	const settle = window.setTimeout(onScroll, 1000);

	return () => {
		report();
		window.clearTimeout(settle);
		activity.forEach((type) => window.removeEventListener(type, active));
		window.removeEventListener('scroll', onScroll);
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('pagehide', report);
		document.removeEventListener('click', onClick, { capture: true });
	};
}

let tracked = false;
export function useVisitTracking() {
	const path = useRouterState({ select: (state) => state.location.pathname });
	useEffect(() => {
		if (skip(path)) return;
		const first = !tracked;
		tracked = true;
		return track(path, first);
	}, [path]);
}
