<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import * as Card from '$lib/components/ui/card';
	import { traderState } from './shared.svelte';
	import { cn, roundTo } from '$lib/utils';
	import {
		MARKET_PRESETS,
		MarketCoordinator,
		type OrderSide,
		type PlayerState,
		type PortfolioItem
	} from './market';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { formatUSD } from '$lib/format';
	import StockChart from './stock-chart.svelte';

	const market = new MarketCoordinator({
		stocks: [MARKET_PRESETS.BLUE, MARKET_PRESETS.CPTO, MARKET_PRESETS.MEME]
	});
	market.addPlayer({ id: 'Player', cash: 10000 });

	let currentMarketState = $derived(traderState.data.at(-1));
	let previousMarketState = $derived(traderState.data.at(-2));
	let currentPlayerState = $derived<PlayerState>({
		id: '',
		cash: 0,
		portfolio: [],
		...currentMarketState?.playerStates.find((p) => p.id === 'Player')
	});
	let selectedStockData = $derived<PortfolioItem>({
		symbol: '',
		shares: 0,
		averageBuyPrice: 0,
		...currentPlayerState.portfolio.find((p) => p.symbol === traderState.selectedStock)
	});

	let allSymbols = $derived(Object.keys(currentMarketState?.prices ?? {}));
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
	let netWorth = $derived.by(() => {
		return (
			currentPlayerState.cash +
			currentPlayerState.portfolio.reduce((total, item) => {
				const stockPrice = currentMarketState?.prices[item.symbol] ?? 0;
				return total + item.shares * stockPrice;
			}, 0)
		);
	});
	let mode = $state<OrderSide>('BUY');
	let selectedShares = $state(0);
	let pendingOrdersCount = $state(0);

	const placeOrder = () => {
		market.placeOrder({
			playerId: 'Player',
			symbol: traderState.selectedStock,
			side: mode,
			quantity: selectedShares
		});

		pendingOrdersCount += 1;
	};

	const selectSymbol = (symbol: string) => {
		traderState.selectedStock = symbol;
		selectedShares = 0;
	};

	onMount(() => {
		const handleTick = () => {
			const marketState = market.tick();
			traderState.data.push(marketState);
			const resolvedOrders = marketState.reports.filter((report) => report.playerId === 'Player');

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

			pendingOrdersCount = Math.max(0, pendingOrdersCount - resolvedOrders.length);
		};

		[...Array(2_000).keys()].forEach(() => handleTick());

		const timer = setInterval(() => {
			const marketState = market.tick();
			traderState.data.push(marketState);
			const resolvedOrders = marketState.reports.filter((report) => report.playerId === 'Player');

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

			pendingOrdersCount = Math.max(0, pendingOrdersCount - resolvedOrders.length);
		}, 1000);

		return () => clearInterval(timer);
	});
</script>

<div class="flex h-dvh flex-col gap-3 p-3">
	<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
		{#each allSymbols as symbol (symbol)}
			<StockChart
				{symbol}
				axis={false}
				size="sm"
				class={cn({
					'brightness-150': traderState.selectedStock === symbol,
					'hover:bg-card/80': traderState.selectedStock !== symbol
				})}
				onclick={() => selectSymbol(symbol)}
			/>
		{/each}
	</div>

	<StockChart symbol={traderState.selectedStock} />

	<div class="flex h-78 flex-col gap-3 md:flex-row">
		<div class="flex flex-1 flex-col gap-3">
			<Card.Root class="flex-1">
				<Card.Content class="flex flex-1 flex-col justify-between gap-6">
					<div class="flex items-start justify-between">
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
								<Tabs.Trigger value="BUY">Buy</Tabs.Trigger>
								<Tabs.Trigger value="SELL">Sell</Tabs.Trigger>
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
		</div>

		<Card.Root class="flex-1">
			<Card.Content class="flex flex-col gap-3">
				<p class="text-xl font-semibold">Player</p>
				<div class="flex justify-between">
					<p class="font-semibold">Net Worth</p>
					<p class="font-semibold">{formatUSD(netWorth)}</p>
				</div>
				<div class="flex justify-between">
					<p class="font-semibold">Cash</p>
					<p class="font-semibold">{formatUSD(currentPlayerState.cash)}</p>
				</div>
				<div class="flex justify-between">
					<p class="font-semibold">Shares</p>
					<p class="font-semibold">{selectedStockData.shares}</p>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- <Card.Root class="flex-1">
			<Card.Content class="flex flex-col gap-1 p-0">
				<p class="px-6 text-xl font-semibold">Leaderboard</p>
				<ScrollArea class="max-h-58">
					{#each traderState.leaderboard as leaderboardItem (leaderboardItem)}
						<div class="flex justify-between px-6 py-2 pb-2">
							<p>{leaderboardItem.name}</p>
							<p class="font-semibold">${leaderboardItem.netWorth.toFixed(2)}</p>
						</div>
					{/each}
				</ScrollArea>
			</Card.Content>
		</Card.Root> -->
	</div>
</div>
