/** * --- TYPES & INTERFACES --- 
 */

import { AddPlayerConfig, formatUSD, groupBy, MarketState, OrderRequest, OrderResult, PortfolioItem, roundTo, StockConfig } from "shared";

export type OrderSide = 'BUY' | 'SELL';

export interface MarketCoordinatorConfig {
  stocks: StockConfig[];
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
    const randomMove = this.config.drift + (this.config.volatility * this.randomNormal());
    // 1. Get the direction (1 for Buy, -1 for Sell)
    const direction = Math.sign(this.volumeBatch);
    // 2. Calculate Square Root Impact
    // We divide volume by liquidity and THEN sqrt to keep the scale manageable
    const marketImpact = direction * Math.sqrt(Math.abs(this.volumeBatch) / this.config.liquidity);
    // 3. Apply a "Damping Factor" (e.g., 0.1) so the moves aren't too violent
    const damping = 0.1;
    const finalMultiplier = 1 + randomMove + (marketImpact * damping);
    this.price = Math.max(0.01, this.price * finalMultiplier);
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

  constructor(public id: string, public username: string, startingCash: number) {
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
    this.players[config.id] = new PlayerProfile(config.id, config.username, config.cash);
  }

  public removePlayer(playerId: string) {
    delete this.players[playerId];
  }

  public placeOrder(request: OrderRequest): { valid: boolean; reason?: string } {
    const engine = this.engines[request.symbol];

    if (!this.players[request.playerId]) {
      return {
        valid: false, reason: 'Invalid player.'
      };
    }

    if (!engine) {
      return {
        valid: false, reason: 'Invalid stock symbol.'
      };
    }

    if (typeof request.quantity !== 'number' || request.quantity <= 0) {
      return {
        valid: false,
        reason: 'Quantity must be a positive number.'
      };
    }

    // 1. Inform engine of volume for price impact
    engine.addVolume(request.side, request.quantity);
    // 2. Queue for settlement
    this.queue.push(request);

    return {
      valid: true
    }
  }

  /**
   * Call this every 500ms
   */
  public tick() {
    this.clock += 1;

    // PHASE 1: Discovery (Price moves based on batch volume)
    const oldPrices: MarketState['prices'] = {};
    const prices: MarketState['prices'] = {};
    const volumes: MarketState['volumes'] = {};

    for (const symbol in this.engines) {
      oldPrices[symbol] = this.engines[symbol].getPrice();
      prices[symbol] = this.engines[symbol].processTick();
      volumes[symbol] = { BUY: 0, SELL: 0 };
    }

    // PHASE 2: Settlement (Players trade at the new price)
    const reports: OrderResult[] = [];
    for (const order of this.queue) {
      const player = this.players[order.playerId];
      const oldPrice = oldPrices[order.symbol];
      const newPrice = prices[order.symbol];
      const executionPrice = (oldPrice + newPrice) / 2;
      const success = (order.side === 'BUY')
        ? player.buy(order.symbol, order.quantity, executionPrice)
        : player.sell(order.symbol, order.quantity, executionPrice);

      if (success) {
        volumes[order.symbol][order.side] += order.quantity;
      }

      const total = order.quantity * executionPrice;
      const reason = order.side === 'BUY'
        ? (player.cash < total ? `Insufficient funds for order of ${formatUSD(total)}` : undefined)
        : (player.portfolio[order.symbol]?.shares < order.quantity ? 'Insufficient shares.' : undefined);

      reports.push({
        ...order,
        price: roundTo(executionPrice, 2),
        status: success ? 'FILLED' : 'FAILED',
        reason: success ? undefined : reason
      });
    }

    this.queue = []; // Clear batch

    // Calculate Leaderboard
    const leaderboard = Object.values(this.players).map(p => {
      const portfolioValue = Object.values(p.portfolio).reduce((sum, item) => {
        return sum + (item.shares * (prices[item.symbol] || 0));
      }, 0);

      return {
        playerId: p.id,
        username: p.username,
        netWorth: p.cash + portfolioValue
      };
    }).sort((a, b) => b.netWorth - a.netWorth);

    return {
      clock: this.clock,
      prices,
      volumes,
      reports: groupBy(reports, r => r.playerId),
      leaderboard
    };
  }

  getPlayerState(playerId: string) {
    const player = this.players[playerId];

    return {
      ...player,
      portfolio: Object.values(player.portfolio)
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
    initialPrice: 300.00,
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
    liquidity: 2000,     // Very easy to "pump" or "dump"
    drift: -0.0004      // Naturally loses value if ignored
  }
} satisfies Record<string, StockConfig>;