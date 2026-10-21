import type { PieceRenderObject } from 'react-chessboard';

// A modern piece set drawn for this site. Every piece is a head set on the
// same tapered base, built from plain geometric shapes: white pieces in a fine
// outline, black pieces solid, so both read on the light and dark boards.

const INK = '#1d1d1f';
const PAPER = '#fbfbfb';
const LINE = 1.1;

const dot = (x: number, y: number, r: number) =>
	`M${x} ${y - r}a${r} ${r} 0 1 1 0 ${2 * r} ${r} ${r} 0 0 1 0-${2 * r}Z`;

// the shared base, its top lower for the pawn
const base = (top: number) => `M18.5 ${top}h8l3.5 ${36 - top}h-15Z`;

// `shapes` are filled in the piece's color, `cuts` are drawn across them in the
// other color, and `lines` are drawn in ink on either side.
const SHAPES: Record<string, { shapes: string[]; cuts?: string[]; lines?: string[] }> = {
	p: { shapes: [base(28.5), dot(22.5, 21, 5)] },
	r: {
		shapes: [base(27), 'M15 11.5h3.5v3h2.5v-3h3v3h2.5v-3H30v13H15Z']
	},
	b: {
		shapes: [base(27), dot(22.5, 18, 6.5)],
		cuts: ['M25.5 14.5 21 19']
	},
	n: {
		shapes: [
			base(27),
			'M28 24.5V16c0-4.5-3.5-7.5-8.5-7.5-2 0-2.5 1-1.5 2.5L13.5 16c-1 1-.5 2.5 1 2.5h5l-2 6Z'
		],
		cuts: ['M21.5 13h.01']
	},
	q: {
		shapes: [base(27), 'M15.5 24.5 13.5 12l5 5 4-8.5 4 8.5 5-5-2 12.5Z']
	},
	k: {
		shapes: [base(27), 'M15.5 14.5h14v7a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3Z'],
		lines: ['M22.5 5v6.5M19.5 8h6']
	}
};

function piece(type: string, white: boolean) {
	const { shapes, cuts = [], lines = [] } = SHAPES[type];
	const color = white ? PAPER : INK;
	const other = white ? INK : PAPER;
	return function Piece() {
		return (
			<svg viewBox="0 0 45 45" width="100%" height="100%">
				<g
					transform="translate(22.5 22.5) scale(1.18) translate(-22.5 -20.5)"
					stroke={INK}
					strokeWidth={LINE}
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					{shapes.map((d) => (
						<path key={d} d={d} fill={color} />
					))}
					{cuts.map((d) => (
						<path
							key={d}
							d={d}
							fill="none"
							stroke={other}
							strokeWidth={d.endsWith('h.01') ? 2.2 : LINE}
						/>
					))}
					{lines.map((d) => (
						<path key={d} d={d} fill="none" />
					))}
				</g>
			</svg>
		);
	};
}

export const PIECES: PieceRenderObject = {};
for (const type of Object.keys(SHAPES)) {
	PIECES[`w${type.toUpperCase()}`] = piece(type, true);
	PIECES[`b${type.toUpperCase()}`] = piece(type, false);
}
