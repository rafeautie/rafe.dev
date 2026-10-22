import { describe, expect, it } from 'vitest';
import { demoGame } from './demos';

describe('demoGame', () => {
	it('ends each game the way it says', () => {
		expect(demoGame('win')!.chess.isCheckmate()).toBe(true);
		expect(demoGame('win')!.chess.turn()).toBe('b');
		expect(demoGame('loss')!.chess.isCheckmate()).toBe(true);
		expect(demoGame('loss')!.chess.turn()).toBe('w');
		expect(demoGame('draw')!.chess.isStalemate()).toBe(true);
	});

	it('gives the model its thinking for each of its moves', () => {
		for (const demo of ['win', 'loss', 'draw'])
			for (const entry of demoGame(demo)!.entries)
				if (entry.by === 'ai') expect(entry.thinking).toBeTruthy();
	});

	it('ignores anything else', () => {
		expect(demoGame('lose')).toBeUndefined();
		expect(demoGame(null)).toBeUndefined();
	});
});
