import { useEffect, useState } from 'react';
import { getRaceSummary } from '~/lib/admin/overview';
import type { Loaded } from './Area';

type Race = Awaited<ReturnType<typeof getRaceSummary>>;

// a race's phases last tens of seconds, so a few seconds keeps up with them
const POLL_MS = 5000;

// The room as it stands, asked again every few seconds while the tab is
// shown; a failed ask keeps the last answer.
export function useLiveRace(initial: Loaded<Race>) {
	const [race, setRace] = useState(initial);
	// how far the room's clock is ahead of this one; until the page has
	// mounted, the countdown reads the room's own clock, so the server and the
	// hydrating browser draw the same time
	const [clock, setClock] = useState<{ skew: number; now: number } | null>(null);

	useEffect(() => setRace(initial), [initial]);

	useEffect(() => {
		if (!initial.ok) return;
		let gone = false;
		let skew = initial.value.now - Date.now();
		const tick = setInterval(() => setClock({ skew, now: Date.now() }), 1000);
		let timer = setTimeout(async function poll() {
			if (!document.hidden) {
				try {
					const value = await getRaceSummary();
					skew = value.now - Date.now();
					if (!gone) setRace({ ok: true, value });
				} catch {
					// the last answer stays up
				}
			}
			if (!gone) timer = setTimeout(poll, POLL_MS);
		}, POLL_MS);
		return () => {
			gone = true;
			clearInterval(tick);
			clearTimeout(timer);
		};
	}, [initial]);

	const now = race.ok ? (clock ? clock.now + clock.skew : race.value.now) : 0;
	return { race, now };
}
