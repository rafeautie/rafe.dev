/** * --- TYPES & INTERFACES --- 
 */

export type OrderSide = 'BUY' | 'SELL';

export interface MarketCoordinatorConfig {
  stocks: StockConfig[];
}

export interface AddPlayerConfig {
  id: string;
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
  cash: number,
  portfolio: PortfolioItem[]
}

export interface MarketState {
  clock: number,
  prices: Record<string, number>,
  volumes: Record<string, number>,
  reports: OrderResult[],
  playerStates: Array<PlayerState>
}

/** * --- CORE ENGINE: CALCULATES PRICE --- 
 */

class StockEngine {
  private price: number;
  private volumeBatch: number = 0;
  private readonly config: StockConfig;

  constructor(config: StockConfig) {
    this.config = config;
    this.price = config.initialPrice;
  }

  public addVolume(side: OrderSide, quantity: number) {
    this.volumeBatch += (side === 'BUY' ? quantity : -quantity);
  }

  public processTick() {
    // Random Walk
    const randomMove = this.config.drift + (this.config.volatility * this.randomNormal());
    // Market Impact
    const marketImpact = this.volumeBatch / this.config.liquidity;

    this.price = Math.max(0.01, this.price * (1 + randomMove + marketImpact));
    this.volumeBatch = 0; // Reset for next batch
    return this.price;
  }

  private randomNormal(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  public getPrice() { return this.price; }
}

/** * --- PLAYER PROFILE: HANDLES LEDGER --- 
 */

class PlayerProfile {
  public cash: number;
  public portfolio: Record<string, PortfolioItem> = {};

  constructor(public id: string, startingCash: number) {
    this.cash = startingCash;
  }

  public buy(symbol: string, quantity: number, price: number): boolean {
    const cost = quantity * price;
    if (this.cash < cost) return false;

    this.cash -= cost;
    const current = this.portfolio[symbol] || { symbol, shares: 0, averageBuyPrice: 0 };

    // Update Average Cost Basis
    const newShares = current.shares + quantity;
    current.averageBuyPrice = ((current.shares * current.averageBuyPrice) + cost) / newShares;
    current.shares = newShares;

    this.portfolio[symbol] = current;
    return true;
  }

  public sell(symbol: string, quantity: number, price: number): boolean {
    const current = this.portfolio[symbol];
    if (!current || current.shares < quantity) return false;

    this.cash += (quantity * price);
    current.shares -= quantity;

    return true;
  }
}

/** * --- COORDINATOR: INTEGRATES ENGINES & PLAYERS --- 
 */

export class MarketCoordinator {
  private engines: Record<string, StockEngine> = {};
  private players: Record<string, PlayerProfile> = {};
  private queue: OrderRequest[] = [];
  private clock = 0;

  constructor(config: MarketCoordinatorConfig) {
    config.stocks.forEach(c => this.engines[c.symbol] = new StockEngine(c));
  }

  public addPlayer(config: AddPlayerConfig) {
    this.players[config.id] = new PlayerProfile(config.id, config.cash);
  }

  public placeOrder(request: OrderRequest) {
    const engine = this.engines[request.symbol];
    if (!engine || !this.players[request.playerId]) return;

    // 1. Inform engine of volume for price impact
    engine.addVolume(request.side, request.quantity);
    // 2. Queue for settlement
    this.queue.push(request);
  }

  /**
   * Call this every 500ms
   */
  public tick() {
    this.clock += 1;

    // PHASE 1: Discovery (Price moves based on batch volume)
    const prices: Record<string, number> = {};
    const volumes: Record<string, number> = {};

    for (const symbol in this.engines) {
      prices[symbol] = this.engines[symbol].processTick();
      volumes[symbol] = 0;
    }

    // PHASE 2: Settlement (Players trade at the new price)
    const reports: OrderResult[] = [];
    for (const order of this.queue) {
      const player = this.players[order.playerId];
      const price = prices[order.symbol];

      const success = (order.side === 'BUY')
        ? player.buy(order.symbol, order.quantity, price)
        : player.sell(order.symbol, order.quantity, price);

      if (success) {
        volumes[order.symbol] += order.quantity;
      }

      const reason = order.side === 'BUY'
        ? (player.cash < order.quantity * price ? 'Insufficient funds.' : undefined)
        : (player.portfolio[order.symbol]?.shares < order.quantity ? 'Insufficient shares.' : undefined);

      reports.push({
        ...order,
        price: parseFloat(price.toFixed(2)),
        status: success ? 'FILLED' : 'FAILED',
        reason: success ? undefined : reason
      });
    }

    this.queue = []; // Clear batch

    return {
      clock: this.clock,
      prices,
      volumes,
      reports: reports,
      playerStates: Object.values(this.players).map(p => ({
        id: p.id,
        cash: parseFloat(p.cash.toFixed(2)),
        portfolio: Object.values(p.portfolio)
      }))
    };
  }
}

/**
 * Market Presets: Low, Medium, and High Volatility
 * Calibrated for 0.5s ticks.
 */
export const MARKET_PRESETS = {
  // LOW VOLATILITY: The "Safety" stock.
  // Very stable, massive liquidity, slow steady growth.
  "BLUE": {
    symbol: "BLUE",
    initialPrice: 500.00,
    volatility: 0.0004, // Almost imperceptible jitter
    liquidity: 250000,  // Requires huge volume to shift
    drift: 0.00002      // Reliable upward bias
  },

  // MEDIUM VOLATILITY: The "Day Trader" stock.
  // Active price movement, responsive to player trades.
  "CPTO": {
    symbol: "CPTO",
    initialPrice: 45.50,
    volatility: 0.006,  // Frequent, visible price changes
    liquidity: 15000,   // Medium impact; a few players can move the needle
    drift: 0.0001       // Growth potential with risk
  },

  // HIGH VOLATILITY: The "Chaos" stock.
  // Wild swings, low liquidity, rapid natural decay.
  "MEME": {
    symbol: "MEME",
    initialPrice: 4.20,
    volatility: 0.035,  // Extreme randomness; "jumpy" UI
    liquidity: 800,     // Very easy to "pump" or "dump"
    drift: -0.0004      // Naturally loses value if ignored
  }
} satisfies Record<string, StockConfig>;