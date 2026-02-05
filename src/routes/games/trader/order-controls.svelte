<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import * as Card from '$lib/components/ui/card';
	import { market, traderState } from './shared.svelte';
	import { roundTo } from '$lib/utils';
	import { type OrderSide, type PlayerState, type PortfolioItem } from './market';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { formatUSD } from '$lib/format';

	let currentMarketState = $derived(traderState.data.at(-1));
	let previousMarketState = $derived(traderState.data.at(-2));
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

	let currentStockItem = $derived({
		clock: currentMarketState?.clock,
		price: roundTo(currentMarketState?.prices[traderState.selectedStock] ?? 0, 2),
		volume: currentMarketState?.volumes[traderState.selectedStock] ?? 0,
		downwardTrend:
			(previousMarketState?.prices[traderState.selectedStock] ?? 0) >
			(currentMarketState?.prices[traderState.selectedStock] ?? 0)
	});

	let maxBuyableShares = $derived(
		currentStockItem.price > 0 ? Math.floor(currentPlayerState?.cash / currentStockItem.price) : 0
	);

	let mode = $state<OrderSide>('BUY');
	let selectedShares = $state(0);
	let pendingOrdersCount = $state(0);

	const placeOrder = () => {
		market.placeOrder({
			playerId: 'player-1',
			symbol: traderState.selectedStock,
			side: mode,
			quantity: selectedShares
		});

		pendingOrdersCount += 1;
	};
</script>

<Card.Root class="w-full lg:w-150">
	<Card.Content class="flex flex-1 flex-col justify-between gap-6">
		<div class="flex items-start justify-between gap-12">
			<div class="flex flex-col justify-between">
				<p class="text-xl font-semibold text-nowrap">Place Order</p>
				{#if mode === 'BUY'}
					<p class="line-clamp-2 text-sm text-ellipsis opacity-65">
						Select the number of shares to buy. This will cause demand and the price to rise.
					</p>
				{:else}
					<p class="line-clamp-2 text-sm text-ellipsis opacity-65">
						Select the number of shares to sell. This will cause demand and the price to drop.
					</p>
				{/if}
			</div>
			<Tabs.Root bind:value={mode}>
				<Tabs.List>
					<Tabs.Trigger value="BUY" class="dark:data-[state=active]:bg-green-400/40">
						Buy
					</Tabs.Trigger>
					<Tabs.Trigger value="SELL" class="dark:data-[state=active]:bg-red-400/50">
						Sell
					</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</div>
		<div class="flex items-center justify-center">
			{#if mode === 'BUY'}
				<p class="text-xl font-semibold text-nowrap">
					Buy {selectedShares} shares for {formatUSD(selectedShares * currentStockItem.price)}
				</p>
			{:else if selectedStockData.shares === 0}
				<p class="text-xl font-semibold text-nowrap">No shares to sell</p>
			{:else}
				<p class="text-xl font-semibold text-nowrap">
					Sell {selectedShares}/{selectedStockData.shares} shares for {formatUSD(
						selectedShares * currentStockItem.price
					)}
				</p>
			{/if}
		</div>
		<div class="flex w-full flex-col gap-5">
			{#if mode === 'BUY'}
				<Slider
					type="single"
					bind:value={selectedShares}
					min={0}
					max={maxBuyableShares}
					disabled={currentPlayerState.cash === 0}
					step={[
						1,
						selectedShares,
						...[...Array(100).keys()].map((i) => Math.floor((maxBuyableShares * i) / 100)),
						maxBuyableShares
					]}
				/>
			{:else}
				<Slider
					type="single"
					bind:value={selectedShares}
					min={0}
					max={selectedStockData.shares}
					disabled={selectedStockData.shares === 0}
					step={Math.floor(selectedStockData.shares / 100) || 1}
				/>
			{/if}
			<Button
				size="lg"
				class="self-stretch"
				onclick={placeOrder}
				disabled={selectedShares === 0 || pendingOrdersCount > 0}
			>
				{#if pendingOrdersCount > 0}
					<Spinner />
				{:else}
					Place Order
				{/if}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
