import type { Chess, Square } from 'chess.js';
import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
	Chessboard,
	defaultAlphaNotationStyle,
	defaultNumericNotationStyle,
	type ChessboardOptions
} from 'react-chessboard';
import type { Mention } from '~/lib/chess/mentions';

// A mention on the board, and how strongly to draw it: 1 while fresh, down to
// 0 as it fades out.
export type Highlight = Mention & { strength: number };

const accent = 'var(--chess-accent)';
function faded(color: string, strength: number) {
	return strength >= 1
		? color
		: `color-mix(in oklab, ${color} ${Math.round(strength * 100)}%, transparent)`;
}
import { PIECES } from './pieces';

// The board, drawn by react-chessboard from chess.js's position. Its colors
// come from --chess-* in styles/app.css, which follow the light and dark
// themes, and its pieces from ./pieces. Moves are made by dragging or by
// clicking a piece and then a square.

// The arrows are SVG, drawn in the board's text color, which is the accent.
const ARROW = 'currentColor';

const squareTint = 'color-mix(in oklab, var(--chess-accent) 30%, transparent)';
// The coordinates, quiet on both squares. On a phone's small board they would
// run into the pieces, so they only show from this width up.
const coordinate = 'color-mix(in oklab, var(--chess-ink) 55%, transparent)';
const COORDINATES_FROM = '(min-width: 640px)';

function useWideEnough() {
	return useSyncExternalStore(
		(onChange) => {
			const query = window.matchMedia(COORDINATES_FROM);
			query.addEventListener('change', onChange);
			return () => query.removeEventListener('change', onChange);
		},
		() => window.matchMedia(COORDINATES_FROM).matches,
		() => true
	);
}
const targetDot = 'radial-gradient(circle, var(--chess-accent) 16%, transparent 18%)';

export function Board({
	chess,
	fen,
	orientation,
	canMove,
	lastMove,
	mentions,
	onMove
}: {
	chess: Chess;
	// the position to show; changes with every move
	fen: string;
	orientation: 'white' | 'black';
	canMove: boolean;
	lastMove?: { from: Square; to: Square };
	// what the model is thinking about right now
	mentions: Highlight[];
	onMove: (from: Square, to: Square) => boolean;
}) {
	const [selected, setSelected] = useState<Square>();
	const wide = useWideEnough();
	const targets =
		selected && canMove ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : [];

	const styles: Record<string, CSSProperties> = {};
	const style = (square: string, add: CSSProperties) => {
		styles[square] = { ...styles[square], ...add };
	};
	if (lastMove) {
		style(lastMove.from, { backgroundColor: squareTint });
		style(lastMove.to, { backgroundColor: squareTint });
	}
	if (selected && canMove) style(selected, { backgroundColor: squareTint });
	for (const square of targets) style(square, { backgroundImage: targetDot });
	for (const mention of mentions) {
		if (mention.kind === 'square') {
			style(mention.square, { boxShadow: `inset 0 0 0 3px ${faded(accent, mention.strength)}` });
		} else if (mention.kind === 'piece') {
			const tint = faded(squareTint, mention.strength);
			style(mention.square, {
				backgroundImage: `radial-gradient(circle, ${tint} 45%, transparent 70%)`
			});
		}
	}
	const arrows = mentions.flatMap((mention) =>
		mention.kind === 'arrow'
			? [
					{
						startSquare: mention.from,
						endSquare: mention.to,
						color: faded(ARROW, mention.strength)
					}
				]
			: []
	);

	function click(square: Square) {
		if (!canMove) return;
		if (selected && targets.includes(square)) {
			setSelected(undefined);
			onMove(selected, square);
			return;
		}
		const piece = chess.get(square);
		setSelected(piece && piece.color === chess.turn() && square !== selected ? square : undefined);
	}

	const options: ChessboardOptions = {
		id: 'chess',
		position: fen,
		pieces: PIECES,
		boardOrientation: orientation,
		allowDragging: canMove,
		allowDrawingArrows: false,
		arrows,
		squareStyles: styles,
		boardStyle: { borderRadius: '0.5rem', overflow: 'hidden' },
		lightSquareStyle: { backgroundColor: 'var(--chess-light)' },
		darkSquareStyle: { backgroundColor: 'var(--chess-dark)' },
		lightSquareNotationStyle: { color: coordinate },
		darkSquareNotationStyle: { color: coordinate },
		showNotation: wide,
		alphaNotationStyle: { ...defaultAlphaNotationStyle, fontSize: '12px' },
		numericNotationStyle: { ...defaultNumericNotationStyle, fontSize: '12px' },
		dropSquareStyle: { boxShadow: 'inset 0 0 0 3px var(--chess-accent)' },
		animationDurationInMs: 200,
		canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === chess.turn(),
		onPieceDrop: ({ sourceSquare, targetSquare }) => {
			setSelected(undefined);
			return !!targetSquare && onMove(sourceSquare as Square, targetSquare as Square);
		},
		onSquareClick: ({ square }) => click(square as Square)
	};

	return (
		<div className="chess-board text-(--chess-accent)">
			<Chessboard options={options} />
		</div>
	);
}
