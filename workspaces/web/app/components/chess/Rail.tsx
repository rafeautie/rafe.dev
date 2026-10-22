import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DicesIcon } from 'lucide-react';
import type { Move } from 'chess.js';
import { PIECES } from '~/components/chess/pieces';
import { Card } from '~/components/ui/card';
import { describeMove } from '~/lib/chess/describe';
import type { Entry, Speed } from '~/lib/chess/storage';
import { cn } from '~/lib/utils';

// The pieces of the rail beside the board on /chess.

// the main action (Play, Rematch) in the page's accent
export const ACCENT_BUTTON = 'bg-(--chess-accent) text-white hover:bg-(--chess-accent)/90';

export function Section({
	label,
	action,
	className,
	children
}: {
	label: string;
	className?: string;
	// a small control at the far end of the header's rule
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className={cn('flex flex-col gap-2', className)}>
			<div className="flex items-center gap-3 text-sm text-foreground/50">
				<h2>{label}</h2>
				<span className="h-px flex-1 bg-foreground/10" />
				{action}
			</div>
			{children}
		</section>
	);
}

// A labelled on/off switch. `hint` sits just after the label, for a small
// control of its own (like an info button), so it isn't inside the switch.
export function Switch({
	label,
	checked,
	onChange,
	hint
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	hint?: ReactNode;
}) {
	const id = useId();
	return (
		<div className="flex items-center justify-between gap-3 text-sm text-foreground/70 has-[button[role=switch]:hover]:text-foreground">
			<span className="flex items-center gap-1">
				<label htmlFor={id} className="cursor-pointer hover:text-foreground">
					{label}
				</label>
				{hint}
			</span>
			<button
				id={id}
				type="button"
				role="switch"
				aria-checked={checked}
				onClick={() => onChange(!checked)}
				className={cn(
					'relative h-4 w-7 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
					checked ? 'bg-(--chess-accent)' : 'bg-foreground/15'
				)}
			>
				<span
					className={cn(
						'absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform',
						checked && 'translate-x-3'
					)}
				/>
			</button>
		</div>
	);
}

// A quiet pulsing dot, for "thinking" and "downloading"
export function Pulse() {
	return (
		<span className="relative flex size-2">
			<span className="absolute inline-flex size-full rounded-full bg-(--chess-accent)/50 motion-safe:animate-ping" />
			<span className="relative inline-flex size-2 rounded-full bg-(--chess-accent)" />
		</span>
	);
}

// What the model's move did beyond moving, like taking a piece or giving
// check, one card each, all the same size however much a move does
function MoveCards({ move, random }: { move: Move; random?: boolean }) {
	const { notes } = describeMove(move);
	const other = move.color === 'w' ? 'b' : 'w';
	return (
		<div className="flex w-full flex-col gap-1.5">
			{notes.map((note) => {
				// a check or mate is the king's color on the board, outline too
				const king =
					note.kind === 'checkmate'
						? move.color === 'w'
							? 'var(--chess-mated-it)'
							: 'var(--chess-mated-you)'
						: note.kind === 'check'
							? 'var(--chess-check)'
							: undefined;
				return (
					<NoteCard
						key={note.kind}
						icon={
							<PieceTile
								small
								mark={king}
								piece={`${note.kind === 'promotion' ? move.color : other}${note.piece!.toUpperCase()}`}
							/>
						}
						color={king ?? 'var(--chess-accent)'}
					>
						{note.text}
					</NoteCard>
				);
			})}
			{random && (
				<NoteCard
					icon={
						<span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
							<DicesIcon className="size-4" />
						</span>
					}
					title="Its answers weren't legal moves, so this one was picked at random"
				>
					<span className="text-muted-foreground">Random move</span>
				</NoteCard>
			)}
		</div>
	);
}

function PieceTile({
	piece,
	small = false,
	mark
}: {
	piece: string;
	small?: boolean;
	mark?: string;
}) {
	const Piece = PIECES[piece];
	return (
		<span
			className={cn('shrink-0 rounded-md bg-foreground/5', small ? 'size-6' : 'size-10')}
			style={
				mark ? ({ '--chess-mark': '100%', '--chess-mark-color': mark } as CSSProperties) : undefined
			}
		>
			<Piece />
		</span>
	);
}

// What its move did, in the accent, or for a check or mate the king's color on
// the board (Board.tsx, kingMark); the random-move note stays quiet
function NoteCard({
	icon,
	color,
	title,
	children
}: {
	icon: ReactNode;
	color?: string;
	title?: string;
	children: ReactNode;
}) {
	return (
		<Card
			size="sm"
			title={title}
			className={cn(
				'h-10 w-full flex-row items-center gap-3 px-3 py-0',
				color && 'bg-(--note)/5 text-(--note) ring-(--note)/40'
			)}
			style={color ? ({ '--note': color } as CSSProperties) : undefined}
		>
			<span className="flex shrink-0 justify-center">{icon}</span>
			<p className="truncate">{children}</p>
		</Card>
	);
}

// Its thinking as plain text: without the move it gives at the end, and with
// moves it wrote as math in games from before ($\text{f5}$) as just the move
function plain(text: string) {
	return text
		.replace(/\s*move\s*:[^\n]*$/i, '')
		.replace(/\$\\text\{([^}]*)\}\$/g, '$1')
		.replace(/\$([^$\n]*)\$/g, '$1')
		.trim();
}

