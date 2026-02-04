<script lang="ts">
	import { getContext } from 'svelte';
	import { Spring } from 'svelte/motion';
	import type { DataItem, LayerCakeContext } from './shared.svelte';

	interface Props {
		format?: (value: number) => string;
		seriesData: Record<string, DataItem[]>;
	}

	const { seriesData, format }: Props = $props();
	const { width, height, xScale, yScale } = getContext<LayerCakeContext>('LayerCake');

	let containerX = $state<number | null>(null);
	let seriesNames = $derived(Object.keys(seriesData));
	let firstSeries = $derived(seriesData[seriesNames[0]] || []);

	function bisect(data: DataItem[], value: number) {
		let lo = 0;
		let hi = data.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1;
			if (data[mid].clock < value) lo = mid + 1;
			else hi = mid - 1;
		}
		return lo;
	}

	let result = $derived.by(() => {
		if (containerX === null || !$xScale || firstSeries.length === 0) {
			return { activeIndex: null, targetMouseX: null };
		}
		const xVal = $xScale.invert(containerX);
		const idx = bisect(firstSeries, xVal);
		const i0 = Math.max(0, idx - 1);
		const i1 = Math.min(firstSeries.length - 1, idx);
		let index = i0;
		if (i0 !== i1) {
			const d0 = Math.abs(xVal - firstSeries[i0].clock);
			const d1 = Math.abs(xVal - firstSeries[i1].clock);
			index = d0 < d1 ? i0 : i1;
		}
		if (firstSeries[index]) {
			return { activeIndex: index, targetMouseX: $xScale(firstSeries[index].clock) };
		}
		return { activeIndex: null, targetMouseX: null };
	});

	let activeIndex = $derived(result.activeIndex);
	let targetMouseX = $derived(result.targetMouseX);

	let tooltipSpring = new Spring(
		{ x: 0, ys: {} as Record<string, number> },
		{ stiffness: 0.5, damping: 0.8 }
	);
	let wasVisible = false;

	$effect(() => {
		if (targetMouseX !== null && activeIndex !== null) {
			const ys: Record<string, number> = {};
			for (const name of seriesNames) {
				const val = seriesData[name]?.[activeIndex]?.value;
				if (typeof val === 'number') {
					ys[name] = $yScale(val);
				}
			}

			if (!wasVisible) {
				tooltipSpring.set({ x: targetMouseX, ys }, { instant: true });
				wasVisible = true;
			} else {
				tooltipSpring.target = { x: targetMouseX, ys };
			}
		} else {
			wasVisible = false;
		}
	});

	function handleMouseMove(e: MouseEvent & { currentTarget: EventTarget & HTMLDivElement }) {
		if (!$xScale) return;
		const rect = e.currentTarget.getBoundingClientRect();
		containerX = e.clientX - rect.left;
	}

	function handleMouseLeave() {
		containerX = null;
	}
</script>

<div
	class="relative cursor-crosshair"
	style:width="{$width}px"
	style:height="{$height}px"
	onmousemove={handleMouseMove}
	onmouseleave={handleMouseLeave}
	role="presentation"
>
	<svg width={$width} height={$height} class="block overflow-visible">
		{#if targetMouseX !== null}
			<line
				class="stroke-border stroke-1"
				style:stroke-dasharray="10 10"
				x1={tooltipSpring.current.x}
				y1={0}
				x2={tooltipSpring.current.x}
				y2={$height}
			/>
			{#if activeIndex !== null}
				{#each seriesNames as name (name)}
					{#if tooltipSpring.current.ys[name] !== undefined}
						<circle
							cx={tooltipSpring.current.x}
							cy={tooltipSpring.current.ys[name]}
							r="4"
							class="fill-orange-400"
						/>
					{/if}
				{/each}
			{/if}
		{/if}
	</svg>

	{#if activeIndex !== null && targetMouseX !== null}
		<div
			class="pointer-events-none absolute z-50 flex min-w-30 flex-col gap-2 rounded-lg bg-background p-3 text-sm font-semibold"
			style:left="{tooltipSpring.current.x > $width * 0.75
				? tooltipSpring.current.x - 170
				: tooltipSpring.current.x + 15}px"
			style:top="10px"
		>
			<div class="tooltip-header text-sm font-semibold">
				Day {firstSeries[activeIndex].clock}
			</div>
			<div>
				{#each seriesNames as name (name)}
					<div class="flex justify-between gap-3">
						<span>{name}</span>
						<span
							>{format
								? format(seriesData[name][activeIndex].value)
								: seriesData[name][activeIndex].value.toFixed(2)}</span
						>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
