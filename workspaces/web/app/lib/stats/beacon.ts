// What the browser sends to /seen (lib/stats/tracker.ts), and the checks the
// server makes on it. Anyone can send anything there, so every field is
// checked and cut to size, and anything unexpected is dropped.

export type ViewBeacon = {
	type: 'view';
	id: string;
	visitor: string | null;
	session: string;
	landing: boolean;
	newVisitor: boolean;
	path: string;
	referrer: string | null;
	utm: { source: string | null; medium: string | null; campaign: string | null };
	screen: string | null;
	viewport: string | null;
	pixelRatio: number | null;
	language: string | null;
	dark: boolean | null;
	touch: boolean;
	loadMs: number | null;
};

export type UpdateBeacon = {
	type: 'update';
	id: string;
	engagedMs: number;
	scroll: number;
	loadMs: number | null;
};

export type ClickBeacon = { type: 'click'; id: string; href: string };

export type Beacon = ViewBeacon | UpdateBeacon | ClickBeacon;

const ID = /^[0-9a-f-]{36}$/;
const SIZE = /^\d{1,5}x\d{1,5}$/;
// six hours: a tab left open and read on and off
const MAX_ENGAGED_MS = 6 * 60 * 60 * 1000;

function text(value: unknown, max: number) {
	return typeof value === 'string' && value ? value.slice(0, max) : null;
}

function id(value: unknown) {
	if (typeof value !== 'string' || !ID.test(value)) throw new Error('Bad id');
	return value;
}

function count(value: unknown, max: number) {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.round(Math.min(Math.max(value, 0), max))
		: null;
}

function url(value: unknown) {
	const href = text(value, 1000);
	if (!href) return null;
	try {
		const parsed = new URL(href);
		return /^https?:$/.test(parsed.protocol) ? parsed : null;
	} catch {
		return null;
	}
}

export function readBeacon(input: unknown): Beacon {
	if (!input || typeof input !== 'object') throw new Error('Bad beacon');
	const data = input as Record<string, unknown>;
	if (data.type === 'update') {
		return {
			type: 'update',
			id: id(data.id),
			engagedMs: count(data.engagedMs, MAX_ENGAGED_MS) ?? 0,
			scroll: count(data.scroll, 100) ?? 0,
			loadMs: count(data.loadMs, 60_000)
		};
	}
	if (data.type === 'click') {
		const href = url(data.href);
		if (!href) throw new Error('Bad link');
		return { type: 'click', id: id(data.id), href: href.href };
	}
	if (data.type !== 'view') throw new Error('Bad beacon');
	const path = text(data.path, 300);
	if (!path?.startsWith('/')) throw new Error('Bad path');
	const utm = (data.utm && typeof data.utm === 'object' ? data.utm : {}) as Record<string, unknown>;
	const size = (value: unknown) => {
		const size = text(value, 11);
		return size && SIZE.test(size) ? size : null;
	};
	return {
		type: 'view',
		id: id(data.id),
		visitor: data.visitor === null ? null : id(data.visitor),
		session: id(data.session),
		landing: data.landing === true,
		newVisitor: data.newVisitor === true,
		path,
		referrer: url(data.referrer)?.href ?? null,
		utm: {
			source: text(utm.source, 100),
			medium: text(utm.medium, 100),
			campaign: text(utm.campaign, 100)
		},
		screen: size(data.screen),
		viewport: size(data.viewport),
		pixelRatio:
			typeof data.pixelRatio === 'number' ? Math.min(Math.max(data.pixelRatio, 0), 10) : null,
		language: text(data.language, 35),
		dark: typeof data.dark === 'boolean' ? data.dark : null,
		touch: data.touch === true,
		loadMs: count(data.loadMs, 60_000)
	};
}

// A referrer as a source: its host without www, or null for the site itself.
export function sourceOf(referrer: string | null, site: string) {
	if (!referrer) return null;
	const host = new URL(referrer).hostname.replace(/^www\./, '');
	return host === site.replace(/^www\./, '') ? null : host;
}
