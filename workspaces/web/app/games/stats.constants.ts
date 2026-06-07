// Shape of the recent-activity graph, shared by the server query (stats.ts) and
// the client chart (GameStatsChart.tsx) so the empty state always matches the
// real number of data points. Kept dependency-free so it is safe in the client
// bundle — do not import server-only modules here.

// Graph window: the last 3 hours in 15-minute buckets.
export const SERIES_HOURS = 3;
export const BUCKET_MINUTES = 15;
export const BUCKET_MS = BUCKET_MINUTES * 60 * 1000;
// The expected number of data points / bars (12 at the current settings).
export const BUCKET_COUNT = (SERIES_HOURS * 60) / BUCKET_MINUTES;
