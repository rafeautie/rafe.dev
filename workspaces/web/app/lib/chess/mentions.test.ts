import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { findConsidered } from './mentions';

function after(...moves: string[]) {
	const chess = new Chess();
	for (const move of moves) chess.move(move);
	return chess;
}

describe('findConsidered', () => {
	const chess = after('e4', 'e5', 'Nf3');

	it('reads each finished line, with its words on why', () => {
		const text = [
			'Considering:',
			'- Nc6 — guards the e5 pawn',
			'- d6 — also guards it',
			'Threat: Nxe5 — wins a pawn',
			'Move: Nc6'
		].join('\n');
		expect(findConsidered(text, chess).map(({ san, note, threat }) => [san, note, threat])).toEqual(
			[
				['Nc6', 'guards the e5 pawn', false],
				['d6', 'also guards it', false],
				['Nxe5', 'wins a pawn', true]
			]
		);
		expect(findConsidered(text, chess)[2].mention).toEqual({ kind: 'arrow', from: 'f3', to: 'e5' });
	});

	it('waits for a line to end, and skips moves that are not legal', () => {
		expect(findConsidered('Considering:\n- Nc6 — guards', chess)).toEqual([]);
		expect(findConsidered('Considering:\n- Qz9 — nonsense\n', chess)).toEqual([]);
		// a white move offered as one of black's own
		expect(findConsidered('Considering:\n- Nxe5 — wins\n', chess)).toEqual([]);
	});
});

describe('threats', () => {
	it('reads a threat for the side not to move', () => {
		const [threat] = findConsidered('Threat: Bc4 — eyes f7\n', after('e4'));
		expect(threat?.san).toBe('Bc4');
	});
});
