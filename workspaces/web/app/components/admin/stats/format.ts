import type { Metric } from '~/lib/stats/dimensions';

// How /admin/stats writes numbers, times and places.

export const NUMBER = new Intl.NumberFormat('en-US');
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
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
