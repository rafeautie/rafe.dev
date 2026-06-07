import { cn } from '~/lib/utils';

/** A small "HOST" marker tagging the player who controls starting the Season. */
export function HostChip({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				'w-fit rounded bg-the-race-bg-from/10 px-1.75 py-1 text-[10px] leading-none font-extrabold tracking-tighter text-the-race-bg-from/60 uppercase',
				className
			)}
		>
			Host
		</span>
	);
}
