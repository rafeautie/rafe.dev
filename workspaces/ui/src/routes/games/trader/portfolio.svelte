<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Pencil, PencilOff } from '@lucide/svelte';
	import { traderState } from './shared.svelte';
	import { formatUSD } from 'shared';
	import Button from '$lib/components/ui/button/button.svelte';
	import { websocketManager } from './websocket.svelte';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';

	let currentMarketState = $derived(traderState.data.at(-1));
	let netWorth = $derived.by(() => {
		const portfolioValue =
			currentMarketState?.playerState.portfolio.reduce((total, item) => {
				return total + item.shares * (currentMarketState?.prices[item.symbol] ?? 0);
			}, 0) ?? 0;
		return (currentMarketState?.playerState.cash ?? 0) + portfolioValue;
	});

	let editingUsername = $state(false);
	let editedUsername = $state(currentMarketState?.playerState.username ?? '');
	let previousServerUsername = currentMarketState?.playerState.username;

	$effect(() => {
		const newServerUsername = currentMarketState?.playerState.username;
		if (newServerUsername && newServerUsername !== previousServerUsername) {
			editedUsername = newServerUsername;
			previousServerUsername = newServerUsername;
		}
	});

	const submitUsername = () => {
		const trimmedUsername = editedUsername.trim();

		if (trimmedUsername === currentMarketState?.playerState.username || trimmedUsername === '') {
			editingUsername = false;
			editedUsername = currentMarketState?.playerState.username ?? '';
			return;
		}

		websocketManager.send({ type: 'update_username', username: trimmedUsername });
		toast.success('Username Updated');
		editingUsername = false;
		previousServerUsername = trimmedUsername;
	};
</script>

<Card.Root class="h-full w-full lg:w-auto lg:min-w-80">
	<Card.Content class="flex min-w-80 flex-col gap-2">
		<div class="flex h-6 items-center justify-between gap-6">
			{#if editingUsername}
				<Input
					autofocus
					minlength={1}
					maxlength={15}
					type="text"
					class="max-w-35 rounded-md"
					bind:value={editedUsername}
					onkeydown={(e) => {
						switch (e.key) {
							case 'Enter':
								submitUsername();
								break;
							case 'Escape':
								editingUsername = false;
								break;
						}
					}}
				/>
				<Button variant="ghost" size="icon-sm" onclick={submitUsername}>
					<PencilOff />
				</Button>
			{:else}
				<p class="text-xl font-semibold">{currentMarketState?.playerState.username ?? 'Player'}</p>
				<Button
					variant="ghost"
					size="icon-sm"
					onclick={() => {
						editingUsername = true;
					}}
				>
					<Pencil />
				</Button>
			{/if}
		</div>
		<div class="flex justify-between gap-6 text-sm">
			<p class="font-semibold">Net Worth</p>
			<p class="font-semibold">{formatUSD(netWorth)}</p>
		</div>
		<div class="flex justify-between gap-6 text-sm">
			<p class="font-semibold">Cash</p>
			<p class="font-semibold">{formatUSD(currentMarketState?.playerState.cash ?? 0)}</p>
		</div>
		<div class="mt-3 flex flex-col gap-2">
			<p class="text-xl font-semibold">Stocks</p>
			{#each currentMarketState?.playerState.portfolio as item (item.symbol)}
				<div class="flex justify-between gap-6">
					<p class="text-sm font-semibold">{item.symbol}</p>
					<p class="text-sm font-semibold">
						{item.shares} shares @ {formatUSD(item.averageBuyPrice)}
					</p>
				</div>
			{:else}
				<p class="text-muted-foreground">No stocks in portfolio</p>
			{/each}
		</div>
	</Card.Content>
</Card.Root>
