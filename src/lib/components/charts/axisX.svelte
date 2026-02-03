<script lang="ts">
	import { getContext } from 'svelte';
	import type { LayerCakeContext } from './shared.svelte';

	const { width, height, xScale, yRange } = getContext<LayerCakeContext>('LayerCake');

	interface Props {
		tickMarkLength?: number;
		baseline?: boolean;
		snapLabels?: boolean;
		format?: (d: number) => string | number;
		ticks?: number | number[] | ((ticks: number[]) => number[]);
		tickGutter?: number;
		dx?: number;
		dy?: number;
	}

	let {
		tickMarkLength = 6,
		baseline = false,
		snapLabels = false,
		format = (d) => d,
		ticks = undefined,
		tickGutter = 0,
		dx = 0,
		dy = 12
	}: Props = $props();

	function textAnchor(i: number, sl: boolean) {
		if (sl === true) {
			if (i === 0) {
				return 'start';
			}
			if (i === tickVals.length - 1) {
				return 'end';
			}
		}
		return 'middle';
	}

	let tickLen = $derived(tickMarkLength ?? 6);

	let isBandwidth = $derived(typeof $xScale.bandwidth === 'function');

	let tickVals: Array<number> = $derived(
		Array.isArray(ticks)
			? ticks
			: isBandwidth
				? $xScale.domain()
				: typeof ticks === 'function'
					? ticks($xScale.ticks())
					: $xScale.ticks(ticks)
	);

	let halfBand = $derived(isBandwidth ? $xScale.bandwidth() / 2 : 0);
</script>

<g class="axis x-axis" class:snapLabels>
	{#each tickVals as tick, i (tick)}
		{#if baseline === true}
			<line
				class="stroke-zinc-500"
				style:stroke-dasharray="0"
				y1={$height}
				y2={$height}
				x1="0"
				x2={$width}
			/>
		{/if}
		<g
			class="text-sm font-semibold tick-{i}"
			transform="translate({$xScale(tick)},{Math.max(...$yRange)})"
		>
			<text
				class="fill-zinc-500"
				x={halfBand}
				y={tickGutter + tickLen}
				{dx}
				{dy}
				text-anchor={textAnchor(i, snapLabels)}>{format(tick)}</text
			>
		</g>
	{/each}
</g>

<style>
	/* This looks slightly better */
	.axis.snapLabels .tick:last-child text {
		transform: translateX(3px);
	}
	.axis.snapLabels .tick.tick-0 text {
		transform: translateX(-3px);
	}
</style>
