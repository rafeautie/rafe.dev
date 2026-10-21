import type { Chess, Square } from 'chess.js';
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
	Chessboard,
	defaultAlphaNotationStyle,
	defaultNumericNotationStyle,
	type ChessboardOptions
} from 'react-chessboard';
import type { Mention } from '~/lib/chess/mentions';
import { cn } from '~/lib/utils';

import { PIECES } from './pieces';

// A mention on the board, and whether it's on its way out. A fading mark is
// drawn clear, and the browser eases it there over FADE_MS, so the fade is one
// smooth transition rather than a step on every tick.
export type Highlight = Mention & { fading: boolean };

export const FADE_MS = 1000;
const fadeOut = `${FADE_MS}ms ease-out`;
const accent = 'var(--chess-accent)';

// The board, drawn by react-chessboard from chess.js's position. Its colors
// come from --chess-* in styles/app.css, which follow the light and dark
// themes, and its pieces from ./pieces. Moves are made by dragging or by
// clicking a piece and then a square.

// The arrows are SVG, drawn in the board's text color, which is the accent.
const ARROW = 'currentColor';

export const squareTint = 'color-mix(in oklab, var(--chess-accent) 30%, transparent)';
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
export const targetDot = 'radial-gradient(circle, var(--chess-accent) 8%, transparent 10%)';

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
	onMove: (from: Square, to: Square, promotion?: Promotion) => boolean;
}) {
	const [selected, setSelected] = useState<Square>();
	// a pawn move to the last rank, waiting on which piece it becomes
	const [promoting, setPromoting] = useState<{ from: Square; to: Square }>();
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
		// the transition is only set while fading, so a new mark appears at once
		if (mention.kind === 'square') {
			style(mention.square, {
				boxShadow: `inset 0 0 0 3px ${mention.fading ? 'transparent' : accent}`,
				transition: mention.fading ? `box-shadow ${fadeOut}` : undefined
			});
		} else if (mention.kind === 'piece') {
			// a gradient can't be eased, but the color inside it can, as a
			// registered property (app.css)
			style(mention.square, {
				['--chess-glow' as string]: mention.fading ? 'transparent' : squareTint,
				backgroundImage: 'radial-gradient(circle, var(--chess-glow) 45%, transparent 70%)',
				transition: mention.fading ? `--chess-glow ${fadeOut}` : undefined
			});
		}
	}
	const arrows = mentions.flatMap((mention) =>
		mention.kind === 'arrow'
			? [
					{
						startSquare: mention.from,
						endSquare: mention.to,
						color: mention.fading ? 'transparent' : ARROW
					}
				]
			: []
	);

	// Plays the move, or for a pawn reaching the last rank, first asks what it
	// becomes. Until then the pawn stays where it was.
	function attempt(from: Square, to: Square) {
		const promotes = chess
			.moves({ square: from, verbose: true })
			.some((move) => move.to === to && move.promotion);
		if (!promotes) return onMove(from, to);
		setPromoting({ from, to });
		return false;
	}

	function click(square: Square) {
		if (!canMove) return;
		if (selected && targets.includes(square)) {
			setSelected(undefined);
			attempt(selected, square);
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
		// show where a piece can go while it's dragged, as when it's clicked
		onPieceDrag: ({ square }) => setSelected((square as Square | null) ?? undefined),
		onPieceDragCancel: () => setSelected(undefined),
		onPieceDrop: ({ sourceSquare, targetSquare }) => {
			setSelected(undefined);
			return !!targetSquare && attempt(sourceSquare as Square, targetSquare as Square);
		},
		onSquareClick: ({ square }) => click(square as Square)
	};

	return (
		<div className="chess-board relative text-(--chess-accent)">
			<Chessboard options={options} />
			{promoting && (
				<PromotionPicker
					square={promoting.to}
					color={chess.turn()}
					orientation={orientation}
					onPick={(piece) => {
						setPromoting(undefined);
						onMove(promoting.from, promoting.to, piece);
					}}
					onCancel={() => setPromoting(undefined)}
				/>
			)}
		</div>
	);
}

export type Promotion = 'q' | 'r' | 'b' | 'n';

const PROMOTIONS: { piece: Promotion; name: string }[] = [
	{ piece: 'q', name: 'queen' },
	{ piece: 'n', name: 'knight' },
	{ piece: 'r', name: 'rook' },
	{ piece: 'b', name: 'bishop' }
];

// The pieces a pawn can become, in a column running from the square it's
// promoting on back toward the middle of the board, over a dimmed board.
// Clicking off the column, or Escape, takes the move back.
function PromotionPicker({
	square,
	color,
	orientation,
	onPick,
	onCancel
}: {
	square: Square;
	color: 'w' | 'b';
	orientation: 'white' | 'black';
	onPick: (piece: Promotion) => void;
	onCancel: () => void;
}) {
	useEffect(() => {
		const key = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
		window.addEventListener('keydown', key);
		return () => window.removeEventListener('keydown', key);
	}, [onCancel]);

	const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
	const column = orientation === 'white' ? file : 7 - file;
	// the last rank is at the top of the board for the side at the bottom
	const fromTop = (orientation === 'white') === (color === 'w');
	return (
		<div
			role="dialog"
			aria-label="Promote the pawn to"
			className="absolute inset-0 z-10 rounded-lg bg-background/60"
			onClick={onCancel}
		>
			<div
				className={cn(
					'absolute flex w-1/8 overflow-hidden rounded-md bg-background shadow-lg ring-1 ring-foreground/10',
					fromTop ? 'top-0 flex-col' : 'bottom-0 flex-col-reverse'
				)}
				style={{ left: `${column * 12.5}%` }}
			>
				{PROMOTIONS.map(({ piece, name }, i) => {
					const Piece = PIECES[`${color}${piece.toUpperCase()}`];
					return (
						<button
							key={piece}
							type="button"
							aria-label={`Promote to ${name}`}
							autoFocus={i === 0}
							onClick={(event) => {
								event.stopPropagation();
								onPick(piece);
							}}
							className="aspect-square w-full outline-none hover:bg-(--chess-accent)/15 focus-visible:bg-(--chess-accent)/15"
						>
							<Piece />
						</button>
					);
				})}
			</div>
		</div>
	);
}
