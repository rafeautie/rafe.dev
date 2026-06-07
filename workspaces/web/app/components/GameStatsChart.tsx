import { BUCKET_COUNT } from '~/games/stats.constants';
import type { GameStat } from '~/games/stats';

interface GameStatsChartProps {
	stat?: GameStat;
}

// One bar per data point — the empty state and the zero-filled series share this
// count, so the placeholder always matches the real number of bars.
const MAX_BARS = BUCKET_COUNT;
// SVG geometry. Bars are drawn in a fixed coordinate space and the <svg> scales
// to its container width; preserveAspectRatio keeps bars crisp and right-aligned.
const BAR_WIDTH = 8;
const BAR_GAP = 3;
const CHART_HEIGHT = 44;

// A compact headline ("13 games · 25 players") plus a dependency-free inline-SVG
// bar chart of games per 15-minute bucket over the last 3 hours. Renders a quiet
// empty state before any game is played.
export function GameStatsChart({ stat }: GameStatsChartProps) {
	const games = stat?.games ?? 0;
	const players = stat?.players ?? 0;
	const series = (stat?.series ?? []).slice(-MAX_BARS);
	// Drawn from the series, not the headline: the current bucket can be 0 while
	// earlier buckets still have activity worth graphing.
	const hasData = series.some((d) => d.games > 0);

	const max = Math.max(...series.map((d) => d.games), 1);
	// Empty charts still span the full MAX_BARS width so the ghost-bar placeholder
	// fills the same footprint a populated chart would.
	const barCount = hasData ? series.length : MAX_BARS;
	const width = Math.max(barCount * (BAR_WIDTH + BAR_GAP) - BAR_GAP, 1);

	return (
		<div className="flex flex-col gap-2">
			<p className="text-right text-sm text-black/60">
				<span className="font-semibold text-black">{games.toLocaleString()}</span> games
				{' · '}
				<span className="font-semibold text-black">{players.toLocaleString()}</span> players
			</p>
			<svg
				role="img"
				aria-label={
					hasData
						? `${games} games and ${players} players in the current 15 minutes; activity over the last 3 hours`
						: 'No games played yet'
				}
				viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
				preserveAspectRatio="xMaxYMax meet"
				className="h-11 w-full max-w-48 text-black/40"
			>
				{hasData
					? series.map((d, i) => {
							const height = Math.max((d.games / max) * CHART_HEIGHT, 1);
							return (
								<rect
									key={d.t}
									x={i * (BAR_WIDTH + BAR_GAP)}
									y={CHART_HEIGHT - height}
									width={BAR_WIDTH}
									height={height}
									rx={1.5}
									className={d.games > 0 ? 'text-blue-600' : 'text-black/20'}
									fill="currentColor"
								>
									<title>{`${d.t}: ${d.games} game${d.games === 1 ? '' : 's'}`}</title>
								</rect>
							);
						})
					: // Empty state: a faint row of ghost bars sitting on the baseline, so the
						// card reads as an awaiting-data chart rather than swapping in a text blurb.
						Array.from({ length: MAX_BARS }, (_, i) => (
							<rect
								key={i}
								x={i * (BAR_WIDTH + BAR_GAP)}
								y={CHART_HEIGHT - 3}
								width={BAR_WIDTH}
								height={3}
								rx={1.5}
								fill="currentColor"
								opacity={0.15}
							/>
						))}
			</svg>
		</div>
	);
}
