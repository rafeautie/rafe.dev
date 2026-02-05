<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { market, traderState } from './shared.svelte';
	import { cn } from '$lib/utils';
	import StockChart from './stock-chart.svelte';
	import Leaderboard from './leaderboard.svelte';
	import OrderControls from './order-controls.svelte';
	import Portfolio from './portfolio.svelte';
	import { formatUSD } from 'shared';

	let currentMarketState = $derived(traderState.data.at(-1));

	let allSymbols = $derived(Object.keys(currentMarketState?.prices ?? {}));

	const selectSymbol = (symbol: string) => {
		traderState.selectedStock = symbol;
		traderState.selectedShares = 0;
	};

	onMount(() => {
		const handleTick = () => {
			const marketState = market.tick();
			traderState.data.push(marketState);
			const resolvedOrders = marketState.reports.filter((report) => report.playerId === 'player-1');

			resolvedOrders.forEach((report) => {
				if (report.status === 'FILLED') {
					toast.success(
						`${report.side} ${report.quantity} shares at ${formatUSD(report.price)} filled.`,
						{ description: formatUSD(report.quantity * report.price) }
					);
				} else {
					toast.error(
						`Order ${report.side} ${report.quantity} shares at ${formatUSD(report.price)} failed.`,
						{ description: report.reason }
					);
				}
			});

			traderState.pendingOrdersCount = Math.max(
				0,
				traderState.pendingOrdersCount - resolvedOrders.length
			);
		};

		[...Array(2_000).keys()].forEach(() => handleTick());

		const timer = setInterval(handleTick, 1000);
		return () => clearInterval(timer);
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
