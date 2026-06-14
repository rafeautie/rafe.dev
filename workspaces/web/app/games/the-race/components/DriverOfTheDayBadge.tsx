import { Award } from 'lucide-react';
import { CarBadge } from './CarBadge';
import { liveryOf } from '../engine/liveries';
import type { DriverOfTheDay } from '../engine/types';

interface Props {
	dotd: DriverOfTheDay | null;
	carLiveries: Record<number, number>;
}

/** The Driver of the Day call-out — most places gained from the grid this Race. */
export function DriverOfTheDayBadge({ dotd, carLiveries }: Props) {
	if (!dotd) return null;
	const liv = liveryOf(dotd.carId, carLiveries);
	return (
		<div className="flex w-full items-center gap-3 rounded-xl bg-the-race-accent/10 px-4 py-3 ring-1 ring-the-race-accent/40 ring-inset">
			<Award className="size-5 shrink-0 text-the-race-accent" />
			<div className="flex min-w-0 flex-col">
				<span className="text-[10px] tracking-wider text-the-race-accent uppercase">
					Driver of the Day
				</span>
				<span className="truncate font-semibold">Car #{liv.number}</span>
			</div>
			<CarBadge liveryId={liv.id} className="ml-auto" />
			<span className="text-sm font-semibold tabular-nums">+{dotd.placesGained}</span>
		</div>
	);
}
