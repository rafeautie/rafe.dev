import { useEffect, useRef, type ReactNode } from 'react';
import { BrainIcon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Bubble, BubbleContent } from '~/components/ui/bubble';
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
import type { Entry } from '~/lib/chess/storage';
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

export function Switch({
	label,
	checked,
	onChange
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			className="group flex items-center justify-between gap-3 rounded-md text-sm text-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			{label}
			<span
				className={cn(
					'relative h-4 w-7 shrink-0 rounded-full transition-colors',
					checked ? 'bg-(--chess-accent)' : 'bg-foreground/15'
				)}
			>
				<span
					className={cn(
						'absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform',
						checked && 'translate-x-3'
					)}
				/>
			</span>
		</button>
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

// The move the model chose, in words: the piece, where it went and from where,
// and what else it did.
function MoveCard({ move, random }: { move: Move; random?: boolean }) {
	const { title, from, notes } = describeMove(move);
	const Piece = PIECES[`${move.color}${move.piece.toUpperCase()}`];
	const tags = random ? [...notes, 'Random move'] : notes;
	return (
		<Card size="sm" className="w-full max-w-64 flex-row items-center gap-3 px-3 py-2.5">
			<span className="size-9 shrink-0 rounded-md bg-foreground/5">
				<Piece />
			</span>
			<div className="flex min-w-0 flex-col gap-1">
				<p className="leading-tight font-medium">{title}</p>
				<p className="text-xs text-muted-foreground">
					{from ? `${from} · ` : ''}
					{move.san}
				</p>
				{tags.length > 0 && (
					<div className="flex flex-wrap gap-1 pt-0.5">
						{tags.map((tag) =>
							tag === 'Random move' ? (
								<Badge
									key={tag}
									variant="outline"
									title="Its answers weren't legal moves, so this one was picked at random"
									className="text-muted-foreground"
								>
									{tag}
								</Badge>
							) : (
								<Badge
									key={tag}
									variant="secondary"
									className="bg-(--chess-accent)/10 text-(--chess-accent)"
								>
									{tag}
								</Badge>
							)
						)}
					</div>
				)}
			</div>
		</Card>
	);
}

// How long the model thought, in whole seconds
const secondsOf = (seconds?: number) => `${Math.max(1, Math.round(seconds ?? 0))}s`;

// The model's thinking for one move, folded under a "Thought 5s" line
function Thinking({
	text,
	missed,
	seconds,
	running = false
}: {
	text?: string;
	missed?: string[];
	seconds?: number;
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
						<TraceTitle>{running ? 'Thinking' : 'Thought'}</TraceTitle>
						<TraceDescription>{secondsOf(seconds)}</TraceDescription>
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent className="text-sm whitespace-pre-wrap">
					{text || '…'}
					{missed?.map((answer, k) => (
						<p key={k} className="mt-1 italic">
							Answered “{answer}”, which isn’t a legal move.
						</p>
					))}
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}

// The game as a chat with the model: each of your moves, and each of its
// replies with the thinking behind it, folded away. Its turn in progress comes
// last. Guarded, the thinking stays hidden until the game ends.
export function Thread({
	entries,
	moves,
	live,
	revealThinking
}: {
	entries: Entry[];
	// the game's moves in full, alongside the entries
	moves: Move[];
	// the model's turn as it happens
	live?: { text: string; thinking: boolean; seconds: number };
	revealThinking: boolean;
}) {
	return (
		<MessageScrollerProvider autoScroll defaultScrollPosition="end">
			<MessageScroller className="max-h-96 min-h-24 xl:max-h-none xl:flex-1">
				<MessageScrollerViewport>
					<MessageScrollerContent className="gap-4 pr-1 pb-2">
						{entries.length === 0 && !live && (
							<p className="text-sm text-muted-foreground">
								Your move. Its replies and thinking will show up here.
							</p>
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
											{(entry.thinking || entry.missed?.length) &&
												(revealThinking ? (
													<Thinking
														text={entry.thinking}
														missed={entry.missed}
														seconds={entry.seconds}
													/>
												) : (
													<Trace>
														<TraceLine status="pending">
															<TraceIcon>
																<BrainIcon />
															</TraceIcon>
															<TraceTitle>Thought {secondsOf(entry.seconds)}</TraceTitle>
															<TraceDescription>shown when the game ends</TraceDescription>
														</TraceLine>
													</Trace>
												))}
											{moves[i] ? (
												<MoveCard move={moves[i]} random={entry.random} />
											) : (
												<p className="font-medium">{entry.san}</p>
											)}
										</MessageContent>
									</Message>
								)}
							</MessageScrollerItem>
						))}
						{live && revealThinking && live.text && (
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
									title="Random move: its answer wasn't a legal move"
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
