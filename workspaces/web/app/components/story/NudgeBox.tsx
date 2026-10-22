import { useState, type FormEvent } from 'react';
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
			<div className="mt-10 border-t border-foreground/10 pt-8">
				<p className="font-medium">Thanks. Your nudge goes into Chapter {status.nudged}.</p>
				{quote && (
					<p className="mt-3 border-l-2 border-foreground/15 pl-4 text-foreground/70">{quote}</p>
				)}
				<p className="mt-3 text-sm text-foreground/50">
					You can send another once Chapter {status.nudged} is out.
				</p>
			</div>
		);
	}

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!text.trim() || !token || sending) return;
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
		<form onSubmit={submit} className="mt-10 border-t border-foreground/10 pt-8">
			<label htmlFor="nudge" className="font-medium">
				Nudge what happens in Chapter {status.target}
			</label>
			<p className="mt-1 text-sm text-foreground/50">
				One short wish. Popular ones sway the story; no one steers it.
			</p>
			<div className="mt-5 flex items-end gap-4">
				<input
					id="nudge"
					value={text}
					onChange={(event) => setText(event.target.value)}
					maxLength={NUDGE_MAX}
					autoComplete="off"
					placeholder="Ellis should answer the signal"
					className="min-w-0 flex-1 border-0 border-b border-foreground/20 bg-transparent px-0 py-2 placeholder:text-foreground/30 focus:border-foreground focus:ring-0"
				/>
				<button
					type="submit"
					disabled={!text.trim() || !token || sending}
					className="cursor-pointer pb-2 font-medium transition-opacity disabled:cursor-default disabled:opacity-40"
				>
					{sending ? 'Sending' : 'Send'}
				</button>
			</div>
			<p className="mt-2 text-right text-xs text-foreground/40 tabular-nums">
				{text.length}/{NUDGE_MAX}
			</p>
			{error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
			<Turnstile siteKey={status.siteKey} onToken={setToken} resetKey={resetKey} />
		</form>
	);
}
