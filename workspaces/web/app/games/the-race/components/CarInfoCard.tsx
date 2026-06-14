import { Layers } from 'lucide-react';
import { cn } from '~/lib/utils';
import { CarBadge } from './CarBadge';

interface CarInfoCardProps {
	liveryId: number;
	/** Cards the car has left in hand. */
	handSize: number;
	className?: string;
}

/** A small card surfacing a car's number and how many cards it has left in hand.
 *  Rendered above each car on the track (below for the top row) and below the
 *  car piece in the hand view. Positioning is left to the caller via `className`. */
export function CarInfoCard({ liveryId, handSize, className }: CarInfoCardProps) {
	return (
		<div
			className={cn(
				'flex items-center gap-2 rounded-xl border border-white/15 bg-linear-to-b from-the-race-bg-from to-the-race-bg-to p-2.5 shadow-md backdrop-blur-sm',
				className
			)}
		>
			<CarBadge liveryId={liveryId} className="h-6 text-white" />
			<span className="flex items-center gap-1 pr-0.5 text-sm font-bold text-white/90">
				<Layers className="size-3.5 opacity-70" />
				{handSize}
			</span>
		</div>
	);
}
