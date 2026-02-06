/** * --- TYPES & INTERFACES --- 
 */

import { AddPlayerConfig, formatUSD, groupBy, MarketStateMessage, MarketHistoryEntry, OrderRequest, OrderResult, PortfolioItem, roundTo, StockConfig } from "shared";

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

  public serialize() {
    return {
      price: this.price,
      volumeBatch: this.volumeBatch
    };
  }

  public hydrate(data: { price: number, volumeBatch: number }) {
    this.price = data.price;
    this.volumeBatch = data.volumeBatch;
  }
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

    if (current.shares === 0) {
      delete this.portfolio[symbol];
    }

    return true;
  }

  public serialize() {
    return {
      id: this.id,
      username: this.username,
      cash: this.cash,
      portfolio: this.portfolio
    };
  }

  public hydrate(data: { id: string, username: string, cash: number, portfolio: Record<string, PortfolioItem> }) {
    this.id = data.id;
    this.username = data.username;
    this.cash = data.cash;
    this.portfolio = data.portfolio;
  }
}

/** * --- COORDINATOR: INTEGRATES ENGINES & PLAYERS --- 
 */

export class MarketCoordinator {
  private engines: Record<string, StockEngine> = {};
  private players: Record<string, PlayerProfile> = {};
  private queue: OrderRequest[] = [];
  private clock = 0;
  private history: MarketHistoryEntry[] = [];

  constructor(config: MarketCoordinatorConfig) {
    config.stocks.forEach(c => this.engines[c.symbol] = new StockEngine(c));
  }

  public addPlayer(config: AddPlayerConfig) {
    this.players[config.id] = new PlayerProfile(config.id, config.username, config.cash);
  }

  public removePlayer(playerId: string) {
    delete this.players[playerId];
  }

  public prunePlayers(activePlayerIds: Set<string>) {
    for (const playerId in this.players) {
      if (!activePlayerIds.has(playerId)) {
        delete this.players[playerId];
      }
    }
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

  public updateUsername(playerId: string, username: string) {
    const proccessedUsername = username.trim().slice(0, 15); // Trim and limit length
    const player = this.players[playerId];

    if (!player || proccessedUsername === '') {
      return;
    }

    const existingUsernames = new Set(
      Object.values(this.players)
        .filter(p => p.id !== playerId)
        .map(p => p.username)
    );

    let newUsername = proccessedUsername;
    let counter = 1;
    while (existingUsernames.has(newUsername)) {
      newUsername = `${proccessedUsername}${counter}`;
      counter++;
    }

    player.username = newUsername;
  }


  public tick() {
    this.clock += 1;

    // PHASE 1: Discovery (Price moves based on batch volume)
    const oldPrices: MarketStateMessage['prices'] = {};
    const prices: MarketStateMessage['prices'] = {};
    const volumes: MarketStateMessage['volumes'] = {};

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
        price: executionPrice,
        status: success ? 'FILLED' : 'FAILED',
        reason: success ? undefined : reason
      });
    }

    this.queue = []; // Clear batch

    this.history.push({
      clock: this.clock,
      prices,
      volumes
    });
    if (this.history.length > 365) {
      this.history.shift();
    }

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

  public getPlayerState(playerId: string) {
    const player = this.players[playerId];
    if (!player) return { id: playerId, username: '', cash: 0, portfolio: [] };

    return {
      ...player,
      portfolio: Object.values(player.portfolio)
    };
  }

  public getCurrentState(playerId: string): MarketStateMessage {
    const prices: Record<string, number> = {};
    const volumes: Record<string, Record<OrderSide, number>> = {};

    for (const symbol in this.engines) {
      prices[symbol] = this.engines[symbol].getPrice();
      volumes[symbol] = { BUY: 0, SELL: 0 };
    }

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
      type: 'market_update' as const,
      clock: this.clock,
      prices,
      volumes,
      reports: [],
      playerState: this.getPlayerState(playerId),
      leaderboard
    };
  }

  public getHistory() {
    return this.history;
  }

  public serialize() {
    return {
      clock: this.clock,
      history: this.history,
      engines: Object.fromEntries(Object.entries(this.engines).map(([k, v]) => [k, v.serialize()])),
      players: Object.fromEntries(Object.entries(this.players).map(([k, v]) => [k, v.serialize()])),
    };
  }

  public hydrate(data: any) {
    if (!data) return;
    this.clock = data.clock || 0;
    this.history = data.history || [];

    if (data.engines) {
      Object.entries(data.engines).forEach(([symbol, engineData]: [string, any]) => {
        if (this.engines[symbol]) {
          this.engines[symbol].hydrate(engineData);
        }
      });
    }

    if (data.players) {
      this.players = {};
      Object.entries(data.players).forEach(([id, playerData]: [string, any]) => {
        const p = new PlayerProfile(playerData.id, playerData.username, playerData.cash);
        p.hydrate(playerData);
        this.players[id] = p;
      });
    }
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