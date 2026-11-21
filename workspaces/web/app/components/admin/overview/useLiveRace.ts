import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { errorMessage } from '~/lib/admin/format';
import { getRaceSummary } from '~/lib/admin/overview';
import type { Loaded } from './Area';

type Race = Awaited<ReturnType<typeof getRaceSummary>>;

// a race's phases last tens of seconds, so a few seconds keeps up with them
const POLL_MS = 5000;

// The room as it stands, asked again every few seconds while the tab is
// shown; a failed ask keeps the last answer. The time left ticks in the card
// that shows it (SecondsLeft), so a tick redraws that and nothing else.
//
// A lapsed sign-in stops it: the page's data is asked for again, which fails
// the same way and puts up the admin's own error page with its sign-in button,
// rather than counting down on an answer that will never be updated.
export function useLiveRace(initial: Loaded<Race>) {
	const router = useRouter();
	const [race, setRace] = useState(initial);

	useEffect(() => setRace(initial), [initial]);

	useEffect(() => {
		if (!initial.ok) return;
		let gone = false;
		let timer = setTimeout(async function poll() {
			if (!document.hidden) {
				try {
					const value = await getRaceSummary();
					if (!gone) setRace({ ok: true, value });
				} catch (error) {
					if (errorMessage(error) === 'Not signed in') {
						gone = true;
						void router.invalidate();
					}
					// anything else: the last answer stays up
				}
			}
			if (!gone) timer = setTimeout(poll, POLL_MS);
		}, POLL_MS);
		return () => {
			gone = true;
			clearTimeout(timer);
		};
	}, [initial, router]);

	return race;
}
