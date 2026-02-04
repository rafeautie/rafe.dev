import type { DataItem } from "$lib/components/charts/shared.svelte";
import type { MarketState } from "./market";

interface LeaderboardItem {
    name: string;
    netWorth: number;
}

export const traderState = $state({
    selectedStock: 'MEME' as string,
    data: [] as MarketState[],
    leaderboard: [] as LeaderboardItem[],
})

