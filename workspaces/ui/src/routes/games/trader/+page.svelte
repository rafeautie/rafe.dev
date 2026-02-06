<script lang="ts">
	import { onMount } from 'svelte';
	import { traderState } from './shared.svelte';
	import { cn } from '$lib/utils';
	import StockChart from './stock-chart.svelte';
	import Leaderboard from './leaderboard.svelte';
	import OrderControls from './order-controls.svelte';
	import Portfolio from './portfolio.svelte';
	import { websocketManager } from './websocket.svelte';

	let currentMarketState = $derived(traderState.data.at(-1));

	let allSymbols = $derived(Object.keys(currentMarketState?.prices ?? {}));

	const selectSymbol = (symbol: string) => {
		traderState.selectedStock = symbol;
		traderState.selectedShares = 0;
	};

	onMount(() => {
		websocketManager.connect();

		return () => {
			websocketManager.disconnect();
		};
	});
</script>

<svelte:head>
	<title>Trader</title>
</svelte:head>

<div class="flex h-dvh flex-col gap-3 p-3">
	<div class="flex gap-3">
		<div class="hidden flex-1 md:flex"></div>
		{#each allSymbols as symbol (symbol)}
			<StockChart
				{symbol}
				axis={false}
				size="sm"
				class={cn({
					'bg-card/30': traderState.selectedStock === symbol,
					'hover:bg-card/80': traderState.selectedStock !== symbol
				})}
				onclick={() => selectSymbol(symbol)}
			/>
		{/each}
		<div class="hidden flex-1 md:flex"></div>
	</div>

	<StockChart class="grow" symbol={traderState.selectedStock} />

	<div class="flex flex-col gap-3 md:h-78 lg:flex-row">
		<div class="flex flex-1 justify-end">
			<Portfolio />
		</div>

		<OrderControls />

		<div class="flex flex-1">
			<Leaderboard />
		</div>
	</div>
</div>
