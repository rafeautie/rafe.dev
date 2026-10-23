// What a User-Agent string says about the browser, the system and the kind of
// device, in the names people use. Good enough for counting, not for sniffing:
// newer Chrome-based browsers report a frozen version, and unknown ones fall
// through to the engine they are built on.

export type Agent = { browser: string; version: string; os: string; device: string };

const BROWSERS: [string, RegExp][] = [
	['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
	['Opera', /(?:OPR|Opera)\/([\d.]+)/],
	['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
	['Vivaldi', /Vivaldi\/([\d.]+)/],
	['Brave', /Brave\/([\d.]+)/],
	['DuckDuckGo', /DuckDuckGo\/([\d.]+)/],
	['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
	['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
	['Safari', /Version\/([\d.]+).*Safari\//]
];

const SYSTEMS: [string, RegExp][] = [
	['iOS', /iPhone|iPad|iPod/],
	['Android', /Android/],
	['ChromeOS', /CrOS/],
	['Windows', /Windows/],
	['macOS', /Mac OS X|Macintosh/],
	['Linux', /Linux/]
];

// Crawlers, link previews and test browsers, which are not people.
export const BOT =
	/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|python|curl|wget/i;

export function readAgent(ua: string): Agent {
	let browser = 'Other';
	let version = '';
	for (const [name, pattern] of BROWSERS) {
		const match = ua.match(pattern);
		if (match) {
			browser = name;
			version = match[1].split('.')[0];
			break;
		}
	}
	// apps' own web views (Instagram, LinkedIn) say so, and are worth knowing
	const app = ua.match(/\b(Instagram|LinkedInApp|FBAN|FBAV|Twitter|TikTok)\b/);
	if (app) {
		browser = { FBAN: 'Facebook', FBAV: 'Facebook', LinkedInApp: 'LinkedIn' }[app[1]] ?? app[1];
		version = '';
	}
	const os = SYSTEMS.find(([, pattern]) => pattern.test(ua))?.[0] ?? 'Other';
	const device = /iPad|Tablet|(Android(?!.*Mobile))/.test(ua)
		? 'Tablet'
		: /Mobi|iPhone|iPod|Android/.test(ua)
			? 'Phone'
			: 'Desktop';
	return { browser, version, os, device };
}
