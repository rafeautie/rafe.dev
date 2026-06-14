import { cn } from '~/lib/utils';
import { livery } from '../engine/liveries';

export function CarBadge({ liveryId, className }: { liveryId: number; className?: string }) {
	const l = livery(liveryId);
	return (
		<span
			className={cn(
				'flex min-w-8 items-center justify-center rounded-lg py-1 text-sm font-bold',
				className
			)}
			style={{
				backgroundColor: l.primary
			}}
		>
			{l.number}
		</span>
	);
}
