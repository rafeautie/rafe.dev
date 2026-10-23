import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { NUMBER } from './format';

// When people visit: visitors in each hour of each day of the week, darker
// for more, so the busy times stand out.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number) {
	if (hour === 0) return '12am';
	if (hour === 12) return '12pm';
	return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function Heatmap({ cells }: { cells: { day: number; hour: number; visitors: number }[] }) {
	// SQLite counts days from Sunday (0); rows here start on Monday
	const grid = DAYS.map(() => HOURS.map(() => 0));
	for (const { day, hour, visitors } of cells) grid[(day + 6) % 7][hour] = visitors;
	const max = Math.max(1, ...cells.map((cell) => cell.visitors));
	return (
		<div className="flex flex-col gap-1">
			{grid.map((hours, day) => (
				<div key={day} className="flex items-center gap-1">
					<span className="w-8 shrink-0 text-xs text-foreground/50">{DAYS[day].slice(0, 3)}</span>
					<div className="grid flex-1 grid-cols-24 gap-0.5">
						{hours.map((visitors, hour) => (
							<Tooltip key={hour}>
								<TooltipTrigger
									render={<div />}
									aria-label={`${DAYS[day]} ${hourLabel(hour)}: ${visitors} visitors`}
									className="aspect-square rounded-[3px] bg-foreground/[0.04]"
									style={
										visitors
											? {
													backgroundColor: `color-mix(in oklab, var(--foreground) ${Math.round(12 + (visitors / max) * 78)}%, transparent)`
												}
											: undefined
									}
								/>
								<TooltipContent>
									{DAYS[day]} {hourLabel(hour)} · {NUMBER.format(visitors)}{' '}
									{visitors === 1 ? 'visitor' : 'visitors'}
								</TooltipContent>
							</Tooltip>
						))}
					</div>
				</div>
			))}
			<div className="flex items-center gap-1">
				<span className="w-8 shrink-0" />
				<div className="grid flex-1 grid-cols-4 text-xs text-foreground/40">
					{[0, 6, 12, 18].map((hour) => (
						<span key={hour}>{hourLabel(hour)}</span>
					))}
				</div>
			</div>
		</div>
	);
}
