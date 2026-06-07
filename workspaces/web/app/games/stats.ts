import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';
import { BUCKET_COUNT, BUCKET_MINUTES, BUCKET_MS, SERIES_HOURS } from './stats.constants';

// Per-game stats read back from the Analytics Engine `game_stats` dataset.
// `games`/`players` are lifetime totals (headline numbers); `series` is the recent
// activity the /games page graphs — BUCKET_COUNT contiguous 15-minute buckets ending
// now, zero-filled. Keyed by game id so this generalises to future games.
export interface GameStat {
	gameId: string;
	games: number;
	players: number;
	series: { t: string; games: number }[];
}

export type GameStats = Record<string, GameStat>;

// SQL aggregates may arrive as strings in JSON, so numeric fields are coerced
// through Number() when shaped.
interface BaseRow {
	game: string;
	games: number | string;
}

// Lifetime totals: one row per game. (90 days is the full AE retention window.)
interface TotalsRow extends BaseRow {
	players: number | string;
}

// Recent activity: one row per game per 15-minute bucket that had games.
// `bucket` is the unix-seconds bucket start, emitted directly by the query.
interface SeriesRow extends BaseRow {
	bucket: number | string;
}

// 90 days is the full Analytics Engine retention window.
const TOTALS_WINDOW_DAYS = 90;
// How long the stats response may be reused before hitting the SQL API again.
const CACHE_TTL_SECONDS = 5;

// _sample_interval keeps counts correct if CF ever downsamples (it's 1 at this volume).
const TOTALS_SQL = `
	SELECT
		blob1 AS game,
		SUM(_sample_interval) AS games,
		SUM(_sample_interval * double1) AS players
	FROM game_stats
	WHERE timestamp > NOW() - INTERVAL '${TOTALS_WINDOW_DAYS}' DAY
	GROUP BY game
	FORMAT JSON
`;

// Bucket start is emitted as a unix timestamp (seconds) so it shares one
// representation with the epoch math below — no datetime-string parsing. The
// interval is interpolated so BUCKET_MINUTES is the single source of truth.
const SERIES_SQL = `
	SELECT
		blob1 AS game,
		toUnixTimestamp(toStartOfInterval(timestamp, INTERVAL '${BUCKET_MINUTES}' MINUTE)) AS bucket,
		SUM(_sample_interval) AS games
	FROM game_stats
	WHERE timestamp > NOW() - INTERVAL '${SERIES_HOURS}' HOUR
	GROUP BY game, bucket
	ORDER BY bucket ASC
	FORMAT JSON
`;

// Stable 'HH:MM' (UTC) label — formatted server-side so SSR and client agree.
function bucketLabel(ms: number): string {
	return new Date(ms).toISOString().slice(11, 16);
}

// The BUCKET_COUNT bucket-start epochs ending at the current 15-minute boundary,
// oldest first — the fixed x-axis the graph is zero-filled against.
function recentBuckets(nowMs: number): number[] {
	const current = Math.floor(nowMs / BUCKET_MS) * BUCKET_MS;
	return Array.from(
		{ length: BUCKET_COUNT },
		(_, i) => current - (BUCKET_COUNT - 1 - i) * BUCKET_MS
	);
}

function shape(totals: TotalsRow[], series: SeriesRow[]): GameStats {
	const buckets = recentBuckets(Date.now());
	// The x-axis labels are the same for every game; derive them once.
	const labels = buckets.map(bucketLabel);

	const totalsByGame = new Map(totals.map((row) => [row.game, row]));

	// game -> (bucketStartMs -> games). GROUP BY game, bucket means one row per key.
	const seriesByGame = new Map<string, Map<number, number>>();
	for (const row of series) {
		let perBucket = seriesByGame.get(row.game);
		if (!perBucket) seriesByGame.set(row.game, (perBucket = new Map()));
		perBucket.set(Number(row.bucket) * 1000, Number(row.games) || 0);
	}

	const out: GameStats = {};
	for (const game of new Set([...totalsByGame.keys(), ...seriesByGame.keys()])) {
		const totalsRow = totalsByGame.get(game);
		const perBucket = seriesByGame.get(game);
		out[game] = {
			gameId: game,
			games: Number(totalsRow?.games) || 0,
			players: Number(totalsRow?.players) || 0,
			series: buckets.map((ms, i) => ({ t: labels[i], games: perBucket?.get(ms) ?? 0 }))
		};
	}
	return out;
}

async function querySql<T>(sql: string): Promise<T[]> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const token = env.CLOUDFLARE_ANALYTICS_TOKEN;
	// Not configured yet (e.g. local dev without secrets) — render the page empty
	// rather than throwing.
	if (!accountId || !token) return [];

	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: sql
		}
	);
	if (!res.ok) return [];

	const json = await res.json<{ data?: T[] }>();
	return json.data ?? [];
}

async function queryAnalytics(): Promise<GameStats> {
	const [totals, series] = await Promise.all([
		querySql<TotalsRow>(TOTALS_SQL),
		querySql<SeriesRow>(SERIES_SQL)
	]);
	return shape(totals, series);
}

// Server function the /games route loader calls once on load. A Cache-Control
// header lets the edge/browser reuse the result for CACHE_TTL_SECONDS instead of
// re-hitting the rate-limited SQL API on every request. Never throws — any failure
// degrades to empty stats so the page always renders.
export const getGameStats = createServerFn().handler(async (): Promise<GameStats> => {
	setResponseHeader('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
	try {
		return await queryAnalytics();
	} catch {
		return {};
	}
});
