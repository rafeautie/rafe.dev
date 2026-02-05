<script>
	import * as Card from '$lib/components/ui/card';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { formatUSD } from '$lib/format';
	import { traderState } from './shared.svelte';

	let latestLeaderboard = $derived(traderState.data.at(-1)?.leaderboard ?? []);
</script>

<Card.Root class="h-full w-full lg:w-auto lg:min-w-80">
	<Card.Content class="flex flex-col gap-1 p-0">
		<p class="px-6 text-xl font-semibold">Leaderboard</p>
		<ScrollArea class="max-h-58">
			{#each latestLeaderboard as leaderboardItem (leaderboardItem)}
				<div class="flex justify-between gap-3 px-6 py-2 pb-6">
					<p>{leaderboardItem.username}</p>
					<p class="font-semibold">{formatUSD(leaderboardItem.netWorth)}</p>
				</div>
			{/each}
		</ScrollArea>
	</Card.Content>
</Card.Root>
