import { useEffect, useState } from 'react';

// The race room's clock, for the time a phase has left. Only what shows the
// time ticks: a page that held the clock itself would redraw everything on it
// every second, and keep doing so in a tab nobody is looking at.
//
// `roomNow` is the room's time when its latest answer was made. Until the
// first tick after mounting, that is what shows, so the server and the
// hydrating browser draw the same thing. After that it runs on from there
// (corrected for how far this computer's clock is from the room's), once a
// second while the tab is shown, and stands still while it is hidden.
export function useRoomClock(roomNow: number, running = true) {
	const [tick, setTick] = useState<{ from: number; now: number } | null>(null);
	useEffect(() => {
		if (!running) return;
		const skew = roomNow - Date.now();
		const update = () => {
			if (!document.hidden) setTick({ from: roomNow, now: Date.now() + skew });
		};
		const timer = setInterval(update, 1000);
		document.addEventListener('visibilitychange', update);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', update);
		};
	}, [roomNow, running]);
	// a tick from an older answer is out of date once a newer one arrives
	return tick?.from === roomNow ? tick.now : roomNow;
}

// Whole seconds until `endsAt` on the room's clock, ticking on its own.
export function SecondsLeft({ endsAt, roomNow }: { endsAt: number; roomNow: number }) {
	const now = useRoomClock(roomNow);
	return <span className="tabular-nums">{Math.max(0, Math.ceil((endsAt - now) / 1000))}</span>;
}
