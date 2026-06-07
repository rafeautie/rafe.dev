import { cn } from '~/lib/utils';

interface RaceBorderBeamProps {
	active?: boolean;
	className?: string;
	children: React.ReactNode;
}

export function RaceBorderBeam({ active, className, children }: RaceBorderBeamProps) {
	return (
		<div className={cn('w-fit rounded-xl p-0.5', active && 'animate-race-border-beam', className)}>
			{children}
		</div>
	);
}
