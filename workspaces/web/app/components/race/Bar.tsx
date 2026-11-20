import type { ReactNode } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';

// The width of the whole game: the page less its padding, with the rail at
// --rail. On a wide, short window the track would grow taller than the screen,
// so the width is capped to what lets header + track (16:9) + your bets + gaps
// + page padding (the 21.25rem) fit in the dynamic viewport height, and the
// block is centred.
export const FRAME =
	'mx-auto w-full [--rail:clamp(23rem,5vw+19rem,27.5rem)] lg:max-w-[calc((100dvh-21.25rem)*16/9+1rem+var(--rail))]';

/** A 32px icon button, the same for every control in the bar. */
export const iconButton =
	'grid size-8 shrink-0 cursor-pointer place-items-center rounded-md p-0 text-foreground outline-none transition-colors hover:bg-foreground/10 hover:scale-100 focus-visible:ring-2 focus-visible:ring-ring';

/** One stretch of the timeline: how long it is, how much has passed, and how it looks. */
export type Segment = { name: string; weight: number; fill: number; urgent?: boolean };

/**
 * The clock: a readout, a caption, and the cycle as three segments (bet, race,
 * result) whose lengths are the phases' own. It is the same size whatever it
 * says, and with no segments it is the empty track.
 */
export function ClockFace({
	readout = '–:––',
	small = false,
	caption = '',
	urgent = false,
	segments = [
		{ name: 'Bet', weight: 45, fill: 0 },
		{ name: 'Race', weight: 65, fill: 0 },
		{ name: 'Result', weight: 15, fill: 0 }
	]
}: {
	readout?: string;
	small?: boolean;
	caption?: string;
	urgent?: boolean;
	segments?: Segment[];
}) {
	return (
		<div className="flex w-44 flex-col gap-1.5 lg:w-52">
			<p className="flex h-7 items-baseline gap-2 leading-7">
				<span
					className={`tabular-nums transition-colors ${small ? 'text-base font-medium' : 'text-2xl font-semibold'} ${urgent ? 'text-destructive' : ''}`}
				>
					{readout}
				</span>
				<span className="text-xs text-muted-foreground">{caption}</span>
			</p>
			<div className="flex h-1 gap-1" aria-hidden="true">
				{segments.map((segment) => (
					<div
						key={segment.name}
						title={segment.name}
						className="h-full overflow-hidden rounded-full bg-foreground/15"
						style={{ flex: `${segment.weight} 1 0` }}
					>
						<div
							className={`h-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${
								segment.urgent
									? 'bg-destructive'
									: segment.fill >= 1
										? 'bg-foreground/50'
										: 'bg-foreground'
							}`}
							style={{ width: `${Math.max(0, Math.min(1, segment.fill)) * 100}%` }}
						/>
					</div>
				))}
			</div>
			<span className="sr-only">Bet, race, result</span>
		</div>
	);
}

// The header, in two lines. The first is the site's own: "rafe / race" on the
// left, sound and theme on the right. The second is the game's: the clock at
// the left edge, what you have at the right. Bare, it is the same size the
// game fills in, so nothing moves when the game arrives.
export function Bar({
	clock,
	wallet,
	sound
}: {
	clock?: ReactNode;
	wallet?: ReactNode;
	sound?: ReactNode;
}) {
	return (
		<header className="flex flex-col gap-2">
			<div className="flex h-10 items-center justify-between gap-4">
				<SlashNav className="text-xl leading-7 font-medium whitespace-nowrap">
					<Link href="/">rafe</Link>
					race
				</SlashNav>
				<div className="flex items-center gap-5">
					{sound}
					<ThemeToggle className={iconButton} />
				</div>
			</div>
			<div className="flex h-10 items-center justify-between gap-4">
				{clock ?? <ClockFace />}
				<div className="min-w-0">{wallet}</div>
			</div>
		</header>
	);
}
