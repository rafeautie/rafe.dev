// What /admin/stats can break visits down by, and filter them by: each is a
// SQL expression over the views table (lib/stats/store.server.ts). Shared by
// the server, which queries them, and the page, which names them and keeps
// the chosen filters in its URL.

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

// `key` is what is shown and what a filter matches.
// `landing` counts only the page a visit started on, which is the one that
// knows where the visitor came from.
export const DIMENSIONS = {
	page: { title: 'Pages', key: 'path' },
	entry: { title: 'Entry pages', key: 'path', landing: true },
	source: { title: 'Sources', key: `coalesce(referrer, 'Direct')`, landing: true },
	campaign: {
		title: 'Campaigns',
		key: `CASE WHEN utm_source IS NULL AND utm_campaign IS NULL THEN NULL
			ELSE coalesce(utm_source, '') || coalesce(' · ' || utm_campaign, '') END`,
		landing: true
	},
	country: { title: 'Countries', key: 'country' },
	// with their country, so places of the same name stay apart
	region: { title: 'Regions', key: `region || ', ' || country` },
	city: { title: 'Cities', key: `city || ', ' || coalesce(region || ', ', '') || country` },
	device: { title: 'Devices', key: 'device' },
	browser: { title: 'Browsers', key: 'browser' },
	os: { title: 'Systems', key: 'os' },
	screen: { title: 'Screens', key: 'screen' },
	language: { title: 'Languages', key: 'language' },
	network: { title: 'Networks', key: 'org' },
	theme: { title: 'Theme', key: `CASE dark WHEN 1 THEN 'Dark' WHEN 0 THEN 'Light' END` }
} as const satisfies Record<string, { title: string; key: string; landing?: boolean }>;

export type Dimension = keyof typeof DIMENSIONS;

// Filters are the same as the dimensions, but "entry" is a page.
export type FilterKey = Exclude<Dimension, 'entry'>;
export type Filters = Partial<Record<FilterKey, string>>;

export const FILTER_KEYS = (Object.keys(DIMENSIONS) as Dimension[]).filter(
	(key): key is FilterKey => key !== 'entry'
);

export function readFilters(search: Record<string, unknown>): Filters {
	const filters: Filters = {};
	for (const key of FILTER_KEYS) {
		const value = search[key];
		if (typeof value === 'string' && value && value.length <= 300) filters[key] = value;
	}
	return filters;
}

// The headline numbers, each of which the chart can show over time.
export const METRICS = {
	visitors: { label: 'Visitors' },
	visits: { label: 'Visits' },
	views: { label: 'Page views' },
	duration: { label: 'Visit length' },
	bounce: { label: 'Left after 1 page' },
	returning: { label: 'Returning' }
} as const;

export type Metric = keyof typeof METRICS;

export function isMetric(value: unknown): value is Metric {
	return typeof value === 'string' && value in METRICS;
}
