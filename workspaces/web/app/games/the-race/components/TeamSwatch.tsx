import { livery, liveryOf } from '../engine/liveries';
import { cn } from '~/lib/utils';
import type { ConstructorStanding } from '../engine/types';

/** The colour block for a team — its first car's livery primary. */
export function TeamSwatch({
	standing,
	carLiveries,
	className
}: {
	standing: ConstructorStanding;
	carLiveries: Record<number, number>;
	className?: string;
}) {
	const firstCar = standing.carIds[0];
	const primary = (firstCar !== undefined ? liveryOf(firstCar, carLiveries) : livery(0)).primary;
	return (
		<span className={cn('shrink-0 rounded', className)} style={{ backgroundColor: primary }} />
	);
}
