import { cn } from '~/lib/utils';

/** A small "YOU" marker tagging the viewer's own car/driver. */
export function YouChip({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				'w-fit rounded bg-the-race-accent px-1.75 py-1 text-[10px] leading-none font-extrabold tracking-tighter text-the-race-bg-from uppercase',
				className
			)}
		>
			You
		</span>
	);
}
