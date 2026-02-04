import type { DataItem } from "$lib/components/charts/shared.svelte";
import type { MarketState } from "./market";

interface LeaderboardItem {
    name: string;
    netWorth: number;
}

interface TraderState {
    filterMode: 'month' | 'month3' | 'month6' | 'year' | 'all';
    selectedStock: string;
    data: MarketState[];
    leaderboard: LeaderboardItem[];
}

export const traderState = $state<TraderState>({
    filterMode: 'month',
    selectedStock: 'MEME',
    data: [],
    leaderboard: [],
})