// One turn of the model's: what it's doing (or did), its thinking as it
// writes it, and once it has moved, what its move did.
export function Generation({
	status,
	text,
	missed,
	speed,
	move,
	random
}: {
	status: ReactNode;
	text?: string;
	missed?: string[];
	speed?: Speed;
	move?: Move;
	random?: boolean;
}) {
	// As it writes, the newest words stay in view, unless you've scrolled up
	// to read back; scrolling down to the end again picks it back up
	const scroller = useRef<HTMLDivElement>(null);
	const pinned = useRef(true);
	useEffect(() => {
		const el = scroller.current;
		if (el && pinned.current) el.scrollTop = el.scrollHeight;
	}, [text, move]);

	return (
		<div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
			{status}
			{/* on a phone the page doesn't grow with it: it scrolls in its own
			    few lines, under the board */}
			<div
				ref={scroller}
				onScroll={(event) => {
					const el = event.currentTarget;
					pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
				}}
				className="-mx-1 no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-px max-xl:max-h-48"
			>
				{text && <p className="text-sm whitespace-pre-wrap text-foreground/70">{plain(text)}</p>}
				{missed?.map((answer, k) => (
					<p key={k} className="text-sm text-foreground/60 italic">
						{answer.startsWith('an error: ')
							? `Its reply failed: ${answer.slice('an error: '.length)}`
							: `Answered “${answer}”, which isn’t a legal move.`}
					</p>
				))}
				{move && (
					<div className="flex flex-col gap-2">
						<MoveCards move={move} random={random} />
						{speed && (
							<p className="text-xs text-foreground/40 tabular-nums">
								Read {speed.prompt} tokens in {speed.reading.toFixed(1)}s · wrote {speed.written} in{' '}
								{speed.writing.toFixed(1)}s
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

const PREVIEW_DELAY_MS = 300;

// The game so far, two moves to a row. Pointing at a row (or focusing it, or
// tapping it) previews it: the board shows the position after it, and the
// rail the model's turn in it.
export function MoveList({
	entries,
	preview,
	onPreview,
	onTap
}: {
	entries: Entry[];
	preview?: number;
	onPreview: (row?: number) => void;
	// a row tapped on a touch screen, where there's no pointing first
	onTap?: () => void;
}) {
	const end = useRef<HTMLLIElement>(null);
	useEffect(() => {
		end.current?.scrollIntoView({ block: 'nearest' });
	}, [entries.length]);

	// The row lights up as soon as it's pointed at, but the board waits a
	// moment, so passing over the list on the way somewhere doesn't flick
	// through old positions. Once it's showing one, the next row is instant.
	const [pointed, setPointed] = useState<number>();
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const point = (row?: number) => {
		clearTimeout(timer.current);
		setPointed(row);
		if (row === undefined || preview !== undefined) onPreview(row);
		else timer.current = setTimeout(() => onPreview(row), PREVIEW_DELAY_MS);
	};

	if (!entries.length) return <p className="text-sm text-foreground/40">No moves yet.</p>;

	const rows: Entry[][] = [];
	for (let i = 0; i < entries.length; i += 2) rows.push(entries.slice(i, i + 2));

	return (
		// the list scrolls in the space it's given, but the preview ends as soon
		// as the pointer leaves the rows themselves
		<div className="-mx-2 max-h-72 overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
			<ol
				// pointing only: a tap is a click, and the page scrolling after it
				// would count as leaving
				onPointerLeave={(event) => event.pointerType !== 'touch' && point(undefined)}
				className="flex flex-col gap-0.5 text-sm tabular-nums"
			>
				{rows.map((row, i) => (
					<li
						key={i}
						ref={i === rows.length - 1 ? end : undefined}
						tabIndex={0}
						aria-current={preview === i ? 'true' : undefined}
						onPointerEnter={(event) => event.pointerType !== 'touch' && point(i)}
						onFocus={() => {
							setPointed(i);
							onPreview(i);
						}}
						onBlur={() => point(undefined)}
						onClick={(event) => {
							clearTimeout(timer.current);
							onPreview(i);
							if ((event.nativeEvent as PointerEvent).pointerType === 'touch') onTap?.();
						}}
						className={cn(
							'grid cursor-default grid-cols-[2rem_1fr_1fr] gap-2 rounded-md px-2 py-1 ring-1 ring-transparent transition-[background-color,box-shadow] duration-200 outline-none ring-inset max-xl:py-2',
							// on at once, off gently
							(pointed ?? preview) === i && 'bg-foreground/5 ring-foreground/10 duration-0'
						)}
					>
						<span className="text-foreground/40">{i + 1}.</span>
						{row.map((entry, j) => (
							<span key={j} className="flex items-center gap-1.5">
								{entry.san}
								{entry.random && (
									<span
										title="Random move: it didn't give a legal move"
										className="rounded border border-foreground/20 px-1 text-[0.65rem] text-foreground/50"
									>
										random
									</span>
								)}
							</span>
						))}
					</li>
				))}
			</ol>
		</div>
	);
}
