import type { PieceRenderObject } from 'react-chessboard';

// The pieces are the "Chess Simple Assets" set from the Figma Community, one
// SVG per piece in assets/chess/pieces, named like react-chessboard's pieces
// (wK, bQ, …).
// https://www.figma.com/community/file/971870797656870866/chess-simple-assets

const FILES = import.meta.glob<string>('../../assets/chess/pieces/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
});

// Drawn inline rather than as images, so the outline (each SVG's first path,
// the silhouette the body sits on) can take the accent when the model
// mentions the piece: --chess-mark, set on its square (Board.tsx), mixes it in.
// --chess-mark-color takes another color instead, like a king in check's.
function markable(svg: string) {
	return svg
		.replace(
			/fill="(#[0-9a-f]{6})"/i,
			'style="fill: color-mix(in oklab, var(--chess-mark-color, var(--chess-accent)) var(--chess-mark), $1)"'
		)
		.replace(/width="72" height="72"/, 'width="100%" height="100%"');
}

export const PIECES: PieceRenderObject = {};
for (const [path, svg] of Object.entries(FILES)) {
	const name = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
	const html = { __html: markable(svg) };
	PIECES[name] = function Piece() {
		return (
			<span
				aria-hidden
				className="block size-full p-[7%] select-none [&>svg]:block"
				dangerouslySetInnerHTML={html}
			/>
		);
	};
}
