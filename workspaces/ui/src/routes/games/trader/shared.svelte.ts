import type { MarketStateMessage } from "shared";

interface TraderState {
    playerId: string;
    filterMode: 'month' | 'month3' | 'month6' | 'year' | 'all';
    selectedStock: string;
    selectedShares: number;
    pendingOrdersCount: number;
    data: (MarketStateMessage)[];
}

export const traderState = $state<TraderState>({
    playerId: 'player-1',
    filterMode: 'month',
    selectedStock: 'MEME',
    selectedShares: 0,
    pendingOrdersCount: 0,
    data: [],
})
