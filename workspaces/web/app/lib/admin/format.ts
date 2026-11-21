// How every admin page writes a count, a share and an error; times and
// dates are in time.ts beside it.

export const NUMBER = new Intl.NumberFormat('en-US');
export const PERCENT = new Intl.NumberFormat('en-US', {
	style: 'percent',
	maximumFractionDigits: 0
});

// "1 photo", "1,204 photos"
export const plural = (n: number, one: string, many = `${one}s`) =>
	`${NUMBER.format(n)} ${n === 1 ? one : many}`;

// What went wrong, as a page says it.
export function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong';
}
