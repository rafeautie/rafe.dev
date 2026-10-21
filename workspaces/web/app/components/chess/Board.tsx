import type { Chess, Square } from 'chess.js';
import { useState, type CSSProperties } from 'react';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import type { Mention } from '~/lib/chess/mentions';

// The board, drawn by react-chessboard from chess.js's position. Its colors
// come from --chess-* in styles/app.css, which follow the light and dark
// themes. Moves are made by dragging or by clicking a piece and then a square.

// SVG arrows can't read CSS variables, so this one gray has to read on both
// the light and dark boards.
const ARROW = 'rgb(128 128 128 / 0.75)';

const squareTint = 'color-mix(in oklab, var(--chess-mark) 22%, transparent)';
const targetDot = `radial-gradient(circle, ${squareTint} 22%, transparent 24%)`;

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
	mentions: Mention[];
	onMove: (from: Square, to: Square) => boolean;
}) {
	const [selected, setSelected] = useState<Square>();
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
			style(mention.square, { boxShadow: 'inset 0 0 0 3px var(--chess-mark)' });
		} else if (mention.kind === 'piece') {
			style(mention.square, {
				backgroundImage: `radial-gradient(circle, ${squareTint} 45%, transparent 70%)`
			});
		}
	}
	const arrows = mentions.flatMap((mention) =>
		mention.kind === 'arrow'
			? [{ startSquare: mention.from, endSquare: mention.to, color: ARROW }]
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
		boardOrientation: orientation,
		allowDragging: canMove,
		allowDrawingArrows: false,
		arrows,
		squareStyles: styles,
		boardStyle: { borderRadius: '0.5rem', overflow: 'hidden' },
		lightSquareStyle: { backgroundColor: 'var(--chess-light)' },
		darkSquareStyle: { backgroundColor: 'var(--chess-dark)' },
		lightSquareNotationStyle: { color: 'var(--chess-ink)' },
		darkSquareNotationStyle: { color: 'var(--chess-ink)' },
		dropSquareStyle: { boxShadow: 'inset 0 0 0 3px var(--chess-mark)' },
		animationDurationInMs: 200,
		canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === chess.turn(),
		onPieceDrop: ({ sourceSquare, targetSquare }) => {
			setSelected(undefined);
			return !!targetSquare && onMove(sourceSquare as Square, targetSquare as Square);
		},
		onSquareClick: ({ square }) => click(square as Square)
	};

	return (
		<div className="chess-board">
			<Chessboard options={options} />
		</div>
	);
}
