import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import type { Row } from '~/lib/stats/report';
import { cn } from '~/lib/utils';
import { country, NUMBER } from './format';
import WORLD from './world-map.json';

// Visitors by country on a map, darker for more. Choosing a country filters
// the page by it. The outlines come from scripts/world-map.mjs.
export function WorldMap({
	rows,
	active,
	onPick
}: {
	rows: Row[];
	active?: string;
	onPick: (code: string) => void;
}) {
	const visitors = new Map(rows.map((row) => [row.key, row.visitors]));
	const max = Math.max(1, ...rows.map((row) => row.visitors));
	return (
		<svg
			viewBox={WORLD.viewBox}
			className="h-auto w-full"
			role="group"
			aria-label="Visitors by country"
		>
			{Object.entries(WORLD.paths as Record<string, string>).map(([code, d]) => {
				const count = visitors.get(code) ?? 0;
				const label = `${country(code)} · ${NUMBER.format(count)} ${count === 1 ? 'visitor' : 'visitors'}`;
				return (
					<Tooltip key={code}>
						<TooltipTrigger
							render={<path d={d} />}
							aria-label={label}
							onClick={count ? () => onPick(code) : undefined}
							className={cn(
								'fill-foreground/[0.07] stroke-background stroke-[0.5] transition-[fill-opacity] outline-none',
								count && 'cursor-pointer hover:[fill-opacity:0.8]',
								active === code && 'stroke-foreground stroke-1'
							)}
							style={
								count
									? {
											fill: `color-mix(in oklab, var(--foreground) ${Math.round(15 + (count / max) * 75)}%, transparent)`
										}
									: undefined
							}
						/>
						<TooltipContent>{label}</TooltipContent>
					</Tooltip>
				);
			})}
		</svg>
	);
}
