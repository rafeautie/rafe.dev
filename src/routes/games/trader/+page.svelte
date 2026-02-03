<script lang="ts">
	import { LayerCake, Svg } from 'layercake';
	import { onMount } from 'svelte';
	import Line from '$lib/components/charts/line.svelte';
	import AxisX from '$lib/components/charts/axisX.svelte';
	import AxisY from '$lib/components/charts/axisY.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import * as Card from '$lib/components/ui/card';

	import { traderState } from './shared.svelte';
	import { roundTo } from '$lib/utils';
	import { STOCK_PRESETS, Stock, type OrderSide } from './stock';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	const stock = new Stock(STOCK_PRESETS.PENNY_STOCK);
	let clock = $state(0);
	let visibleYRange = $derived(
		traderState.data.reduce(
			(prev, item) => ({
				max: Math.max(prev.max, item.value),
				min: Math.min(prev.min, item.value)
			}),
			{
				min: Infinity,
				max: -Infinity
			}
		)
	);
	let currentValue = $derived(roundTo(traderState.data.at(-1)?.value ?? 0, 2));
	let previousValue = $derived(roundTo(traderState.data.at(-2)?.value ?? 0, 2));
	let maxValue = $state(0);
	let maxBuyableShares = $derived(
		currentValue > 0 ? Math.floor(traderState.player.cash / currentValue) : 0
	);
	let netWorth = $derived(
		roundTo(traderState.player.cash + traderState.player.shares * currentValue, 2)
	);
	let mode = $state<OrderSide>('BUY');
	let selectedShares = $state(0);

	const placeOrder = () => {
		if (mode === 'BUY') {
			stock.placeOrder('BUY', selectedShares);
			traderState.player.shares += selectedShares;
			traderState.player.cash -= selectedShares * currentValue;
		} else {
			stock.placeOrder('SELL', selectedShares);
			traderState.player.shares -= selectedShares;
			traderState.player.cash += selectedShares * currentValue;
		}
		selectedShares = 0;
	};

	onMount(() => {
		const timer = setInterval(() => {
			clock += 1;
			stock.processTick();
			traderState.data.push({
				timestamp: clock,
				value: stock.getPrice()
			});
			maxValue = Math.max(maxValue, currentValue);
			if (traderState.data.length > 50) {
				traderState.data.shift();
			}
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<div class="flex h-dvh flex-col gap-3 p-3">
	<Card.Root class="min-h-80 grow">
		<Card.Content class="grow">
			<div>
				<p class="text-3xl font-bold text-primary">Live Price</p>
				<p
					class="text-xl font-semibold tracking-wide text-green-500"
					class:text-red-500={currentValue < previousValue}
				>
					${currentValue}
				</p>
			</div>
			<LayerCake
				padding={{ top: 30, right: 25, bottom: 95, left: 40 }}
				x="timestamp"
				y="value"
				yDomain={[visibleYRange.min, visibleYRange.max]}
				data={traderState.data}
			>
				<Svg>
					<AxisX ticks={5} tickGutter={5} />
					<AxisY ticks={10} tickGutter={7} format={(d) => `$${d}`} />
					<Line stroke="#3b82f6" />
				</Svg>
			</LayerCake>
		</Card.Content>
	</Card.Root>

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
						<ToggleGroup.Root size="lg" type="single" bind:value={mode}>
							<ToggleGroup.Item value="BUY">Buy</ToggleGroup.Item>
							<ToggleGroup.Item value="SELL">Sell</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<div class="flex items-center justify-center">
						{#if mode === 'BUY'}
							<p class="text-xl font-semibold text-nowrap">
								Buy {selectedShares} shares for ${(selectedShares * currentValue).toFixed(2)}
							</p>
						{:else if traderState.player.shares === 0}
							<p class="text-xl font-semibold text-nowrap">No shares to sell</p>
						{:else}
							<p class="text-xl font-semibold text-nowrap">
								Sell {selectedShares}/{traderState.player.shares} shares for ${(
									selectedShares * currentValue
								).toFixed(2)}
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
								disabled={traderState.player.cash === 0}
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
								max={traderState.player.shares}
								disabled={traderState.player.shares === 0}
								step={Math.floor(traderState.player.shares / 100) || 1}
							/>
						{/if}
						<Button
							size="lg"
							class="self-stretch"
							onclick={placeOrder}
							disabled={selectedShares === 0}
						>
							Place Order
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
					<p class="font-semibold">${netWorth.toFixed(2)}</p>
				</div>
				<div class="flex justify-between">
					<p class="font-semibold">Cash</p>
					<p class="font-semibold">${traderState.player.cash.toFixed(2)}</p>
				</div>
				<div class="flex justify-between">
					<p class="font-semibold">Shares</p>
					<p class="font-semibold">{traderState.player.shares}</p>
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
