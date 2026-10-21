import type { PieceRenderObject } from 'react-chessboard';

// A minimal piece set drawn for this site: each piece is one flat shape, with
// white pieces in a fine outline and black pieces solid, so both read on the
// light and dark boards.

const INK = '#1d1d1f';
const PAPER = '#fbfbfb';
const LINE = 1.1;

const dot = (x: number, y: number, r: number) =>
	`M${x} ${y - r}a${r} ${r} 0 1 1 0 ${2 * r} ${r} ${r} 0 0 1 0-${2 * r}Z`;

// `shapes` are filled in the piece's color, `cuts` are drawn across them in the
// other color, and `lines` are drawn in ink on either side.
const SHAPES: Record<string, { shapes: string[]; cuts?: string[]; lines?: string[] }> = {
	p: {
		shapes: ['M16 36c.5-7 3-12 5-15h3c2 3 4.5 8 5 15Z', dot(22.5, 15.5, 4.5)]
	},
	r: {
		shapes: ['M15 36l1.5-17h-3v-8H17v3h3.5v-3h4v3H28v-3h3.5v8h-3L30 36Z']
	},
	b: {
		shapes: [
			'M22.5 9.5c5.5 4 7.5 10 4.5 15.5l2.5 11h-14l2.5-11c-3-5.5-1-11.5 4.5-15.5Z',
			dot(22.5, 6.5, 1.8)
		],
		cuts: ['M24.8 15 21 18.8']
	},
	n: {
		shapes: [
			'M30 36H15.5c0-5.5 2.5-9 6.5-12.5-3 .5-6 1-8.5-.5-1.5-1-1.2-3.2.5-5L19 13V8.5l3 3c6.5 0 10.5 5.5 9.5 13-.4 3.4-1.5 7-1.5 11.5Z'
		],
		cuts: ['M19.5 16.5h.01']
	},
	q: {
		shapes: [
			'M15 36l1.5-9-4-12.5 6 6.5 4-10 4 10 6-6.5-4 12.5 1.5 9Z',
			dot(12.5, 13, 1.6),
			dot(22.5, 9.5, 1.6),
			dot(32.5, 13, 1.6)
		]
	},
	k: {
		shapes: ['M15.5 36l1-9-3-8c0-2.5 4-4 9-4s9 1.5 9 4l-3 8 1 9Z'],
		lines: ['M22.5 5.5V15M19.5 8.5h6']
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
					transform="translate(22.5 23.5) scale(1.1) translate(-22.5 -21)"
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
