import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireToken } from '~/lib/admin/session.server';
import { stats } from './store.server';
import { zoneOffset } from './zone';

// What /admin/stats shows, for one of a few time ranges, read from the visits
// database in one round trip. Days and hours are Rafe's own, from where his
// request comes from.

export const RANGES = {
	'24h': { label: '24 hours', span: 24 * 60 * 60 * 1000, bucket: 60 * 60 * 1000 },
	'7d': { label: '7 days', span: 7 * 24 * 60 * 60 * 1000, bucket: 24 * 60 * 60 * 1000 },
	'30d': { label: '30 days', span: 30 * 24 * 60 * 60 * 1000, bucket: 24 * 60 * 60 * 1000 },
	'90d': { label: '90 days', span: 90 * 24 * 60 * 60 * 1000, bucket: 24 * 60 * 60 * 1000 },
	all: { label: 'All time', span: Infinity, bucket: 24 * 60 * 60 * 1000 }
} as const;

export type Range = keyof typeof RANGES;

export function isRange(value: unknown): value is Range {
	return typeof value === 'string' && value in RANGES;
}

export type Row = { label: string; visitors: number; views: number };
export type PageRow = Row & { engaged: number | null; scroll: number | null };

export type SessionView = { at: number; path: string; engaged: number; scroll: number };

export type Visit = {
	session: string;
	start: number;
	end: number;
	views: SessionView[];
	clicks: string[];
	engaged: number;
	source: string | null;
	campaign: string | null;
	city: string | null;
	region: string | null;
	country: string | null;
	org: string | null;
	browser: string | null;
	os: string | null;
	device: string | null;
	screen: string | null;
	language: string | null;
	// null when the browser has no id (opted out)
	returning: boolean | null;
	// every visit this browser has made, ever
	visits: number | null;
};

const VISITOR = 'coalesce(visitor, session)';

// label, visitors and views for the top values of one column
function top(expr: string, { landing = false, limit = 10 } = {}) {
	return `SELECT ${expr} AS label, count(DISTINCT ${VISITOR}) AS visitors, count(*) AS views
		FROM views WHERE at >= ?1 ${landing ? 'AND landing = 1' : ''} AND ${expr} IS NOT NULL AND ${expr} != ''
		GROUP BY label ORDER BY visitors DESC, views DESC LIMIT ${limit}`;
}

const BREAKDOWNS = {
	sources: top(`coalesce(referrer, 'Direct')`, { landing: true }),
	campaigns: top(
		`CASE WHEN utm_source IS NULL AND utm_campaign IS NULL THEN NULL
			ELSE coalesce(utm_source, '') || coalesce(' · ' || utm_campaign, '') END`,
		{ landing: true }
	),
	countries: top('country'),
	cities: top(`city || ', ' || coalesce(region || ', ', '') || country`),
	networks: top('org'),
	browsers: top('browser'),
	systems: top('os'),
	devices: top('device'),
	screens: top('screen'),
	languages: top('language'),
	themes: top(`CASE dark WHEN 1 THEN 'Dark' WHEN 0 THEN 'Light' END`)
} as const;

export type Breakdown = keyof typeof BREAKDOWNS;

