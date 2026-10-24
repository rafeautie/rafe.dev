import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireToken } from '~/lib/admin/session.server';
import {
	DIMENSIONS,
	type Dimension,
	FILTER_KEYS,
	type Filters,
	isRange,
	type Metric,
	RANGES,
	readFilters
} from './dimensions';
import { stats } from './store.server';
import { zoneOffset } from './zone';

// What /admin/stats shows, read from the visits database: for a time range,
// narrowed by any filters, and for one visitor. Days and hours are Rafe's own,
// from where his request comes from.

export type Row = { key: string; label: string; visitors: number; views: number };
export type PageRow = Row & { engaged: number | null; scroll: number | null };
// cities, for the globe
export type CityRow = Row & { country: string | null; lat: number; lng: number };

export type SessionView = { at: number; path: string; engaged: number; scroll: number };

export type Visit = {
	session: string;
	// the browser's id, or the visit's own when it has none (opted out)
	visitor: string;
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
	// null when the browser has no id
	returning: boolean | null;
	// every visit this browser has made, ever
	visits: number | null;
};

export type Point = { at: number } & Record<Metric, number | null>;

const DAY = 24 * 60 * 60 * 1000;
const VISITOR = 'coalesce(visitor, session)';
// the same match as `${VISITOR} = ?1`, in a form the indexes on visitor and
// session can serve
const IS_VISITOR = '(visitor = ?1 OR (visitor IS NULL AND session = ?1))';

// The WHERE clause for a time range and filters, and its parameters.
function where(since: number, filters: Filters) {
	const clauses = ['at >= ?'];
	const params: (string | number)[] = [since];
	for (const key of FILTER_KEYS) {
		const value = filters[key];
		if (value === undefined) continue;
		const dimension: { key: string; landing?: boolean } = DIMENSIONS[key];
		// where a visit came from is only on its first page view, so those
		// filters keep every page view of the visits that match
		clauses.push(
			dimension.landing
				? `session IN (SELECT session FROM views WHERE landing = 1 AND ${dimension.key} = ?)`
				: `${dimension.key} = ?`
		);
		params.push(value);
	}
	return { sql: clauses.join(' AND '), params };
}

// The same, widened to whole visits: every page view in the range of a visit
// with any matching page view, so a visit's length or page count is the
// whole visit's, not only its matching pages'.
function wholeVisits(since: number, filter: ReturnType<typeof where>) {
	if (filter.params.length === 1) return filter;
	return {
		sql: `at >= ? AND session IN (SELECT session FROM views WHERE ${filter.sql})`,
		params: [since, ...filter.params]
	};
}

function breakdown(dimension: Dimension, filter: ReturnType<typeof where>, limit = 25) {
	const { key, landing } = { landing: false, ...DIMENSIONS[dimension] };
	return `SELECT ${key} AS key, ${key} AS label, count(DISTINCT ${VISITOR}) AS visitors,
			count(*) AS views
		FROM views WHERE ${filter.sql} ${landing ? 'AND landing = 1' : ''}
			AND ${key} IS NOT NULL AND ${key} != ''
		GROUP BY key ORDER BY visitors DESC, views DESC LIMIT ${limit}`;
}

