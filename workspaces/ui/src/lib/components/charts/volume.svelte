<script lang="ts">
	import { getContext } from 'svelte';
	import type { DataItem, LayerCakeContext } from './shared.svelte';

	interface Props {
		data: (DataItem & { bullish: boolean })[];
		binSize?: number;
	}

	const { data, binSize = 1 }: Props = $props();
	const { xScale, height } = getContext<LayerCakeContext>('LayerCake');

	let maxVolume = $derived(Math.max(...data.map((d) => d.value)));
	let volumeHeightRatio = 0.2;

	let paths = $derived.by(() => {
		if (!data.length || !$xScale) return { bullish: '', bearish: '' };

		// Calculate tick width based on scale
		// We use 0 and 1 to determine the pixel distance of one unit
		const tickWidth = Math.abs($xScale(binSize) - $xScale(0));
		const barWidth = Math.max(tickWidth - 1, 1);

		let bullishPath = '';
		let bearishPath = '';

		for (const d of data) {
			const x = $xScale(d.clock);
			const xPos = x - barWidth / 2;
			const barHeight = maxVolume ? (d.value / maxVolume) * ($height * volumeHeightRatio) : 0;
			const y = $height - barHeight;

			const path = `M${xPos},${y}h${barWidth}v${barHeight}h-${barWidth}Z`;

			if (d.bullish) {
				bullishPath += path;
			} else {
				bearishPath += path;
			}
		}

		return { bullish: bullishPath, bearish: bearishPath };
	});
</script>

<svg>
	<g class="volume-series">
		<path d={paths.bullish} class="fill-green-400/70" />
		<path d={paths.bearish} class="fill-red-400/70" />
	</g>
</svg>
