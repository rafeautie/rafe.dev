import { describe, expect, it } from 'vitest';
import { BENCH_CASES, benchText, median, summarize, type BenchRow } from './bench';
import { checkAsk } from './reply';

const row = (reuse: boolean, totalMs: number): BenchRow => ({
	case: BENCH_CASES[0],
	reuse,
	totalMs,
	result: {
		id: 0,
		text: 'It rang like stone.',
		fields: { ACTION: 'heat' },
		speed: { promptTokens: 500, reusedTokens: 300, readMs: 100, writtenTokens: 20, writeMs: 400 }
	}
});

describe('the bench', () => {
	it('asks only well-formed requests, a dozen sharing one opening', () => {
		expect(BENCH_CASES).toHaveLength(12);
		for (const { ask } of BENCH_CASES) expect(checkAsk({ ...ask, id: 0 })).toBeUndefined();
		expect(new Set(BENCH_CASES.map(({ ask }) => ask.system)).size).toBe(1);
	});

	it('takes the median', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([])).toBeNaN();
	});

	it('sums up each way apart, by the median call', () => {
		const rows = [row(true, 500), row(true, 1500), row(true, 1000), row(false, 3000)];
		expect(summarize(rows, true)).toEqual({ calls: 3, medianMs: 1000, perMinute: 60 });
		expect(summarize(rows, false)).toEqual({ calls: 1, medianMs: 3000, perMinute: 20 });
		expect(summarize([], true)).toBeUndefined();
	});

	it('copies as plain text', () => {
		const text = benchText(['Model: Gemma 4 E2B'], [row(true, 1000), row(false, 2000)]);
		expect(text).toContain(
			'With prompt-start reuse: median 1000 ms per call, about 60 calls a minute'
		);
		expect(text).toContain(
			'Without prompt-start reuse: median 2000 ms per call, about 30 calls a minute'
		);
		expect(text).toContain('It rang like stone. / ACTION: heat');
	});
});
