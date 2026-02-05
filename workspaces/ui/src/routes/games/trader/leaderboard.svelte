<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { formatUSD } from 'shared';
	import { cn } from '$lib/utils';
	import { traderState } from './shared.svelte';
	import { Medal } from '@lucide/svelte';
	import { CircleStar } from '@lucide/svelte';
	import { SquareStar } from '@lucide/svelte';

	let latestLeaderboard = $derived(traderState.data.at(-1)?.leaderboard ?? []);
</script>

<Card.Root class="h-full w-full lg:w-auto lg:min-w-80">
	<Card.Content class="flex flex-col gap-1 p-0">
		<p class="px-6 text-xl font-semibold">Leaderboard</p>
		<ScrollArea class="max-h-58">
			{#each latestLeaderboard as leaderboardItem, index (leaderboardItem.playerId)}
				<div
					class={cn('m-3 mx-3 flex justify-between gap-3 rounded-md px-3 py-1', {
						'bg-amber-400/50': index === 0,
						'bg-neutral-300/40': index === 1,
						'bg-orange-800/30': index === 2
					})}
				>
					<div class="flex items-center gap-3">
						{#if index === 0}
							<Medal class="h-6 w-6 text-amber-400" />
						{:else if index === 1}
							<CircleStar class="h-6 w-6 text-neutral-300" />
						{:else if index === 2}
							<SquareStar class="h-6 w-6 text-orange-800" />
						{/if}
						<p>{leaderboardItem.username}</p>
					</div>
					<p class="font-semibold">{formatUSD(leaderboardItem.netWorth)}</p>
				</div>
			{/each}
		</ScrollArea>
	</Card.Content>
</Card.Root>
