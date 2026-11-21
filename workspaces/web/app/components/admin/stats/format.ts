import { NUMBER, PERCENT } from '~/lib/admin/format';
import type { Metric } from '~/lib/stats/dimensions';

// How /admin/stats writes its metrics, times and places. Counts and shares
// are lib/admin/format's, as on every admin page.

// bucket times are wall-clock times read as UTC (lib/stats/report.ts)
export const DAY = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});
export const HOUR = new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: 'UTC' });
export const DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' });

export function country(code: string | null) {
	if (!code) return '';
	try {
		return REGIONS.of(code) ?? code;
	} catch {
		return code;
	}
}

export function place(parts: {
	city: string | null;
	region: string | null;
	country: string | null;
}) {
	return [parts.city, parts.region, country(parts.country)].filter(Boolean).join(', ');
}

// 45s, 3m 12s, 1h 5m
export function duration(ms: number | null) {
	if (ms === null || !Number.isFinite(ms)) return '–';
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function ordinal(n: number) {
	const suffix = ['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th';
	return `${n}${suffix}`;
}

export function formatMetric(metric: Metric, value: number | null) {
	if (value === null || !Number.isFinite(value)) return '–';
	if (metric === 'duration') return duration(value);
	if (metric === 'bounce' || metric === 'returning') return PERCENT.format(value);
	return NUMBER.format(value);
}

// weekdays from Monday, as the heatmap's rows run
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function hourLabel(hour: number) {
	if (hour === 0) return '12am';
	if (hour === 12) return '12pm';
	return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

// The busiest hour of the week, in words: "Tuesdays around 2pm". SQLite
// counts days from Sunday (0).
export function busiest(cells: { day: number; hour: number; visitors: number }[]) {
	const top = cells.reduce<(typeof cells)[number] | null>(
		(best, cell) => (!best || cell.visitors > best.visitors ? cell : best),
		null
	);
	if (!top) return null;
	return `${DAYS[(top.day + 6) % 7]}s around ${hourLabel(top.hour)}`;
}
