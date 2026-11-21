import type { Row } from './report';

// How people find the site, from where each visit came from (the sources
// breakdown): typed in or bookmarked, searched for, shared on a social site,
// or linked from some other site. Sources are hosts without www
// (lib/stats/beacon.ts), or "Direct" for none.

export type Arrival = 'direct' | 'search' | 'social' | 'link';

export const ARRIVALS: Record<Arrival, string> = {
	direct: 'direct',
	search: 'search',
	social: 'social',
	link: 'other sites'
};

// search engines and answer engines, by the name in their host, so every
// country's Google (google.co.uk, google.de) counts
const SEARCH = new Set([
	'google',
	'bing',
	'duckduckgo',
	'yahoo',
	'ecosia',
	'kagi',
	'baidu',
	'yandex',
	'startpage',
	'qwant',
	'brave',
	'perplexity',
	'chatgpt'
]);

// social sites and link aggregators, by host or any host under it
// (old.reddit.com, m.facebook.com)
const SOCIAL = [
	't.co',
	'x.com',
	'twitter.com',
	'bsky.app',
	'threads.net',
	'mastodon.social',
	'linkedin.com',
	'lnkd.in',
	'facebook.com',
	'instagram.com',
	'reddit.com',
	'youtube.com',
	'tiktok.com',
	'news.ycombinator.com',
	'lobste.rs'
];

export function arrivalOf(source: string): Arrival {
	if (source === 'Direct') return 'direct';
	const host = source.toLowerCase();
	if (SOCIAL.some((site) => host === site || host.endsWith(`.${site}`))) return 'social';
	if (host.split('.').some((part) => SEARCH.has(part))) return 'search';
	return 'link';
}

// The sources added up by how they arrived, most first. A visitor who came
// two ways counts in both, as in the sources themselves.
export function arrivals(sources: Row[]): Row[] {
	const totals = new Map<Arrival, Row>();
	for (const row of sources) {
		const kind = arrivalOf(row.key);
		const total = totals.get(kind) ?? { key: kind, label: ARRIVALS[kind], visitors: 0, views: 0 };
		total.visitors += row.visitors;
		total.views += row.views;
		totals.set(kind, total);
	}
	return [...totals.values()].sort((a, b) => b.visitors - a.visitors);
}
