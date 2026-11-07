import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChronicleEvent } from '~/lib/civ/types';
import { PANEL, when } from './labels';

// Standout moments pop in at the right edge, then fade after a while or when
// clicked. Clicking one follows the first person in it.

const SHOW_MS = 10000;
const FADE_MS = 400;
const MAX_CARDS = 4;

export function Alerts({
	events,
	onFollow
}: {
	events: ChronicleEvent[];
	onFollow: (id: number) => void;
}) {
	const [cards, setCards] = useState<ChronicleEvent[]>([]);
	// the last chronicle entry already looked at; starts at the current end so
	// old history doesn't replay
	const [seen, setSeen] = useState<ChronicleEvent | undefined>(() => events.at(-1));

	// new entries show up as cards; done during render so no effect has to set state
	const last = events.at(-1);
	if (last !== seen) {
		const fresh = events.slice(seen ? events.lastIndexOf(seen) + 1 : 0).filter((e) => e.standout);
		setSeen(last);
		if (fresh.length) setCards((old) => [...old, ...fresh].slice(-MAX_CARDS));
	}

	const dismiss = useCallback(
		(event: ChronicleEvent) => setCards((old) => old.filter((e) => e !== event)),
		[]
	);

	return (
		<div className="pointer-events-none absolute top-16 right-3 flex w-64 flex-col gap-2">
			{cards.map((event) => (
				<Card
					key={`${event.day}-${event.kind}-${event.text}`}
					event={event}
					onDismiss={dismiss}
					onFollow={onFollow}
				/>
			))}
		</div>
	);
}

function Card({
	event,
	onDismiss,
	onFollow
}: {
	event: ChronicleEvent;
	onDismiss: (event: ChronicleEvent) => void;
	onFollow: (id: number) => void;
}) {
	const el = useRef<HTMLButtonElement>(null);

	// slide in, then fade out just before the card goes away
	useEffect(() => {
		const node = el.current;
		node?.animate(
			[
				{ opacity: 0, transform: 'translateX(12px)' },
				{ opacity: 1, transform: 'none' }
			],
			{ duration: 200, easing: 'ease-out' }
		);
		const fade = setTimeout(
			() =>
				node?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' }),
			SHOW_MS - FADE_MS
		);
		const gone = setTimeout(() => onDismiss(event), SHOW_MS);
		return () => {
			clearTimeout(fade);
			clearTimeout(gone);
		};
	}, [event, onDismiss]);

	const who = event.people?.[0];
	return (
		<button
			ref={el}
			type="button"
			onClick={() => {
				if (who !== undefined) onFollow(who);
				onDismiss(event);
			}}
			className={`pointer-events-auto cursor-pointer px-3 py-2 text-left text-xs ${PANEL}`}
		>
			<div className="text-foreground/40 tabular-nums">{when(event.day)}</div>
			<div className="text-sm text-foreground">{event.text}</div>
		</button>
	);
}
