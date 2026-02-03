<script lang="ts">
	import { getContext } from 'svelte';
	import type { LayerCakeContext } from './shared.svelte';

	interface Props {
		tickMarks?: boolean;
		labelPosition?: 'even' | 'above';
		snapBaselineLabel?: boolean;
		tickMarkLength?: number;
		format?: (d: number) => string | number;
		ticks?: number | number[] | ((ticks: number[]) => number[]);
		tickGutter?: number;
		dx?: number;
		dy?: number;
		charPixelWidth?: number;
	}

	const { xRange, yScale } = getContext<LayerCakeContext>('LayerCake');

	let {
		tickMarks = false,
		labelPosition = 'even',
		snapBaselineLabel = false,
		tickMarkLength = undefined,
		format = (d) => d,
		ticks = 5,
		tickGutter = 0,
		dx = 0,
		dy = 0,
		charPixelWidth = 7.25
	}: Props = $props();

	function calcStringLength(sum: number, val: string) {
		if (val === ',' || val === '.') return sum + charPixelWidth * 0.5;
		return sum + charPixelWidth;
	}

	let isBandwidth = $derived(typeof $yScale.bandwidth === 'function');
	let tickVals = $derived(
		Array.isArray(ticks)
			? ticks
			: isBandwidth
				? $yScale.domain()
				: typeof ticks === 'function'
					? ticks($yScale.ticks())
					: $yScale.ticks(ticks)
	);
	let widestTickLen = $derived(
		Math.max(
			10,
			Math.max(
				...tickVals.map((d: number) => format(d).toString().split('').reduce(calcStringLength, 0))
			)
		)
	);
	let tickLen = $derived(
		tickMarks === true
			? labelPosition === 'above'
				? (tickMarkLength ?? widestTickLen)
				: (tickMarkLength ?? 6)
			: 0
	);
	let x1 = $derived(-tickGutter - (labelPosition === 'above' ? widestTickLen : tickLen));
	let y = $derived(isBandwidth ? $yScale.bandwidth() / 2 : 0);
	let maxTickValPx = $derived(Math.max(...tickVals.map($yScale)));
</script>

<g class="axis y-axis">
	{#each tickVals as tick (tick)}
		{@const tickValPx = $yScale(tick)}
		<g class="text-sm font-semibold tick-{tick}" transform="translate({$xRange[0]}, {tickValPx})">
			<text
				class="fill-zinc-500"
				x={x1}
				{y}
				dx={dx + (labelPosition === 'even' ? -3 : 0)}
				text-anchor={labelPosition === 'above' ? 'start' : 'end'}
				dy={dy +
					(labelPosition === 'above' || (snapBaselineLabel === true && tickValPx === maxTickValPx)
						? -3
						: 4)}>{format(tick)}</text
			>
		</g>
	{/each}
</g>
