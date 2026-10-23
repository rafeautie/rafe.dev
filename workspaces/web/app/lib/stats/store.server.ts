import { env } from 'cloudflare:workers';

// The visits database (D1, bound as STATS). One row per page view, filled in
// as the visitor reads, and one per link followed off the site. No IP address
// is ever stored: where someone is comes from Cloudflare's lookup, to the city.

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS views (
		id TEXT PRIMARY KEY,
		at INTEGER NOT NULL,
		seen INTEGER NOT NULL,
		visitor TEXT,
		session TEXT NOT NULL,
		landing INTEGER NOT NULL,
		new_visitor INTEGER NOT NULL,
		path TEXT NOT NULL,
		referrer TEXT,
		referrer_url TEXT,
		utm_source TEXT,
		utm_medium TEXT,
		utm_campaign TEXT,
		country TEXT,
		region TEXT,
		city TEXT,
		timezone TEXT,
		org TEXT,
		browser TEXT,
		browser_version TEXT,
		os TEXT,
		device TEXT,
		screen TEXT,
		viewport TEXT,
		pixel_ratio REAL,
		language TEXT,
		dark INTEGER,
		load_ms INTEGER,
		engaged_ms INTEGER NOT NULL DEFAULT 0,
		scroll INTEGER NOT NULL DEFAULT 0
	)`,
	'CREATE INDEX IF NOT EXISTS views_at ON views (at)',
	'CREATE INDEX IF NOT EXISTS views_session ON views (session)',
	'CREATE INDEX IF NOT EXISTS views_visitor ON views (visitor)',
	`CREATE TABLE IF NOT EXISTS clicks (
		at INTEGER NOT NULL,
		view TEXT NOT NULL,
		session TEXT NOT NULL,
		href TEXT NOT NULL
	)`,
	'CREATE INDEX IF NOT EXISTS clicks_at ON clicks (at)'
];

// The tables are made on first use, once per Worker instance, so a deploy
// needs no separate step to set the database up.
let ready: Promise<unknown> | undefined;

export function stats() {
	const db = env.STATS;
	ready ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((error) => {
		ready = undefined;
		throw error;
	});
	return ready.then(() => db);
}

export type NewView = {
	id: string;
	at: number;
	visitor: string | null;
	session: string;
	landing: boolean;
	newVisitor: boolean;
	path: string;
	referrer: string | null;
	referrerUrl: string | null;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	country: string | null;
	region: string | null;
	city: string | null;
	timezone: string | null;
	org: string | null;
	browser: string;
	browserVersion: string;
	os: string;
	device: string;
	screen: string | null;
	viewport: string | null;
	pixelRatio: number | null;
	language: string | null;
	dark: boolean | null;
	loadMs: number | null;
};

export async function addView(view: NewView) {
	const db = await stats();
	await db
		.prepare(
			`INSERT OR IGNORE INTO views (id, at, seen, visitor, session, landing, new_visitor, path,
				referrer, referrer_url, utm_source, utm_medium, utm_campaign, country, region, city,
				timezone, org, browser, browser_version, os, device, screen, viewport, pixel_ratio,
				language, dark, load_ms)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			view.id,
			view.at,
			view.at,
			view.visitor,
			view.session,
			Number(view.landing),
			Number(view.newVisitor),
			view.path,
			view.referrer,
			view.referrerUrl,
			view.utmSource,
			view.utmMedium,
			view.utmCampaign,
			view.country,
			view.region,
			view.city,
			view.timezone,
			view.org,
			view.browser,
			view.browserVersion,
			view.os,
			view.device,
			view.screen,
			view.viewport,
			view.pixelRatio,
			view.language,
			view.dark === null ? null : Number(view.dark),
			view.loadMs
		)
		.run();
}

// How long the page has been read and how far down, which only ever grow,
// and how long it took to load if that was not known yet. A
// view stops taking updates after a day, so an old one cannot be rewritten.
export async function updateView(
	id: string,
	engagedMs: number,
	scroll: number,
	loadMs: number | null,
	now: number
) {
	const db = await stats();
	await db
		.prepare(
			`UPDATE views SET engaged_ms = max(engaged_ms, ?), scroll = max(scroll, ?),
				load_ms = coalesce(load_ms, ?), seen = ?
			WHERE id = ? AND at > ?`
		)
		.bind(engagedMs, scroll, loadMs, now, id, now - 24 * 60 * 60 * 1000)
		.run();
}

export async function addClick(view: string, href: string, now: number) {
	const db = await stats();
	// only from a view that exists, in the last day
	await db
		.prepare(
			`INSERT INTO clicks (at, view, session, href)
			SELECT ?, id, session, ? FROM views WHERE id = ? AND at > ?`
		)
		.bind(now, href, view, now - 24 * 60 * 60 * 1000)
		.run();
}
