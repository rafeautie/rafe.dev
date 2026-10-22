import { useEffect, useId, useRef, type ReactNode } from 'react';
import { BrainIcon, DicesIcon, MessagesSquareIcon } from 'lucide-react';
import { Bubble, BubbleContent } from '~/components/ui/bubble';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle
} from '~/components/ui/empty';
import { Message, MessageContent } from '~/components/ui/message';
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport
} from '~/components/ui/message-scroller';
import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceDescription,
	TraceIcon,
	TraceLine,
	TraceTitle
} from '~/components/ui/trace';
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

// How long the model thought, in whole seconds
const secondsOf = (seconds?: number) => `${Math.max(1, Math.floor(seconds ?? 0))}s`;

// The model's thinking for one move, folded under a "Thought 5s" line
function Thinking({
	text,
	missed,
	seconds,
	speed,
	running = false
}: {
	text?: string;
	missed?: string[];
	seconds?: number;
	speed?: Speed;
	running?: boolean;
}) {
	return (
		<Trace>
			<TraceCollapsible>
				<TraceCollapsibleTrigger>
					<TraceLine status={running ? 'running' : undefined}>
						<TraceIcon>
							<BrainIcon />
						</TraceIcon>
						<TraceTitle>{running ? 'Considering' : 'Considered'}</TraceTitle>
						<TraceDescription>{secondsOf(seconds)}</TraceDescription>
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent className="text-sm whitespace-pre-wrap">
					{text || '…'}
					{missed?.map((answer, k) => (
						<p key={k} className="mt-1 italic">
							{answer.startsWith('an error: ')
								? `Its reply failed: ${answer.slice('an error: '.length)}`
								: `Answered “${answer}”, which isn’t a legal move.`}
						</p>
					))}
					{speed && (
						<p className="mt-2 text-xs text-foreground/50 tabular-nums">
							Read {speed.prompt} tokens in {speed.reading.toFixed(1)}s (
							{((speed.reading / speed.prompt) * 1000).toFixed(0)} ms each) · wrote {speed.written}{' '}
							in {speed.writing.toFixed(1)}s (
							{(speed.written / Math.max(speed.writing, 0.01)).toFixed(1)}
							/s)
						</p>
					)}
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}

// The game as a chat with the model: each of your moves, and each of its
// replies with the thinking behind it, folded away. Its turn in progress comes
// last. Its thinking is always here to read; "Show its thinking" only governs
// the marks on the board.
export function Thread({
	entries,
	moves,
	live
}: {
	entries: Entry[];
	// the game's moves in full, alongside the entries
	moves: Move[];
	// the model's turn as it happens
	live?: { text: string; thinking: boolean; seconds: number };
}) {
	return (
		<MessageScrollerProvider autoScroll defaultScrollPosition="end">
			<MessageScroller className="max-h-96 min-h-24 xl:max-h-none xl:flex-1">
				<MessageScrollerViewport className="no-scrollbar! [scrollbar-gutter:auto]!">
					<MessageScrollerContent className="gap-4 pb-2">
						{entries.length === 0 && !live && (
							<Empty className="flex-1">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<MessagesSquareIcon />
									</EmptyMedia>
									<EmptyTitle>No moves yet</EmptyTitle>
									<EmptyDescription>
										You play white. Its replies, and the thinking behind them, show up here.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
						{entries.map((entry, i) => (
							// p-px: room for the card's outline, which the item would clip
							<MessageScrollerItem key={i} messageId={String(i)} className="p-px">
								{entry.by === 'you' ? (
									<Message align="end">
										<MessageContent>
											<Bubble variant="muted" align="end">
												<BubbleContent className="py-1.5">
													<span className="text-muted-foreground">{Math.floor(i / 2) + 1}. </span>
													{entry.san}
												</BubbleContent>
											</Bubble>
										</MessageContent>
									</Message>
								) : (
									<Message>
										<MessageContent>
											{(entry.thinking || entry.missed?.length) && (
												<Thinking
													text={entry.thinking}
													missed={entry.missed}
													seconds={entry.seconds}
													speed={entry.speed}
												/>
											)}
											{moves[i] ? (
												<MoveCards move={moves[i]} random={entry.random} />
											) : (
												<p className="font-medium">{entry.san}</p>
											)}
										</MessageContent>
									</Message>
								)}
							</MessageScrollerItem>
						))}
						{live && live.text && (
							<MessageScrollerItem messageId="live">
								<Message>
									<MessageContent>
										<Thinking text={live.text} seconds={live.seconds} running={live.thinking} />
									</MessageContent>
								</Message>
							</MessageScrollerItem>
						)}
					</MessageScrollerContent>
				</MessageScrollerViewport>
				<MessageScrollerButton />
			</MessageScroller>
		</MessageScrollerProvider>
	);
}

// The game so far, two moves to a row.
export function MoveList({ entries }: { entries: Entry[] }) {
	const end = useRef<HTMLLIElement>(null);
	useEffect(() => {
		end.current?.scrollIntoView({ block: 'nearest' });
	}, [entries.length]);

	if (!entries.length) return <p className="text-sm text-foreground/40">No moves yet.</p>;

	const rows: Entry[][] = [];
	for (let i = 0; i < entries.length; i += 2) rows.push(entries.slice(i, i + 2));

	return (
		<ol className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm tabular-nums xl:max-h-none xl:min-h-0 xl:flex-1">
			{rows.map((row, i) => (
				<li
					key={i}
					ref={i === rows.length - 1 ? end : undefined}
					className="grid grid-cols-[2rem_1fr_1fr] gap-2"
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
	);
}