export const getStats = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => {
		const range = (input as { range?: unknown } | null)?.range;
		return { range: isRange(range) ? range : '7d' };
	})
	.handler(async ({ data }) => {
		await requireToken();
		const db = await stats();
		const now = Date.now();
		const { span, bucket } = RANGES[data.range];
		const cf = (getRequest() as { cf?: IncomingRequestCfProperties }).cf;
		const offset = zoneOffset(cf?.timezone ?? 'UTC', now);
		// whole hours or days: 7 days is today and the six before it
		const lastBucket = Math.floor((now + offset) / bucket);
		const since = Number.isFinite(span)
			? (lastBucket - Math.round(span / bucket) + 1) * bucket - offset
			: 0;

		const statements = [
			// 0: page views and people
			db
				.prepare(
					`SELECT count(*) AS views, count(DISTINCT ${VISITOR}) AS visitors,
						avg(nullif(engaged_ms, 0)) AS engaged, avg(nullif(scroll, 0)) AS scroll
					FROM views WHERE at >= ?1`
				)
				.bind(since),
			// 1: visits (sessions)
			db
				.prepare(
					`SELECT count(*) AS visits, sum(n = 1) AS bounces, sum(returned) AS returned,
						sum(known) AS known, avg(duration) AS duration
					FROM (
						SELECT count(*) AS n, sum(engaged_ms) AS duration,
							max(landing = 1 AND visitor IS NOT NULL AND new_visitor = 0) AS returned,
							max(visitor IS NOT NULL) AS known
						FROM views WHERE at >= ?1 GROUP BY session
					)`
				)
				.bind(since),
			// 2: over time
			db
				.prepare(
					`SELECT CAST((at + ?2) / ?3 AS INTEGER) AS bucket, count(*) AS views,
						count(DISTINCT ${VISITOR}) AS visitors
					FROM views WHERE at >= ?1 GROUP BY bucket ORDER BY bucket`
				)
				.bind(since, offset, bucket),
			// 3: pages
			db
				.prepare(
					`SELECT path AS label, count(DISTINCT ${VISITOR}) AS visitors, count(*) AS views,
						avg(nullif(engaged_ms, 0)) AS engaged, avg(nullif(scroll, 0)) AS scroll
					FROM views WHERE at >= ?1 GROUP BY path ORDER BY views DESC LIMIT 15`
				)
				.bind(since),
			// 4: links followed off the site
			db
				.prepare(
					`SELECT href AS label, count(DISTINCT session) AS visitors, count(*) AS views
					FROM clicks WHERE at >= ?1 GROUP BY href ORDER BY views DESC LIMIT 10`
				)
				.bind(since),
			// 5: the latest visits, page by page
			db
				.prepare(
					`WITH recent AS (
						SELECT session FROM views WHERE at >= ?1
						GROUP BY session ORDER BY max(at) DESC LIMIT 25
					)
					SELECT v.* FROM views v JOIN recent USING (session) ORDER BY v.at`
				)
				.bind(since),
			// 6: their links followed off the site
			db
				.prepare(
					`WITH recent AS (
						SELECT session FROM views WHERE at >= ?1
						GROUP BY session ORDER BY max(at) DESC LIMIT 25
					)
					SELECT c.session, c.href FROM clicks c JOIN recent USING (session) ORDER BY c.at`
				)
				.bind(since),
			// 7: the last time anyone was here
			db.prepare('SELECT max(seen) AS last, min(at) AS first FROM views'),
			...Object.values(BREAKDOWNS).map((sql) => db.prepare(sql).bind(since))
		];
		const results = await db.batch(statements);
		const rows = <T>(index: number) => results[index].results as T[];

		const totals = rows<{
			views: number;
			visitors: number;
			engaged: number | null;
			scroll: number | null;
		}>(0)[0];
		const visits = rows<{
			visits: number;
			bounces: number | null;
			returned: number | null;
			known: number | null;
			duration: number | null;
		}>(1)[0];
		const when = rows<{ last: number | null; first: number | null }>(7)[0];

		// every bucket in the range, empty ones included
		const counts = new Map(
			rows<{ bucket: number; views: number; visitors: number }>(2).map((row) => [row.bucket, row])
		);
		const firstBucket = Math.floor(((since || when.first || now) + offset) / bucket);
		const series = [];
		for (let b = Math.max(firstBucket, lastBucket - 400); b <= lastBucket; b++) {
			series.push({
				// the bucket's start as a wall-clock time, read as UTC
				at: b * bucket,
				views: counts.get(b)?.views ?? 0,
				visitors: counts.get(b)?.visitors ?? 0
			});
		}

		const visitRows = rows<Record<string, string | number | null>>(5);
		const clickRows = rows<{ session: string; href: string }>(6);
		const recent = new Map<string, Visit>();
		for (const row of visitRows) {
			const session = String(row.session);
			let visit = recent.get(session);
			if (!visit) {
				visit = {
					session,
					start: Number(row.at),
					end: Number(row.seen),
					views: [],
					clicks: [],
					engaged: 0,
					source: null,
					campaign: null,
					city: row.city as string | null,
					region: row.region as string | null,
					country: row.country as string | null,
					org: row.org as string | null,
					browser: row.browser as string | null,
					os: row.os as string | null,
					device: row.device as string | null,
					screen: row.screen as string | null,
					language: row.language as string | null,
					returning: row.visitor ? false : null,
					visits: null
				};
				recent.set(session, visit);
			}
			if (row.landing) {
				visit.source = (row.referrer as string | null) ?? null;
				visit.campaign = (row.utm_campaign ?? row.utm_source) as string | null;
				if (row.visitor) visit.returning = !row.new_visitor;
			}
			visit.views.push({
				at: Number(row.at),
				path: String(row.path),
				engaged: Number(row.engaged_ms),
				scroll: Number(row.scroll)
			});
			visit.engaged += Number(row.engaged_ms);
			visit.end = Math.max(visit.end, Number(row.seen));
		}
		for (const { session, href } of clickRows) recent.get(session)?.clicks.push(href);

		// how many visits each of those browsers has made, ever
		const visitors = [...new Set(visitRows.map((row) => row.visitor).filter(Boolean))] as string[];
		if (visitors.length) {
			const { results: made } = await db
				.prepare(
					`SELECT visitor, count(DISTINCT session) AS visits FROM views
					WHERE visitor IN (${visitors.map(() => '?').join(', ')}) GROUP BY visitor`
				)
				.bind(...visitors)
				.all<{ visitor: string; visits: number }>();
			const byVisitor = new Map(made.map((row) => [row.visitor, row.visits]));
			const visitorOf = new Map(visitRows.map((row) => [row.session, row.visitor]));
			for (const visit of recent.values()) {
				const visitor = visitorOf.get(visit.session);
				if (visitor) visit.visits = byVisitor.get(String(visitor)) ?? null;
			}
		}

		const breakdowns = Object.fromEntries(
			Object.keys(BREAKDOWNS).map((key, index) => [key, rows<Row>(8 + index)])
		) as Record<Breakdown, Row[]>;

		return {
			range: data.range,
			bucket,
			last: when.last,
			views: totals.views,
			visitors: totals.visitors,
			visits: visits.visits,
			engaged: totals.engaged,
			scroll: totals.scroll,
			bounceRate: visits.visits ? (visits.bounces ?? 0) / visits.visits : null,
			returningRate: visits.known ? (visits.returned ?? 0) / visits.known : null,
			visitLength: visits.duration,
			series,
			pages: rows<PageRow>(3),
			clicks: rows<Row>(4),
			recent: [...recent.values()].sort((a, b) => b.end - a.end),
			...breakdowns
		};
	});