// One visit per session, page by page, from its rows in time order.
function toVisits(
	rows: Record<string, string | number | null>[],
	clicks: { session: string; href: string }[]
) {
	const visits = new Map<string, Visit>();
	for (const row of rows) {
		const session = String(row.session);
		let visit = visits.get(session);
		if (!visit) {
			visit = {
				session,
				visitor: String(row.visitor ?? session),
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
			visits.set(session, visit);
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
	for (const { session, href } of clicks) visits.get(session)?.clicks.push(href);
	return [...visits.values()].sort((a, b) => b.end - a.end);
}

// How many visits each visit's browser has made, ever.
async function countVisits(db: D1Database, visits: Visit[]) {
	const ids = [...new Set(visits.filter((v) => v.returning !== null).map((v) => v.visitor))];
	if (!ids.length) return;
	const { results } = await db
		.prepare(
			`SELECT visitor, count(DISTINCT session) AS visits FROM views
			WHERE visitor IN (${ids.map(() => '?').join(', ')}) GROUP BY visitor`
		)
		.bind(...ids)
		.all<{ visitor: string; visits: number }>();
	const counts = new Map(results.map((row) => [row.visitor, row.visits]));
	for (const visit of visits) {
		if (visit.returning !== null) visit.visits = counts.get(visit.visitor) ?? null;
	}
}

function timeZoneOffset(now: number) {
	const cf = (getRequest() as { cf?: IncomingRequestCfProperties }).cf;
	return zoneOffset(cf?.timezone ?? 'UTC', now);
}

const BREAKDOWNS = Object.keys(DIMENSIONS).filter((key) => key !== 'page') as Dimension[];

// where the globe's queries go in the batch, after the breakdowns
const MAP = 11 + BREAKDOWNS.length;

export const getStats = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => {
		const data = (input ?? {}) as Record<string, unknown>;
		return {
			range: isRange(data.range) ? data.range : '7d',
			filters: readFilters((data.filters ?? {}) as Record<string, unknown>)
		};
	})
	.handler(async ({ data }) => {
		await requireToken();
		const db = await stats();
		const now = Date.now();
		const { span, bucket } = RANGES[data.range];
		const offset = timeZoneOffset(now);
		// whole hours or days: 7 days is today and the six before it
		const lastBucket = Math.floor((now + offset) / bucket);
		const since = Number.isFinite(span)
			? (lastBucket - Math.round(span / bucket) + 1) * bucket - offset
			: 0;
		const filter = where(since, data.filters);
		const visitFilter = wholeVisits(since, filter);
		const run = (sql: string, before: (string | number)[] = [], scope = filter) =>
			db.prepare(sql).bind(...before, ...scope.params);

		const SESSIONS = `SELECT session, min(at) AS start, count(*) AS n, sum(engaged_ms) AS duration,
				max(landing = 1 AND visitor IS NOT NULL AND new_visitor = 0) AS returned,
				max(visitor IS NOT NULL) AS known
			FROM views WHERE ${visitFilter.sql} GROUP BY session`;
		const RECENT = `SELECT session FROM views WHERE ${filter.sql}
			GROUP BY session ORDER BY max(seen) DESC LIMIT 50`;

		const statements = [
			// 0: headline numbers from page views
			run(
				`SELECT count(*) AS views, count(DISTINCT ${VISITOR}) AS visitors
				FROM views WHERE ${filter.sql}`
			),
			// 1: headline numbers from visits
			run(
				`SELECT count(*) AS visits, avg(n = 1) AS bounce, avg(duration) AS duration,
					sum(returned) * 1.0 / nullif(sum(known), 0) AS returned
				FROM (${SESSIONS})`,
				[],
				visitFilter
			),
			// 2: page views over time
			run(
				`SELECT CAST((at + ?) / ? AS INTEGER) AS bucket, count(*) AS views,
					count(DISTINCT ${VISITOR}) AS visitors
				FROM views WHERE ${filter.sql} GROUP BY bucket`,
				[offset, bucket]
			),
			// 3: visits over time, by when they started
			run(
				`SELECT CAST((start + ?) / ? AS INTEGER) AS bucket, count(*) AS visits,
					avg(n = 1) AS bounce, avg(duration) AS duration,
					sum(returned) * 1.0 / nullif(sum(known), 0) AS returned
				FROM (${SESSIONS}) GROUP BY bucket`,
				[offset, bucket],
				visitFilter
			),
			// 4: pages, with reading time and scroll depth
			run(
				`SELECT path AS key, path AS label, count(DISTINCT ${VISITOR}) AS visitors,
					count(*) AS views, avg(nullif(engaged_ms, 0)) AS engaged,
					avg(nullif(scroll, 0)) AS scroll
				FROM views WHERE ${filter.sql}
				GROUP BY path ORDER BY visitors DESC, views DESC LIMIT 25`
			),
			// 5: links followed off the site, from the page views in view
			run(
				`SELECT href AS key, href AS label, count(DISTINCT session) AS visitors,
					count(*) AS views
				FROM clicks WHERE view IN (SELECT id FROM views WHERE ${filter.sql})
				GROUP BY href ORDER BY views DESC LIMIT 25`
			),
			// 6: when people visit, by weekday and hour
			run(
				`SELECT CAST(strftime('%w', CAST((at + ?) / 1000 AS INTEGER), 'unixepoch') AS INTEGER) AS day,
					CAST(strftime('%H', CAST((at + ?) / 1000 AS INTEGER), 'unixepoch') AS INTEGER) AS hour,
					count(DISTINCT ${VISITOR}) AS visitors, count(*) AS views
				FROM views WHERE ${filter.sql} GROUP BY day, hour`,
				[offset, offset]
			),
			// 7: the latest visits, page by page
			run(`SELECT v.* FROM views v JOIN (${RECENT}) USING (session) ORDER BY v.at`),
			// 8: their links followed off the site
			run(`SELECT c.session, c.href FROM clicks c JOIN (${RECENT}) USING (session) ORDER BY c.at`),
			// 9: the people who have come most often; the place and device are
			// from their latest page view (SQLite takes bare columns from the
			// row max() picked)
			run(
				`SELECT ${VISITOR} AS visitor, count(DISTINCT session) AS visits, count(*) AS views,
					sum(engaged_ms) AS engaged, max(seen) AS last, city, region, country, browser, os,
					device, visitor IS NULL AS anonymous
				FROM views WHERE ${filter.sql}
				GROUP BY ${VISITOR} ORDER BY visits DESC, views DESC, last DESC LIMIT 50`
			),
			// 10: the last time anyone was here, and the first
			db.prepare('SELECT max(seen) AS last, min(at) AS first FROM views'),
			// 11 on: the breakdowns
			// every country, for the map
			...BREAKDOWNS.map((dimension) =>
				run(breakdown(dimension, filter, dimension === 'country' ? 300 : 25))
			)
		];
		statements.push(
			// MAP: cities, where they are
			run(
				`SELECT ${DIMENSIONS.city.key} AS key, city AS label, country, avg(latitude) AS lat,
					avg(longitude) AS lng, count(DISTINCT ${VISITOR}) AS visitors, count(*) AS views
				FROM views WHERE ${filter.sql} AND city IS NOT NULL AND city != ''
					AND country IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
				GROUP BY key ORDER BY visitors DESC LIMIT 1000`
			)
		);
		const results = await db.batch(statements);
		const rows = <T>(index: number) => results[index].results as T[];

		const totals = rows<{ views: number; visitors: number }>(0)[0];
		const sessions = rows<{
			visits: number;
			bounce: number | null;
			duration: number | null;
			returned: number | null;
		}>(1)[0];
		const when = rows<{ last: number | null; first: number | null }>(10)[0];

		// every bucket in the range, empty ones included
		const byViews = new Map(
			rows<{ bucket: number; views: number; visitors: number }>(2).map((row) => [row.bucket, row])
		);
		const byVisits = new Map(
			rows<{
				bucket: number;
				visits: number;
				bounce: number | null;
				duration: number | null;
				returned: number | null;
			}>(3).map((row) => [row.bucket, row])
		);
		const firstBucket = Math.floor(((since || when.first || now) + offset) / bucket);
		const series: Point[] = [];
		for (let b = Math.max(firstBucket, lastBucket - 400); b <= lastBucket; b++) {
			const views = byViews.get(b);
			const visits = byVisits.get(b);
			series.push({
				// the bucket's start as a wall-clock time, read as UTC
				at: b * bucket,
				visitors: views?.visitors ?? 0,
				views: views?.views ?? 0,
				visits: visits?.visits ?? 0,
				duration: visits?.duration ?? null,
				bounce: visits?.bounce ?? null,
				returning: visits?.returned ?? null
			});
		}

		const recent = toVisits(
			rows<Record<string, string | number | null>>(7),
			rows<{ session: string; href: string }>(8)
		);
		await countVisits(db, recent);

		const breakdowns = Object.fromEntries(
			BREAKDOWNS.map((dimension, index) => [dimension, rows<Row>(11 + index)])
		) as Record<Exclude<Dimension, 'page'>, Row[]>;

		return {
			range: data.range,
			filters: data.filters,
			bucket,
			last: when.last,
			totals: {
				visitors: totals.visitors,
				visits: sessions.visits,
				views: totals.views,
				duration: sessions.duration,
				bounce: sessions.bounce,
				returning: sessions.returned
			} satisfies Record<Metric, number | null>,
			series,
			heatmap: rows<{ day: number; hour: number; visitors: number; views: number }>(6),
			pages: rows<PageRow>(4),
			clicks: rows<Row>(5),
			breakdowns,
			places: { cities: rows<CityRow>(MAP) },
			recent,
			visitors: rows<{
				visitor: string;
				visits: number;
				views: number;
				engaged: number;
				last: number;
				city: string | null;
				region: string | null;
				country: string | null;
				browser: string | null;
				os: string | null;
				device: string | null;
				anonymous: number;
			}>(9)
		};
	});

// Everything one browser has done on the site (or one visit, for a browser
// without an id).
export const getVisitor = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => {
		const id = (input as { id?: unknown } | null)?.id;
		if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('Bad visitor');
		return { id };
	})
	.handler(async ({ data }) => {
		await requireToken();
		const db = await stats();
		const now = Date.now();
		const offset = timeZoneOffset(now);
		const [views, clicks, pages] = await db.batch([
			db.prepare(`SELECT * FROM views WHERE ${IS_VISITOR} ORDER BY at LIMIT 5000`).bind(data.id),
			db
				.prepare(
					`SELECT session, href FROM clicks
					WHERE session IN (SELECT session FROM views WHERE ${IS_VISITOR}) ORDER BY at`
				)
				.bind(data.id),
			db
				.prepare(
					`SELECT path AS key, path AS label, count(DISTINCT session) AS visitors,
						count(*) AS views, avg(nullif(engaged_ms, 0)) AS engaged,
						avg(nullif(scroll, 0)) AS scroll
					FROM views WHERE ${IS_VISITOR} GROUP BY path ORDER BY views DESC`
				)
				.bind(data.id)
		]);
		const rows = views.results as Record<string, string | number | null>[];
		if (!rows.length) return null;
		const visits = toVisits(rows, clicks.results as { session: string; href: string }[]);
		const unique = (values: unknown[]) =>
			[...new Set(values.filter((value) => value !== null && value !== ''))] as string[];

		// page views per day, from the first visit to today
		const first = Math.floor((Number(rows[0].at) + offset) / DAY);
		const last = Math.floor((now + offset) / DAY);
		const perDay = new Map<number, number>();
		for (const row of rows) {
			const day = Math.floor((Number(row.at) + offset) / DAY);
			perDay.set(day, (perDay.get(day) ?? 0) + 1);
		}
		const series = [];
		for (let day = Math.max(first, last - 400); day <= last; day++) {
			series.push({ at: day * DAY, views: perDay.get(day) ?? 0 });
		}

		return {
			id: data.id,
			anonymous: !rows[0].visitor,
			first: Number(rows[0].at),
			last: Math.max(...rows.map((row) => Number(row.seen))),
			views: rows.length,
			engaged: rows.reduce((sum, row) => sum + Number(row.engaged_ms), 0),
			visits,
			pages: pages.results as PageRow[],
			series,
			places: unique(
				rows.map((row) => [row.city, row.region, row.country].filter(Boolean).join(', '))
			),
			sources: unique(rows.map((row) => row.referrer)),
			networks: unique(rows.map((row) => row.org)),
			devices: unique(
				rows.map((row) =>
					[`${row.browser} on ${row.os}`, row.device, row.screen].filter(Boolean).join(' · ')
				)
			),
			languages: unique(rows.map((row) => row.language))
		};
	});
