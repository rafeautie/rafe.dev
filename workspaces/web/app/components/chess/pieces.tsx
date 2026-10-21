import type { PieceRenderObject } from 'react-chessboard';

// The pieces are the "Chess Simple Assets" set from the Figma Community, one
// SVG per piece in assets/chess/pieces, named like react-chessboard's pieces
// (wK, bQ, …).
// https://www.figma.com/community/file/971870797656870866/chess-simple-assets

const FILES = import.meta.glob<string>('../../assets/chess/pieces/*.svg', {
	query: '?url',
	import: 'default',
	eager: true
});

export const PIECES: PieceRenderObject = {};
for (const [path, src] of Object.entries(FILES)) {
	const name = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
	PIECES[name] = function Piece() {
		// not draggable itself, so the board's own dragging takes over
		return <img src={src} alt="" draggable={false} className="size-full p-[7%] select-none" />;
	};
}
