import { useEffect, useRef, type ReactNode } from 'react';
import type { Entry } from '~/lib/chess/storage';
import { cn } from '~/lib/utils';

// The pieces of the rail beside the board on /chess.

export function Section({ label, children }: { label: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h2 className="flex items-center gap-3 text-sm text-foreground/50">
				{label}
				<span className="h-px flex-1 bg-foreground/10" />
			</h2>
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
					checked ? 'bg-foreground/70' : 'bg-foreground/15'
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
			<span className="absolute inline-flex size-full rounded-full bg-foreground/40 motion-safe:animate-ping" />
			<span className="relative inline-flex size-2 rounded-full bg-foreground/60" />
		</span>
	);
}

// The model's thinking as it streams in, kept scrolled to the newest words.
export function LiveThinking({ text }: { text: string }) {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = box.current;
		if (element) element.scrollTop = element.scrollHeight;
	}, [text]);
	return (
		<div
			ref={box}
			className="max-h-56 overflow-y-auto rounded-lg border border-foreground/10 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/50"
		>
			{text || '…'}
		</div>
	);
}

function seconds(entry: Entry) {
	return entry.seconds === undefined ? '' : ` for ${Math.max(1, Math.round(entry.seconds))}s`;
}

// The game so far, two moves to a row, with the model's thinking kept on each
// of its moves. Guarded, the thinking stays hidden until the game ends.
export function MoveList({
	entries,
	revealThinking
}: {
	entries: Entry[];
	revealThinking: boolean;
}) {
	const end = useRef<HTMLLIElement>(null);
	useEffect(() => {
		end.current?.scrollIntoView({ block: 'nearest' });
	}, [entries.length]);

	if (!entries.length) return <p className="text-sm text-foreground/40">No moves yet.</p>;

	const rows: Entry[][] = [];
	for (let i = 0; i < entries.length; i += 2) rows.push(entries.slice(i, i + 2));

	return (
		<ol className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm tabular-nums">
			{rows.map((row, i) => (
				<li key={i} ref={i === rows.length - 1 ? end : undefined} className="flex flex-col gap-1">
					<div className="grid grid-cols-[2rem_1fr_1fr] gap-2">
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
					</div>
					{revealThinking &&
						row.map(
							(entry, j) =>
								entry.by === 'ai' &&
								(entry.thinking || entry.missed?.length) && (
									<details key={j} className="group ml-8 text-xs text-foreground/50">
										<summary className="cursor-pointer list-none hover:text-foreground/80">
											{entry.san}: thought{seconds(entry)}
										</summary>
										<div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">
											{entry.thinking}
											{entry.missed?.map((answer, k) => (
												<p key={k} className="mt-1 italic">
													Answered “{answer}”, which isn’t a legal move.
												</p>
											))}
										</div>
									</details>
								)
						)}
				</li>
			))}
		</ol>
	);
}
