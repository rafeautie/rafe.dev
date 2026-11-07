import { useState } from 'react';
import type { ChronicleEvent } from '~/lib/civ/types';
import { when } from './labels';

// The running story, newest first, with a few filters. Standout moments (a
// first fire, a birth worth noting, a split) are marked so they catch the
// eye; clicking an entry follows the first person in it.

const FILTERS = {
	all: { name: 'All', test: () => true },
	standout: { name: 'Standout', test: (e: ChronicleEvent) => !!e.standout },
	lives: {
		name: 'Births & deaths',
		test: (e: ChronicleEvent) => e.kind === 'birth' || e.kind === 'death'
	},
	discoveries: {
		name: 'Discoveries',
		test: (e: ChronicleEvent) => e.kind === 'discovery' || e.kind === 'first'
	}
};
type FilterId = keyof typeof FILTERS;

export function Chronicle({
	events,
	onFollow
}: {
	events: ChronicleEvent[];
	onFollow: (id: number) => void;
}) {
	const [filter, setFilter] = useState<FilterId>('all');
	const shown = events.filter(FILTERS[filter].test).reverse();

	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-1">
				{(Object.keys(FILTERS) as FilterId[]).map((id) => (
					<button
						key={id}
						type="button"
						onClick={() => setFilter(id)}
						aria-pressed={filter === id}
						className={`cursor-pointer rounded-md px-2 py-0.5 text-xs ${
							filter === id
								? 'bg-foreground/10 text-foreground'
								: 'text-foreground/50 hover:text-foreground'
						}`}
					>
						{FILTERS[id].name}
					</button>
				))}
			</div>
			{shown.length ? (
				<ol className="flex flex-col gap-2">
					{shown.map((event, i) => {
						const who = event.people?.[0];
						return (
							<li key={`${event.day}-${i}`} className="flex gap-3">
								<span className="w-24 shrink-0 text-xs text-foreground/40 tabular-nums">
									{when(event.day)}
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
			) : (
				<div className="text-foreground/40">Nothing like that has happened yet.</div>
			)}
		</div>
	);
}
