import { Fragment, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import type { PublicGameState } from '../engine/types';
import { eventCarIds } from '../engine/events';
import { livery } from '../engine/liveries';
import { TheRaceLogo } from './TheRaceLogo';
import { HowToPlay } from './HowToPlay';
import { CarBadge } from './CarBadge';
import { renderEvent } from './GameLog';

interface LogViewProps {
	state: PublicGameState;
}

const ALL = 'all';

// The logo-headed card alongside the track: the same header as the standings used
// to carry (logo + how-to-play), with the running game log as its body.
export function LogView({ state }: LogViewProps) {
	const [filterCarId, setFilterCarId] = useState<number | null>(null);

	const liveryById = new Map(state.cars.map((c) => [c.id, c.liveryId]));
	const liveryOf = (carId: number) => liveryById.get(carId) ?? carId;

	// System events (no associated car) always show; everything else respects the filter.
	const filtered =
		filterCarId === null
			? state.log
			: state.log.filter((e) => {
					const ids = eventCarIds(e);
					return ids.length === 0 || ids.includes(filterCarId);
				});
	const recent = [...filtered].reverse().slice(0, 20);

	return (
		<Card variant="the-race-bg" className="h-[clamp(13rem,28dvh,20rem)] w-100 pb-0">
			<CardHeader className="flex items-center justify-between">
				<TheRaceLogo />
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="the-race-bg" size="sm" className="flex h-9 gap-2 p-1 pr-2">
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
								{state.cars.map((c) => (
									<DropdownMenuRadioItem key={c.id} value={String(c.id)} className="gap-2">
										<CarBadge liveryId={c.liveryId} />
										<span className="whitespace-nowrap">Car #{livery(c.liveryId).number}</span>
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
					<HowToPlay />
				</div>
			</CardHeader>
			<CardContent className="scrollbar-none overflow-y-scroll">
				<ul className="flex flex-col gap-4 pt-2">
					{recent.map((e, i) => (
						<Fragment key={i}>{renderEvent(e, liveryOf)}</Fragment>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
