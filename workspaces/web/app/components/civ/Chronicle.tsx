import { DAYS_PER_YEAR, SEASON_NAMES, season } from '~/lib/civ/config';
import type { ChronicleEvent } from '~/lib/civ/types';

// The running story, newest first. Standout moments (a first fire, a birth
// worth noting, a split) are marked so they catch the eye; clicking an entry
// follows the first person in it.

export function Chronicle({
	events,
	onFollow
}: {
	events: ChronicleEvent[];
	onFollow: (id: number) => void;
}) {
	if (!events.length)
		return <div className="text-sm text-foreground/40">Nothing has happened yet.</div>;
	return (
		<ol className="flex flex-col gap-2 text-sm">
			{[...events].reverse().map((event, i) => {
				const who = event.people?.[0];
				return (
					<li key={`${event.day}-${i}`} className="flex gap-3">
						<span className="w-24 shrink-0 text-xs text-foreground/40 tabular-nums">
							Year {Math.floor(event.day / DAYS_PER_YEAR) + 1}, {SEASON_NAMES[season(event.day)]}
						</span>
						<button
							type="button"
							disabled={who === undefined}
							onClick={() => who !== undefined && onFollow(who)}
							className={`text-left enabled:cursor-pointer enabled:hover:text-foreground ${
								event.standout ? 'font-medium text-foreground' : 'text-foreground/70'
							}`}
						>
							{event.text}
						</button>
					</li>
				);
			})}
		</ol>
	);
}
