// The offset of a time zone from UTC at a moment, in milliseconds.
export function zoneOffset(timeZone: string, at: number) {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric'
		}).formatToParts(at);
		const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
		const local = Date.UTC(
			part('year'),
			part('month') - 1,
			part('day'),
			part('hour'),
			part('minute')
		);
		return local - Math.floor(at / 60000) * 60000;
	} catch {
		return 0;
	}
}
