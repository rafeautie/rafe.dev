const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const LONG_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
	['minute', 60],
	['hour', 60],
	['day', 24]
];

// "just now", "5 minutes ago", "yesterday", then "Oct 19".
export function timeAgo(iso: string, now = Date.now()) {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return '';
	let value = (now - then) / 1000;
	if (value < 60) return 'just now';
	for (const [unit, size] of STEPS) {
		value /= size;
		const next = STEPS[STEPS.findIndex(([name]) => name === unit) + 1];
		if (!next || value < next[1]) {
			if (unit === 'day' && value >= 7) break;
			return RELATIVE.format(-Math.floor(value), unit);
		}
	}
	return SHORT_DATE.format(then);
}

// A post date (yyyy-mm-dd) as /writing shows it.
export function formatPostDate(date: string) {
	return date ? LONG_DATE.format(new Date(date)) : '';
}

// Today in the reader's own calendar, yyyy-mm-dd.
export function today() {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
