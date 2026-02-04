<script lang="ts">
	import { LayerCake, Svg } from 'layercake';
	import Line from '$lib/components/charts/line.svelte';
	import AxisX from '$lib/components/charts/axisX.svelte';
	import AxisY from '$lib/components/charts/axisY.svelte';
	import * as Card from '$lib/components/ui/card';
	import { traderState } from './shared.svelte';
	import { cn, roundTo } from '$lib/utils';
	import { formatUSD } from '$lib/format';

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

	let priceData = $derived.by(() => {
		return traderState.data.map((state) => ({
			clock: state.clock,
			value: state.prices[symbol]
		}));
	});

	let currentStockItem = $derived({
		clock: currentMarketState?.clock,
		price: roundTo(currentMarketState?.prices[symbol] ?? 0, 2),
		volume: currentMarketState?.volumes[symbol] ?? 0,
		downwardTrend:
			(previousMarketState?.prices[symbol] ?? 0) > (currentMarketState?.prices[symbol] ?? 0)
	});

	let xDomain = $derived([
		Math.max((currentStockItem.clock ?? 0) - 30, 0),
		currentStockItem.clock ?? 1
	]);

	let priceList = $derived.by(() => {
		return priceData
			.map((d) => (d.clock >= xDomain[0] && d.clock <= xDomain[1] ? d.value : undefined))
			.filter((v) => v !== undefined);
	});
	let yDomain = $derived([Math.min(...priceList) * 0.95, Math.max(...priceList) * 1.05]);
</script>

<Card.Root
	class={cn('grow overflow-hidden', className, {
		'h-30 pt-0': size === 'sm',
		'min-h-80': size === 'default'
	})}
	{onclick}
>
	<Card.Content class={cn('grow', { 'p-3': size === 'sm' })}>
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
		<LayerCake
			padding={axis
				? { top: 30, right: 25, bottom: 95, left: 40 }
				: { left: -23, right: -23, bottom: 20 }}
			x="clock"
			y="value"
			{yDomain}
			{xDomain}
			data={priceData}
		>
			<Svg>
				{#if axis}
					<AxisX ticks={10} tickGutter={7} />
					<AxisY ticks={10} tickGutter={7} format={(d) => `$${d}`} />
				{/if}
				<Line stroke="#3b82f6" />
			</Svg>
		</LayerCake>
	</Card.Content>
</Card.Root>
