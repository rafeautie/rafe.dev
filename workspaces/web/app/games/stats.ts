import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';
import { BUCKET_COUNT, BUCKET_MINUTES, BUCKET_MS, SERIES_HOURS } from './stats.constants';

// Per-game stats read back from the Analytics Engine `game_stats` dataset, all
// over the same window: the last SERIES_HOURS hours. `games`/`players` are the
// "live" headline numbers — the count in the current (most recent) 15-minute
// bucket; `series` is the per-bucket game count the /games page graphs —
// BUCKET_COUNT contiguous 15-minute buckets ending now, zero-filled. Keyed by
// game id so this generalises to future games.
export interface GameStat {
	gameId: string;
	games: number;
	players: number;
	series: { t: string; games: number }[];
}

export type GameStats = Record<string, GameStat>;

// One row per game per 15-minute bucket that had games. SQL aggregates may arrive
// as strings in JSON, so numeric fields are coerced through Number() when shaped.
// `bucket` is the unix-seconds bucket start, emitted directly by the query.
interface StatsRow {
	game: string;
	bucket: number | string;
	games: number | string;
	players: number | string;
}

// How long the stats response may be reused before hitting the SQL API again.
const CACHE_TTL_SECONDS = 15;

// One query covers both the graph and the totals (summed from the same buckets).
// _sample_interval keeps counts correct if CF ever downsamples (it's 1 at this
// volume). The bucket start is emitted as a unix timestamp (seconds) so it shares
// one representation with the epoch math below — no datetime-string parsing — and
// the interval is interpolated so BUCKET_MINUTES is the single source of truth.
const STATS_SQL = `
	SELECT
		blob1 AS game,
		toUnixTimestamp(toStartOfInterval(timestamp, INTERVAL '${BUCKET_MINUTES}' MINUTE)) AS bucket,
		SUM(_sample_interval) AS games,
		SUM(_sample_interval * double1) AS players
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

function shape(rows: StatsRow[]): GameStats {
	const buckets = recentBuckets(Date.now());
	// The x-axis labels are the same for every game; derive them once.
	const labels = buckets.map(bucketLabel);

	// game -> (bucketStartMs -> {games, players}). GROUP BY game, bucket → one row per key.
	const byGame = new Map<string, Map<number, { games: number; players: number }>>();
	for (const row of rows) {
		let perBucket = byGame.get(row.game);
		if (!perBucket) byGame.set(row.game, (perBucket = new Map()));
		perBucket.set(Number(row.bucket) * 1000, {
			games: Number(row.games) || 0,
			players: Number(row.players) || 0
		});
	}

	// The current (most recent) bucket drives the live headline numbers.
	const latestMs = buckets[buckets.length - 1];

	const out: GameStats = {};
	for (const [game, perBucket] of byGame) {
		const latest = perBucket.get(latestMs);
		out[game] = {
			gameId: game,
			games: latest?.games ?? 0,
			players: latest?.players ?? 0,
			series: buckets.map((ms, i) => ({ t: labels[i], games: perBucket.get(ms)?.games ?? 0 }))
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
	return shape(await querySql<StatsRow>(STATS_SQL));
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
