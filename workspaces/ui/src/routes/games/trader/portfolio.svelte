<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { traderState } from './shared.svelte';
	import { formatUSD, type PortfolioItem } from 'shared';

	let currentMarketState = $derived(traderState.data.at(-1));
	let selectedStockData = $derived<PortfolioItem>({
		symbol: '',
		shares: 0,
		averageBuyPrice: 0,
		...currentMarketState?.playerState.portfolio.find((p) => p.symbol === traderState.selectedStock)
	});

	let netWorth = $derived.by(() => {
		const portfolioValue =
			currentMarketState?.playerState.portfolio.reduce((total, item) => {
				return total + item.shares * (currentMarketState?.prices[item.symbol] ?? 0);
			}, 0) ?? 0;
		return (currentMarketState?.playerState.cash ?? 0) + portfolioValue;
	});
</script>

<Card.Root class="h-full w-full lg:w-auto lg:min-w-80">
	<Card.Content class="flex min-w-80 flex-col gap-3">
		<p class="text-xl font-semibold">Player</p>
		<div class="flex justify-between gap-6">
			<p class="font-semibold">Net Worth</p>
			<p class="font-semibold">{formatUSD(netWorth)}</p>
		</div>
		<div class="flex justify-between gap-6">
			<p class="font-semibold">Cash</p>
			<p class="font-semibold">{formatUSD(currentMarketState?.playerState.cash ?? 0)}</p>
		</div>
		<div class="flex justify-between gap-6">
			<p class="font-semibold">Shares</p>
			<p class="font-semibold">{selectedStockData.shares}</p>
		</div>
	</Card.Content>
</Card.Root>
