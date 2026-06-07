# Cross-game stats are recorded in Workers Analytics Engine, written once per started game

The `/games` page surfaces recent-activity stats per game (games played, players) and a games-over-time graph. These span many games across rooms, so they cannot live in a single game's Durable Object state — that state is per-room and reaped after `IDLE_TTL_MS`. Instead, each game writes exactly one data point to a Workers Analytics Engine dataset (`game_stats`, bound as `GAME_STATS`) at the moment it starts, from the `season_started` handler in `the-race-game.ts`. The data point carries the game id in both `index1` (sampling key) and `blob1` (grouping dimension) and the player count in `double1`.

The `/games` route loader calls a TanStack server function (`app/games/stats.ts`) that reads the data back through the Analytics Engine SQL API with one query: grouped by game and 15-minute bucket over the last 3 hours (`SUM(_sample_interval)` for games, `SUM(_sample_interval * double1)` for players). The graph is the per-bucket game count, zero-filled to a fixed 12-bucket window; the headline numbers are "live" — the games/players in the current (most recent) 15-minute bucket only. The response carries a `Cache-Control: public, max-age=N` header so the edge/browser reuses it instead of re-hitting the rate-limited SQL API, and the loader sets `staleTime` so the stats load once per page load rather than on every render.

This keeps a per-game DO focused on running its own game while cross-game analytics live in purpose-built, retention-bounded storage, and it generalises for free: a new game writes its own id and shows up on the page with no schema change.

## Notes

- The headline numbers are the current 15-minute bucket only ("live"), not a running or all-time total. They are limited by Analytics Engine ingestion lag (a fresh game start takes seconds-to-a-minute to become queryable) and refresh on page load / navigation, not in real time. A true lifetime counter or sub-second updates would need separate durable accumulation; this design deliberately trades that for a single windowed query.
- "Players" means player-participations (the sum of per-game player counts), not unique humans — player ids are client-generated and ephemeral, so there is no stable identity to count uniques against.
- Writes are fire-and-forget and wrapped in try/catch; the read path degrades to empty stats when the dataset is unconfigured or the SQL API errors. Analytics never affects gameplay or page rendering.
- Requires two secrets: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ANALYTICS_TOKEN` (an API token with **Account Analytics: Read**).

## Considered Options

- **Accumulate counters in a dedicated "stats" Durable Object.** Rejected: reintroduces a hand-rolled, serial-write aggregate we would have to maintain, back up, and guard against contention — exactly what Analytics Engine provides natively with built-in time-series querying and retention.
- **Write a data point on every player join / reconnect and count rows for players.** Rejected: reconnects and re-joins would inflate counts. Writing once per started game with the player count in `double1` is unambiguous.
- **Store running totals in KV.** Rejected: no time dimension (no per-day graph) and concurrent increments race; AE is append-only and aggregates at query time.
