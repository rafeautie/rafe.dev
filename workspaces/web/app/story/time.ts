// A new chapter comes out at noon in California, whatever the reader's own
// time zone, and the clocks there move twice a year.
export const ZONE = 'America/Los_Angeles';

const PARTS = new Intl.DateTimeFormat('en-US', {
	timeZone: ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	hourCycle: 'h23'
});

function parts(at: Date) {
	const get = (type: string) => PARTS.formatToParts(at).find((part) => part.type === type)!.value;
	return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

// yyyy-mm-dd, as a calendar in California reads at that instant
export function pacificDate(at: Date): string {
	return parts(at).date;
}

export function pacificHour(at: Date): number {
	return parts(at).hour;
}

function addDays(date: string, days: number): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Noon on a California calendar date: 19:00 UTC under daylight saving time,
// 20:00 UTC otherwise.
export function noonOn(date: string): Date {
	const [y, m, d] = date.split('-').map(Number);
	for (const offset of [7, 8]) {
		const candidate = new Date(Date.UTC(y, m - 1, d, 12 + offset));
		if (pacificHour(candidate) === 12) return candidate;
	}
	throw new Error(`no noon on ${date}`);
}

// The first noon after `at`; noon itself counts as passed.
export function nextNoon(at: Date): Date {
	const today = noonOn(pacificDate(at));
	return at < today ? today : noonOn(addDays(pacificDate(at), 1));
}

// The last noon at or before `at`.
export function previousNoon(at: Date): Date {
	const today = noonOn(pacificDate(at));
	return at >= today ? today : noonOn(addDays(pacificDate(at), -1));
}
