import { cn } from '~/lib/utils';

/** One stretch of the cycle: how long it is against the others, and how much of it has passed. */
export type Phase = { name: string; weight: number; fill: number };

/** Half the width of the gap cut between two phases. */
const HALF_GAP = '1.5px';

// The gaps between phases, as a mask: opaque everywhere but a narrow cut at
// each boundary, so one bar reads as its sections.
function notches(phases: Phase[]) {
	const total = phases.reduce((sum, phase) => sum + phase.weight, 0) || 1;
	const stops: string[] = [];
	let at = 0;
	for (const phase of phases.slice(0, -1)) {
		at += (phase.weight / total) * 100;
		stops.push(
			`#000 calc(${at}% - ${HALF_GAP})`,
			`transparent 0 calc(${at}% + ${HALF_GAP})`,
			'#000 0'
		);
	}
	return stops.length ? `linear-gradient(to right, ${stops.join(', ')})` : undefined;
}

/** The fill's colour while the race is neutralised: under caution, and going green. */
const TONES = { caution: 'bg-yellow-400', restart: 'bg-green-600' };

/**
 * The race's cycle as one bar cut into its phases, filled as far as the cycle
 * has got. The fill only ever runs forward: `restart` names the cycle (the
 * race's round), and a new one starts the fill again from nothing at once
 * rather than running it back. `tone` colours the fill while a caution is
 * out or the field is going green.
 */
export function PhaseBar({
	phases,
	restart,
	urgent = false,
	tone,
	className
}: {
	phases: Phase[];
	restart?: number;
	urgent?: boolean;
	tone?: keyof typeof TONES;
	className?: string;
}) {
	const total = phases.reduce((sum, phase) => sum + phase.weight, 0) || 1;
	const through =
		phases.reduce((sum, phase) => sum + phase.weight * Math.max(0, Math.min(1, phase.fill)), 0) /
		total;
	const mask = notches(phases);
	return (
		<span
			className={cn('block h-1.5 overflow-hidden rounded-full bg-foreground/15', className)}
			style={{ maskImage: mask, WebkitMaskImage: mask }}
			aria-hidden
		>
			<span
				key={restart}
				suppressHydrationWarning
				className={cn(
					'block h-full transition-[width,background-color] duration-1000 ease-linear motion-reduce:transition-none',
					urgent ? 'bg-destructive' : tone ? TONES[tone] : 'bg-foreground'
				)}
				style={{ width: `${through * 100}%` }}
			/>
		</span>
	);
}
