import type { Frame } from '~/lib/civ/use-sim';
import type { ChronicleEvent } from '~/lib/civ/types';
import { when } from './labels';

// The smaller bottom-tab panels: what the people know, and the world's counts.

// Newest first. Only the chronicle's recent entries are kept by the page, so
// very old discoveries can drop off this list.
export function KnowledgeList({
	events,
	nameOf,
	onFollow
}: {
	events: ChronicleEvent[];
	nameOf: (id: number) => string | undefined;
	onFollow: (id: number) => void;
}) {
	const found = events.filter((e) => e.kind === 'discovery' || e.kind === 'first').reverse();
	if (!found.length)
		return <div className="text-foreground/40">Nothing discovered yet beyond the basics.</div>;
	return (
		<ol className="flex flex-col gap-2">
			{found.map((event, i) => {
				const who = event.people?.[0];
				return (
					<li key={`${event.day}-${i}`} className="flex gap-3">
						<span className="w-24 shrink-0 text-xs text-foreground/40 tabular-nums">
							{when(event.day)}
						</span>
						<div className="min-w-0">
							<div className={event.kind === 'first' ? 'font-medium' : 'text-foreground/80'}>
								{event.text}
							</div>
							{who !== undefined && (
								<button
									type="button"
									onClick={() => onFollow(who)}
									className="cursor-pointer text-xs text-foreground/50 hover:text-foreground"
								>
									{nameOf(who) ?? 'someone'}
								</button>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}

export function WorldPanel({ frame }: { frame: Frame | undefined }) {
	if (!frame) return <div className="text-foreground/40">No world yet.</div>;
	const count = (test: (p: Frame['people'][number]) => boolean) => frame.people.filter(test).length;
	const stats: [string, number][] = [
		['People', frame.people.length],
		['Children', count((p) => p.child)],
		['Elders', count((p) => p.elder)],
		['Herds', frame.herds.length],
		['Tame herds', frame.herds.filter((h) => h.tame).length]
	];
	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-3 gap-2">
				{stats.map(([name, value]) => (
					<div key={name} className="rounded-lg bg-foreground/5 px-2 py-1.5">
						<div className="text-base tabular-nums">{value}</div>
						<div className="text-xs text-foreground/50">{name}</div>
					</div>
				))}
			</div>
			<div className="flex flex-col gap-1">
				<div className="text-xs tracking-wide text-foreground/40 uppercase">Villages</div>
				{frame.villages.length ? (
					frame.villages.map((village) => (
						<div key={village.id} className="flex justify-between">
							<span>{village.name}</span>
							<span className="text-foreground/50 tabular-nums">
								{count((p) => p.village === village.id)} people
							</span>
						</div>
					))
				) : (
					<div className="text-foreground/40">No settlement has a name yet.</div>
				)}
			</div>
		</div>
	);
}
