import { CheckIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NUDGE_MAX } from '~/story/nudges';
import type { StoryStatus } from '~/story/server/nudge';
import { Turnstile } from './Turnstile';

// The reader's own nudge, kept so the sent state can quote it after a reload;
// the server only remembers that they sent one.
const SENT_KEY = 'story-nudge';

type Sent = { chapter: number; text: string };

function readSent(): Sent | null {
	try {
		return JSON.parse(localStorage.getItem(SENT_KEY) ?? 'null');
	} catch {
		return null;
	}
}

// A quiet card: a faint fill and hairline ring, as the contents dialog.
function Card({
	title,
	count,
	children
}: {
	title: ReactNode;
	count: number;
	children: ReactNode;
}) {
	return (
		<section className="mt-12 rounded-2xl bg-foreground/[0.025] p-5 ring-1 ring-foreground/10 sm:p-6">
			<div className="flex items-baseline justify-between gap-4">
				<h2 className="font-medium">{title}</h2>
				<p className="shrink-0 text-sm text-foreground/50 tabular-nums">
					{count} {count === 1 ? 'nudge' : 'nudges'} so far
				</p>
			</div>
			{children}
		</section>
	);
}

export function NudgeBox({
	status,
	onSent
}: {
	status: StoryStatus;
	onSent: (sent: { chapter: number; count: number }) => void;
}) {
	const [text, setText] = useState('');
	const [token, setToken] = useState<string | null>(null);
	const [resetKey, setResetKey] = useState(0);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// only ever drawn on the client, once the status has loaded
	const [sent, setSent] = useState<Sent | null>(readSent);

	if (status.nudged) {
		const quote = sent?.chapter === status.nudged ? sent.text : null;
		return (
			<Card
				count={status.count}
				title={
					<span className="inline-flex items-center gap-2">
						<CheckIcon className="size-4" />
						Your nudge goes into Chapter {status.nudged}
					</span>
				}
			>
				{quote && (
					<p className="mt-4 rounded-xl bg-background px-4 py-3 text-foreground/80 ring-1 ring-foreground/10">
						{quote}
					</p>
				)}
				<p className="mt-4 text-sm text-foreground/50">
					Thanks. You can send another once Chapter {status.nudged} is out.
				</p>
			</Card>
		);
	}

	const ready = text.trim().length > 0 && token !== null && !sending;

	async function submit(event?: FormEvent) {
		event?.preventDefault();
		if (!ready) return;
		setSending(true);
		setError(null);
		try {
			const response = await fetch('/api/story/nudge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, token })
			});
			const result = (await response.json()) as {
				error?: string;
				chapter: number;
				text: string;
				count: number;
			};
			if (!response.ok) throw new Error(result.error ?? 'Something went wrong. Try again.');
			const mine = { chapter: result.chapter, text: result.text };
			try {
				localStorage.setItem(SENT_KEY, JSON.stringify(mine));
			} catch {
				// private window; the quote just won't survive a reload
			}
			setSent(mine);
			onSent({ chapter: result.chapter, count: result.count });
		} catch (caught) {
			setError((caught as Error).message);
			setResetKey((key) => key + 1);
		} finally {
			setSending(false);
		}
	}

	return (
		<Card count={status.count} title={<label htmlFor="nudge">Nudge Chapter {status.target}</label>}>
			<p className="mt-1 text-sm text-foreground/50">
				One short wish for what happens next. Popular ones sway the story; no one steers it.
			</p>
			<form onSubmit={submit} className="mt-5">
				<div className="rounded-xl bg-background ring-1 ring-foreground/10 transition-shadow focus-within:ring-foreground/30">
					<textarea
						id="nudge"
						value={text}
						onChange={(event) => setText(event.target.value)}
						onKeyDown={(event) => {
							// Enter sends, as in a chat box; Shift+Enter is still a new line
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault();
								submit();
							}
						}}
						maxLength={NUDGE_MAX}
						rows={3}
						placeholder="Ellis should answer the signal"
						className="block w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 placeholder:text-foreground/30 focus:ring-0"
					/>
					<div className="flex items-center justify-between gap-4 px-4 pb-3">
						<span className="text-xs text-foreground/40 tabular-nums">
							{text.length}/{NUDGE_MAX}
						</span>
						<button
							type="submit"
							disabled={!ready}
							className="cursor-pointer rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity disabled:cursor-default disabled:opacity-30"
						>
							{sending ? 'Sending' : 'Send'}
						</button>
					</div>
				</div>
				{error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
				<Turnstile siteKey={status.siteKey} onToken={setToken} resetKey={resetKey} />
			</form>
		</Card>
	);
}
