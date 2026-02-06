export type OrderSide = 'BUY' | 'SELL';


export interface AddPlayerConfig {
    id: string;
    username: string;
    cash: number;
}

export interface StockConfig {
    symbol: string;
    volatility: number;
    liquidity: number;
    drift: number;
    initialPrice: number;
}

export interface PortfolioItem {
    symbol: string;
    shares: number;
    averageBuyPrice: number;
}

export interface OrderRequest {
    playerId: string;
    symbol: string;
    side: OrderSide;
    quantity: number;
}

export interface OrderResult extends OrderRequest {
    price: number;
    status: 'FILLED' | 'FAILED';
    reason?: string;
}

export interface PlayerState {
    id: string,
    username: string,
    cash: number,
    portfolio: PortfolioItem[]
}

export interface LeaderboardEntry {
    playerId: string;
    username: string;
    netWorth: number;
}

export interface UpdateUsernameMessage {
    type: 'update_username';
    username: string;
}

export interface PlaceOrderMessage {
    type: 'place_order';
    symbol: string;
    side: OrderSide;
    quantity: number;
}

export interface OrderPlacedMessage {
    type: 'order_placed';
    success: boolean;
    reason?: string;
}

export interface MarketStateMessage {
    type: 'market_update',
    clock: number,
    prices: Record<string, number>,
    volumes: Record<string, Record<OrderSide, number>>,
    reports: OrderResult[],
    playerState: PlayerState,
    leaderboard: Array<LeaderboardEntry>
}

export interface MarketHistoryEntry {
    clock: number;
    prices: Record<string, number>;
    volumes: Record<string, Record<OrderSide, number>>;
}

export interface MarketInitMessage {
    type: 'market_init';
    history: MarketHistoryEntry[];
    marketState: MarketStateMessage;
}
