<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { traderState } from './shared.svelte';
	import { type PlayerState, type PortfolioItem } from './market';
	import { formatUSD } from '$lib/format';

	let currentMarketState = $derived(traderState.data.at(-1));
	let currentPlayerState = $derived<PlayerState>({
		id: '',
		cash: 0,
		portfolio: [],
		...currentMarketState?.playerStates.find((p) => p.id === 'player-1')
	});
	let selectedStockData = $derived<PortfolioItem>({
		symbol: '',
		shares: 0,
		averageBuyPrice: 0,
		...currentPlayerState.portfolio.find((p) => p.symbol === traderState.selectedStock)
	});
	let netWorth = $derived.by(() => {
		return (
			currentPlayerState.cash +
			currentPlayerState.portfolio.reduce((total, item) => {
				const stockPrice = currentMarketState?.prices[item.symbol] ?? 0;
				return total + item.shares * stockPrice;
			}, 0)
		);
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
			<p class="font-semibold">{formatUSD(currentPlayerState.cash)}</p>
		</div>
		<div class="flex justify-between gap-6">
			<p class="font-semibold">Shares</p>
			<p class="font-semibold">{selectedStockData.shares}</p>
		</div>
	</Card.Content>
</Card.Root>
