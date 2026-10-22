import { useEffect, useId, useRef, type ReactNode } from 'react';
import { DicesIcon } from 'lucide-react';
import type { Move } from 'chess.js';
import { PIECES } from '~/components/chess/pieces';
import { Card } from '~/components/ui/card';
import { describeMove } from '~/lib/chess/describe';
import { CONSIDERING } from '~/lib/chess/prompt';
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

// The move the model chose, in words: a card with the piece, where it went and
// from where, and under it one card for each other thing it did, like taking a
// piece or giving check. Every card is the same width, and every note card the
// same height, however much a move does.
function MoveCards({ move, random }: { move: Move; random?: boolean }) {
	const { title, from, notes } = describeMove(move);
	const other = move.color === 'w' ? 'b' : 'w';
	return (
		<div className="flex w-full flex-col gap-1.5">
			<Card size="sm" className="h-16 w-full flex-row items-center gap-3 px-3 py-0">
				<PieceTile piece={`${move.color}${move.piece.toUpperCase()}`} />
				<div className="flex min-w-0 flex-col gap-0.5">
					<p className="truncate leading-tight font-medium">{title}</p>
					<p className="truncate text-xs text-muted-foreground">
						{from ? `${from} · ` : ''}
						{move.san}
					</p>
				</div>
			</Card>
			{notes.map((note) => (
				<NoteCard
					key={note.kind}
					icon={
						<PieceTile
							small
							piece={`${note.kind === 'promotion' ? move.color : other}${note.piece!.toUpperCase()}`}
						/>
					}
					tone={
						note.kind === 'capture' ? 'highlight' : note.kind === 'promotion' ? undefined : 'accent'
					}
				>
					{note.text}
				</NoteCard>
			))}
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

function PieceTile({ piece, small = false }: { piece: string; small?: boolean }) {
	const Piece = PIECES[piece];
	return (
		<span className={cn('shrink-0 rounded-md bg-foreground/5', small ? 'size-6' : 'size-10')}>
			<Piece />
		</span>
	);
}

// `accent` colors the words (check, checkmate); `highlight` colors the whole
// card (a capture)
function NoteCard({
	icon,
	tone,
	title,
	children
}: {
	icon: ReactNode;
	tone?: 'accent' | 'highlight';
	title?: string;
	children: ReactNode;
}) {
	return (
		<Card
			size="sm"
			title={title}
			className={cn(
				'h-10 w-full flex-row items-center gap-3 px-3 py-0',
				tone && 'text-(--chess-accent)',
				tone === 'highlight' && 'bg-(--chess-accent)/5 ring-(--chess-accent)/40'
			)}
		>
			{/* as wide as the piece on the move card above, so the words line up */}
			<span className="flex w-10 shrink-0 justify-center">{icon}</span>
			<p className="truncate">{children}</p>
		</Card>
	);
}

// What the model wrote while considering its move (prompt.ts, CONSIDERING),
// read line by line as it streams: its candidates, the threat it sees, and
// anything else, like the free thinking of games from before.
type Line =
	| { kind: 'candidate' | 'threat'; san: string; reason?: string }
	| { kind: 'text'; text: string };

function readLines(text: string): Line[] {
	const lines: Line[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		// the move it played shows in the cards below instead
		if (!line || line === CONSIDERING.heading.trim() || /^move\s*:/i.test(line)) continue;
		const threat = line.startsWith(CONSIDERING.threat.trim());
		const bullet = line.startsWith(CONSIDERING.bullet.trim());
		if (threat || bullet) {
			const rest = line.slice((threat ? CONSIDERING.threat : CONSIDERING.bullet).trim().length);
			const [san, ...reason] = rest.split(CONSIDERING.dash.trim());
			lines.push({
				kind: threat ? 'threat' : 'candidate',
				san: san.trim(),
				// a reason may stop at the end of a phrase (ai.worker.ts, LineEnd)
				reason:
					reason
						.join(CONSIDERING.dash.trim())
						.trim()
						.replace(/[\s.,;—–-]+$/, '') || undefined
			});
		} else lines.push({ kind: 'text', text: line });
	}
	return lines;
}

// One turn of the model's: what it's doing (or did), the moves it weighed as
// they come, and once it has moved, the cards for its move at the foot.
export function Generation({
	status,
	text,
	chosen,
	missed,
	speed,
	move,
	random
}: {
	status: ReactNode;
	text?: string;
	// the move it played, once it has
	chosen?: string;
	missed?: string[];
	speed?: Speed;
	move?: Move;
	random?: boolean;
}) {
	const lines = readLines(text ?? '');
	return (
		<div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
			{status}
			<div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
				{lines.length > 0 && (
					<ul className="flex flex-col gap-2 text-sm">
						{lines.map((line, k) =>
							line.kind === 'text' ? (
								<li key={k} className="text-foreground/70">
									{line.text}
								</li>
							) : (
								<li
									key={k}
									className={cn(
										'grid animate-in grid-cols-[3.5rem_1fr] gap-2 transition-colors duration-300 fade-in',
										line.kind === 'threat' && 'text-(--chess-threat)',
										chosen && line.kind === 'candidate' && line.san !== chosen && 'opacity-60'
									)}
								>
									<span className="font-medium tabular-nums">
										{line.kind === 'threat' ? <span className="sr-only">Threat: </span> : null}
										{line.san}
									</span>
									<span
										className={cn(
											line.kind === 'threat' ? 'opacity-80' : 'text-foreground/70',
											chosen === line.san && line.kind === 'candidate' && 'text-foreground'
										)}
									>
										{line.kind === 'threat' && <span className="mr-1 font-medium">threat ·</span>}
										{line.reason ?? '…'}
									</span>
								</li>
							)
						)}
					</ul>
				)}
				{missed?.map((answer, k) => (
					<p key={k} className="text-sm text-foreground/60 italic">
						{answer.startsWith('an error: ')
							? `Its reply failed: ${answer.slice('an error: '.length)}`
							: `Answered “${answer}”, which isn’t a legal move.`}
					</p>
				))}
				{move && (
					<div className="mt-auto flex flex-col gap-2">
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

// The game so far, two moves to a row. Pointing at a row (or focusing it, or
// tapping it) previews it: the board shows the position after it, and the
// rail the model's turn in it.
export function MoveList({
	entries,
	preview,
	onPreview
}: {
	entries: Entry[];
	preview?: number;
	onPreview: (row?: number) => void;
}) {
	const end = useRef<HTMLLIElement>(null);
	useEffect(() => {
		end.current?.scrollIntoView({ block: 'nearest' });
	}, [entries.length]);

	if (!entries.length) return <p className="text-sm text-foreground/40">No moves yet.</p>;

	const rows: Entry[][] = [];
	for (let i = 0; i < entries.length; i += 2) rows.push(entries.slice(i, i + 2));

	return (
		// the list scrolls in the space it's given, but the preview ends as soon
		// as the pointer leaves the rows themselves
		<div className="-mx-2 max-h-72 overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
			<ol
				onMouseLeave={() => onPreview(undefined)}
				className="flex flex-col gap-0.5 text-sm tabular-nums"
			>
				{rows.map((row, i) => (
					<li
						key={i}
						ref={i === rows.length - 1 ? end : undefined}
						tabIndex={0}
						aria-current={preview === i ? 'true' : undefined}
						onMouseEnter={() => onPreview(i)}
						onFocus={() => onPreview(i)}
						onBlur={() => onPreview(undefined)}
						onClick={() => onPreview(preview === i ? undefined : i)}
						className={cn(
							'grid cursor-default grid-cols-[2rem_1fr_1fr] gap-2 rounded-md px-2 py-1 ring-1 ring-transparent transition-[background-color,box-shadow] duration-200 outline-none',
							preview === i && 'bg-foreground/5 ring-foreground/10'
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
