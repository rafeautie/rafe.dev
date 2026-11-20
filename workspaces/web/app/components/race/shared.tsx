import { ArrowRightIcon, ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { Market } from '~/lib/race/betting';
import { ROSTER } from '~/lib/race/roster';

// What the pieces of the race UI have in common: how a car, a bet and a
// number are written, and the two small shapes Live hands down.

export const entry = (id: string) => ROSTER.find((entry) => entry.id === id)!;

/** A bet as the ticker shows it. */
export type Tick = { name: string; market: Market; outcome: string; stake: number };

/** The running order, lifted out of the replay a few times a second. */
export type Running = {
	/** Car ids, first place first. */
	order: string[];
	/** Per car, by id: how far round (0 to 1) and whether it is out or home. */
	cars: Record<string, { fraction: number; lap: number; retired: boolean; finished: boolean }>;
	/** Whether any car has retired so far. */
	anyOut: boolean;
};

/** Short names, to fit six tabs in the rail. */
export const SHORT: Record<Market, string> = {
	win: 'Win',
	podium: 'Top 3',
	exacta: 'Exacta',
	crash: 'Crash',
	lap: 'Fast lap',
	clean: 'Clean'
};

/** What a market asks, in a line. */
export const ASKS: Record<Market, string> = {
	win: 'Which car wins',
	podium: 'Which car finishes in the top three',
	exacta: 'Which two cars finish first and second, in order',
	crash: 'Which car is the first to retire (bets returned if none do)',
	lap: 'Which car sets the fastest lap',
	clean: 'Whether every car finishes without retiring'
};

/** What an outcome is called: a car, two cars in order, or yes and no. */
export function label(market: string, outcome: string) {
	if (market === 'clean') return outcome === 'yes' ? 'Clean' : 'Not clean';
	return outcome
		.split('>')
		.map((id) => entry(id).name)
		.join(' then ');
}

/** An icon that sits in a line of text: as tall as the text, level with it. */
const inline = 'inline size-[1em] shrink-0 align-[-0.125em]';

/** `label`, with a chevron between the two cars of an exacta. */
export function Label({ market, outcome }: { market: string; outcome: string }) {
	if (market === 'clean') return <>{label(market, outcome)}</>;
	return (
		<>
			{outcome.split('>').map((id, index) => (
				<Fragment key={id}>
					{index > 0 && (
						<>
							<ChevronRightIcon aria-hidden="true" strokeWidth={2} className={`${inline} mx-0.5`} />
							<span className="sr-only"> then </span>
						</>
					)}
					{entry(id).name}
				</Fragment>
			))}
		</>
	);
}

/** An arrow from a stake to what it returns. */
export function Returns() {
	return (
		<>
			<ArrowRightIcon aria-hidden="true" strokeWidth={2} className={`${inline} mx-0.5`} />
			<span className="sr-only">returns</span>
		</>
	);
}

/**
 * What a panel shows when it has nothing yet: a quiet icon and a line, centred
 * in the panel. It fills the height it is given, so the first item arriving
 * does not move anything.
 */
export function Empty({
	icon: Icon,
	title,
	hint
}: {
	icon: LucideIcon;
	title: string;
	hint?: string;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
			<Icon aria-hidden="true" strokeWidth={2} className="mb-1 size-5" />
			<p>{title}</p>
			{hint && <p className="text-xs opacity-70">{hint}</p>}
		</div>
	);
}

/** Whole chips, grouped, with a real minus sign. */
export function chips(value: number) {
	const text = Math.abs(Math.round(value)).toLocaleString('en-US');
	return value < 0 ? `−${text}` : text;
}

/** A change in chips, always signed. */
export function signed(value: number) {
	return value === 0 ? '±0' : value > 0 ? `+${chips(value)}` : chips(value);
}

/**
 * A car: its colour with its number on it. The number is the second cue, so
 * the car can be told apart without telling the colours apart.
 */
export function Tile({ id, className = '' }: { id: string; className?: string }) {
	const car = entry(id);
	return (
		<span
			aria-hidden
			className={`inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-[11px] leading-none font-semibold text-black tabular-nums ${className}`}
			style={{ background: car.color }}
		>
			{car.number}
		</span>
	);
}

/**
 * A number that glides to its new value, so a change is seen as a change.
 * With reduced motion it simply jumps.
 */
export function useTween(target: number, ms = 600) {
	const [value, setValue] = useState(target);
	// where the glide had got to, so a new one can start from there
	const at = useRef(target);
	useEffect(() => {
		let frame: number;
		const from = at.current;
		const start = performance.now();
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const step = (now: number) => {
			const k = reduced ? 1 : Math.min(1, (now - start) / ms);
			at.current = from + (target - from) * (1 - (1 - k) ** 3);
			setValue(at.current);
			if (k < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [target, ms]);
	return value;
}
