import { Fragment, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '~/lib/utils';
import type { Card, PublicCarState, RaceEvent } from '../engine/types';
import { eventCarIds } from '../engine/events';
import { livery } from '../engine/liveries';
import { Card as UICard, CardContent, CardHeader } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { PlayingCard } from './PlayingCard';
import { CarBadge } from './CarBadge';

interface GameLogProps {
	log: RaceEvent[];
	cars: PublicCarState[];
	className?: string;
}

const ALL = 'all';

// One log row. Each event renders as one or more of these.
function Line({ children }: { children: ReactNode }) {
	return (
		<li className="flex flex-wrap items-center gap-2 text-[15px] last-of-type:pb-3">{children}</li>
	);
}

// Render an event's structured data into log row(s). All copy lives here — events
// carry data only — so wording changes never touch the server or the event shape.
function renderEvent(event: RaceEvent, liveryOf: (carId: number) => number): ReactNode {
	const badge = (carId: number) => <CarBadge liveryId={liveryOf(carId)} />;
	const cards = (cs: Card[]) => cs.map((c) => <PlayingCard key={c.id} card={c} size="xs" />);

	switch (event.type) {
		case 'gameStarted':
			return (
				<Line>
					<span>Game started. Qualifying!</span>
				</Line>
			);
		case 'qualifyingLockedIn':
			return (
				<Line>
					{badge(event.carId)}
					<span>locked in qualifying</span>
				</Line>
			);
		case 'qualified':
			return (
				<Line>
					{badge(event.carId)}
					{event.cards.length > 0 ? (
						<>
							<span>qualified with</span>
							{cards(event.cards)}
						</>
					) : (
						<span>qualified</span>
					)}
				</Line>
			);
		case 'gridSet':
			return (
				<Line>
					<span>Grid set!</span>
				</Line>
			);
		case 'discarded':
			return (
				<Line>
					{badge(event.carId)}
					{event.card ? (
						<>
							<span>discarded</span>
							{cards([event.card])}
						</>
					) : (
						<span>discarded ?</span>
					)}
				</Line>
			);
		case 'extended':
			return (
				<Line>
					{badge(event.carId)}
					{event.card ? (
						<>
							<span>extended to pos {event.newPosition} with</span>
							{cards([event.card])}
						</>
					) : (
						<span>extended to pos {event.newPosition}</span>
					)}
				</Line>
			);
		case 'challengeResolved':
			return (
				<>
					<Line>
						{event.outcome === 'challenger' ? (
							<>
								{badge(event.challengerCarId)}
								<span>wins. Positions swap!</span>
							</>
						) : event.outcome === 'tie' ? (
							<span>Tie. No change.</span>
						) : (
							<>
								{badge(event.defenderCarId)}
								<span>holds. No change.</span>
							</>
						)}
					</Line>
					<Line>
						{badge(event.challengerCarId)}
						{cards(event.challengerCards)}
						<span>vs</span>
						{badge(event.defenderCarId)}
						{cards(event.defenderCards)}
					</Line>
				</>
			);
		default:
			return null;
	}
}

export function GameLog({ log, cars, className }: GameLogProps) {
	const [filterCarId, setFilterCarId] = useState<number | null>(null);

	const liveryById = new Map(cars.map((c) => [c.id, c.liveryId]));
	const liveryOf = (carId: number) => liveryById.get(carId) ?? carId;

	// System events (no associated car) always show; everything else respects the filter.
	const filtered =
		filterCarId === null
			? log
			: log.filter((e) => {
					const ids = eventCarIds(e);
					return ids.length === 0 || ids.includes(filterCarId);
				});
	const recent = [...filtered].reverse().slice(0, 20);

	return (
		<UICard variant="the-race-bg" className={cn('h-60 min-w-60 pb-0', className)}>
			<CardHeader className="flex items-center justify-between">
				<span className="text-lg font-bold tracking-wide uppercase">Log</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="the-race-bg" size="sm" className="flex h-8 gap-2 rounded-lg p-1 pr-2">
							{filterCarId === null ? (
								<span className="pl-2">All</span>
							) : (
								<CarBadge liveryId={liveryOf(filterCarId)} />
							)}
							<ChevronDownIcon />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" variant="the-race-bg" className="w-auto">
						<DropdownMenuRadioGroup
							value={filterCarId === null ? ALL : String(filterCarId)}
							onValueChange={(v) => setFilterCarId(v === ALL ? null : Number(v))}
						>
							<DropdownMenuRadioItem value={ALL}>All cars</DropdownMenuRadioItem>
							{cars.map((c) => (
								<DropdownMenuRadioItem key={c.id} value={String(c.id)} className="gap-2">
									<CarBadge liveryId={c.liveryId} />
									<span className="whitespace-nowrap">{livery(c.liveryId).driverName}</span>
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</CardHeader>
			<CardContent className="scrollbar-none overflow-y-scroll">
				<ul className="flex flex-col gap-4">
					{recent.map((e, i) => (
						<Fragment key={i}>{renderEvent(e, liveryOf)}</Fragment>
					))}
				</ul>
			</CardContent>
		</UICard>
	);
}
