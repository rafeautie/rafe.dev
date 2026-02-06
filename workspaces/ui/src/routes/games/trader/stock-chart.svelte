<script lang="ts">
	import { Html, LayerCake, Svg } from 'layercake';
	import Line from '$lib/components/charts/line.svelte';
	import Volume from '$lib/components/charts/volume.svelte';
	import AxisX from '$lib/components/charts/axisX.svelte';
	import AxisY from '$lib/components/charts/axisY.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Card from '$lib/components/ui/card';
	import { traderState } from './shared.svelte';
	import { cn, binMarketData } from '$lib/utils';
	import { roundTo } from 'shared';
	import { formatUSD } from 'shared';
	import Tooltip from '$lib/components/charts/tooltip.svelte';

	let {
		symbol,
		axis = true,
		size = 'default',
		class: className = '',
		onclick
	} = $props<{
		symbol: string;
		axis?: boolean;
		size?: 'default' | 'sm';
		class?: string;
		onclick?: () => void;
	}>();

	let currentMarketState = $derived(traderState.data.at(-1));
	let previousMarketState = $derived(traderState.data.at(-2));

	let binSize = $derived.by(() => {
		switch (traderState.filterMode) {
			case 'month6':
				return 3;
			case 'year':
				return 7;
			case 'all':
				return 30;
			default:
				return 1;
		}
	});

	let binnedData = $derived.by(() => {
		return binMarketData(traderState.data, symbol, binSize);
	});

	let priceData = $derived.by(() => {
		return binnedData.map((d, index) => ({
			clock: d.clock,
			startClock: d.startClock,
			value: d.price,
			bullish: index === 0 ? true : d.price >= binnedData[index - 1].price
		}));
	});

	let volumeData = $derived.by(() => {
		return binnedData.map((d) => ({
			clock: d.clock,
			startClock: d.startClock,
			value: d.buyVolume + d.sellVolume,
			bullish: d.buyVolume >= d.sellVolume
		}));
	});

	let currentStockItem = $derived({
		clock: currentMarketState?.clock,
		price: roundTo(
			currentMarketState?.prices[symbol] ?? 0,
			(currentMarketState?.prices[symbol] ?? 0) < 1 ? 3 : 2
		),
		volume:
			(currentMarketState?.volumes[symbol].BUY ?? 0) +
			(currentMarketState?.volumes[symbol].SELL ?? 0),
		downwardTrend:
			(previousMarketState?.prices[symbol] ?? 0) > (currentMarketState?.prices[symbol] ?? 0)
	});

	let priceList = $derived.by(() => {
		return priceData
			.map((d) => (d.clock >= xDomain[0] && d.clock <= xDomain[1] ? d.value : undefined))
			.filter((v) => v !== undefined);
	});
	let yDomain = $derived([Math.min(...priceList) * 0.95, Math.max(...priceList) * 1.05]);
	let xDomain = $derived.by(() => {
		switch (traderState.filterMode) {
			case 'month':
				return [Math.max((currentStockItem.clock ?? 0) - 30, 0), currentStockItem.clock ?? 1];
			case 'month3':
				return [Math.max((currentStockItem.clock ?? 0) - 90, 0), currentStockItem.clock ?? 1];
			case 'month6':
				return [Math.max((currentStockItem.clock ?? 0) - 180, 0), currentStockItem.clock ?? 1];
			case 'year':
				return [Math.max((currentStockItem.clock ?? 0) - 365, 0), currentStockItem.clock ?? 1];
			default:
				return [binnedData.at(0)?.clock ?? 0, currentStockItem.clock ?? 1];
		}
	});
</script>

<Card.Root
	class={cn('overflow-hidden', className, {
		'h-30 w-54 pt-0': size === 'sm',
		'min-h-80': size === 'default'
	})}
	{onclick}
>
	<Card.Content class={cn(className, { 'p-3': size === 'sm' })}>
		<div class="flex justify-between">
			<div>
				<p
					class={cn('font-bold text-primary', {
						'text-md': size === 'sm',
						'text-3xl': size === 'default'
					})}
				>
					{symbol}
				</p>
				<p
					class={cn('font-semibold tracking-wide', {
						'text-sm': size === 'sm',
						'text-xl': size === 'default'
					})}
					class:text-green-500={!currentStockItem.downwardTrend}
					class:text-red-500={currentStockItem.downwardTrend}
				>
					{formatUSD(currentStockItem.price)}
				</p>
			</div>
			{#if size !== 'sm'}
				<Tabs.Root bind:value={traderState.filterMode}>
					<Tabs.List>
						<Tabs.Trigger value="month">1M</Tabs.Trigger>
						<Tabs.Trigger value="month3">3M</Tabs.Trigger>
						<Tabs.Trigger value="month6">6M</Tabs.Trigger>
						<Tabs.Trigger value="year">1Y</Tabs.Trigger>
						<Tabs.Trigger value="all">All</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>
			{/if}
		</div>
		<LayerCake
			padding={axis
				? {
						top: 30,
						right: 5,
						bottom: 95,
						left: 50
					}
				: {
						left: -23,
						right: -23,
						bottom: 20
					}}
			x="clock"
			y="value"
			{yDomain}
			{xDomain}
			data={priceData}
		>
			<Svg>
				<Volume data={volumeData} {binSize} />
				{#if axis}
					<AxisX ticks={7} tickGutter={7} format={(d) => `D${d}`} />
					<AxisY ticks={10} tickGutter={7} format={formatUSD} />
				{/if}
				<Line />
			</Svg>

			<Html>
				{#if size !== 'sm'}
					<Tooltip
						seriesData={{
							Price: priceData,
							Volume: volumeData
						}}
						formatSeries={{
							Price: formatUSD
						}}
						excludeDots={['Volume']}
					/>
				{/if}
			</Html>
		</LayerCake>
	</Card.Content>
</Card.Root>
