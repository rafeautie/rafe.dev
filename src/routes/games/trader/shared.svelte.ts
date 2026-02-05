import { MARKET_PRESETS, MarketCoordinator, type MarketState } from "./market";

interface TraderState {
    playerId: string;
    filterMode: 'month' | 'month3' | 'month6' | 'year' | 'all';
    selectedStock: string;
    selectedShares: number;
    pendingOrdersCount: number;
    data: MarketState[];
}

export const traderState = $state<TraderState>({
    playerId: 'player-1',
    filterMode: 'month',
    selectedStock: 'MEME',
    selectedShares: 0,
    pendingOrdersCount: 0,
    data: [],
})

export const market = new MarketCoordinator({
    stocks: [MARKET_PRESETS.BLUE, MARKET_PRESETS.CPTO, MARKET_PRESETS.MEME]
});

market.addPlayer({
    id: 'player-1',
    username: 'Player 1',
    cash: 1000
});