import type { PieceRenderObject } from 'react-chessboard';

// A flat, minimal piece set drawn for this site: white pieces are outlined,
// black pieces are solid, and both read on the light and dark boards.

const INK = '#1d1d1f';
const PAPER = '#fbfbfb';

const BASE =
	'M12.5 33.5h20a1.5 1.5 0 0 1 1.5 1.5v1.5a1.5 1.5 0 0 1-1.5 1.5h-20a1.5 1.5 0 0 1-1.5-1.5V35a1.5 1.5 0 0 1 1.5-1.5Z';
const SKIRT = 'M14.5 33.5 15.5 29h14l1 4.5Z';
const dot = (x: number, y: number, r: number) =>
	`M${x} ${y - r}a${r} ${r} 0 1 1 0 ${2 * r} ${r} ${r} 0 0 1 0-${2 * r}Z`;

// Each piece is filled shapes plus fine lines drawn in the opposite color.
const SHAPES: Record<string, { shapes: string[]; lines?: string[] }> = {
	p: {
		shapes: [BASE, 'M17.5 33.5C18 28 19 24 20 21.5h5c1 2.5 2 6.5 2.5 12Z', dot(22.5, 15.5, 5)]
	},
	r: {
		shapes: [
			BASE,
			'M15 33.5 16.5 19h12L30 33.5Z',
			'M13.5 10h3.5v3h3.5v-3h4v3h3.5v-3H31v8.5a1 1 0 0 1-1 1H14.5a1 1 0 0 1-1-1Z'
		]
	},
	b: {
		shapes: [
			BASE,
			'M16 33.5 17.5 27h10l1.5 6.5Z',
			'M22.5 9.5c5 4 7.5 9.5 5.5 15.5H17c-2-6 .5-11.5 5.5-15.5Z',
			dot(22.5, 7, 2)
		],
		lines: ['M25 14.5 20.5 19']
	},
	n: {
		shapes: [
			BASE,
			'M30 33.5H15.5c0-5 2.5-8 6.5-11.5-3 .5-6 1-8.5-.5-1.5-1-1.2-3.2.5-5L19 11.5v-4l3 3c6.5 0 10.5 5.5 9.5 13-.4 3.4-1.5 6.5-1.5 10Z'
		],
		lines: ['M19.5 15.5h.01']
	},
	q: {
		shapes: [
			BASE,
			SKIRT,
			'M12.5 14.5 16 27h13l3.5-12.5-6 6.5-4-10-4 10Z',
			dot(12.5, 13.5, 2),
			dot(22.5, 10, 2),
			dot(32.5, 13.5, 2)
		]
	},
	k: {
		shapes: [
			BASE,
			SKIRT,
			'M13.5 19c0-2.5 4-4 9-4s9 1.5 9 4L29 27H16Z',
			'M21.5 5h2v3h3v2h-3v4h-2v-4h-3V8h3Z'
		]
	}
};

function piece(type: string, white: boolean) {
	const { shapes, lines = [] } = SHAPES[type];
	return function Piece() {
		return (
			<svg viewBox="0 0 45 45" width="100%" height="100%">
				<g transform="translate(22.5 22) scale(1.1) translate(-22.5 -22)">
					{shapes.map((d) => (
						<path
							key={d}
							d={d}
							fill={white ? PAPER : INK}
							stroke={INK}
							strokeWidth={1.5}
							strokeLinejoin="round"
						/>
					))}
					{lines.map((d) => (
						<path
							key={d}
							d={d}
							fill="none"
							stroke={white ? INK : PAPER}
							strokeWidth={d.endsWith('h.01') ? 2.6 : 1.5}
							strokeLinecap="round"
						/>
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
