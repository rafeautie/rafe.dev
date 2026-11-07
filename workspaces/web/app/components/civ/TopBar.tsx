import type { ReactNode } from 'react';
import { SPEEDS, type Speed } from '~/lib/civ/config';
import type { WeatherKind } from '~/lib/civ/types';
import { PANEL, WEATHER } from './labels';

// The strip across the top: the site's way home, the clock and weather, how
// many people there are, and the controls for time and the view.

const SPEED_LABEL: Record<Speed, string> = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' };

const button = 'cursor-pointer rounded-md px-2 py-1 text-foreground/60 hover:text-foreground';

export function TopBar({
	lead,
	year,
	seasonName,
	weather,
	population,
	speed,
	onSpeed,
	onFit,
	onNewWorld
}: {
	// the site nav and theme toggle, owned by the route
	lead: ReactNode;
	year: number;
	seasonName: string;
	weather: WeatherKind;
	population: number;
	speed: Speed;
	onSpeed: (speed: Speed) => void;
	onFit: () => void;
	onNewWorld: () => void;
}) {
	return (
		<div
			className={`pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-sm ${PANEL}`}
		>
			{lead}
			<span className="h-4 w-px bg-foreground/10 max-sm:hidden" />
			<span className="tabular-nums">
				Year {year}, {seasonName}
			</span>
			<span className="text-foreground/60">{WEATHER[weather]}</span>
			<span className="text-foreground/60 tabular-nums">{population} people</span>
			<div className="ml-auto flex items-center gap-0.5">
				{SPEEDS.map((value) => (
					<button
						key={value}
						type="button"
						onClick={() => onSpeed(value)}
						aria-pressed={speed === value}
						className={`cursor-pointer rounded-md px-2 py-1 text-xs ${
							speed === value
								? 'bg-foreground/10 text-foreground'
								: 'text-foreground/50 hover:text-foreground'
						}`}
					>
						{SPEED_LABEL[value]}
					</button>
				))}
				<span className="mx-1 h-4 w-px bg-foreground/10" />
				<button type="button" onClick={onFit} className={`${button} text-xs`}>
					Whole map
				</button>
				<button type="button" onClick={onNewWorld} className={`${button} text-xs`}>
					New world
				</button>
			</div>
		</div>
	);
}
