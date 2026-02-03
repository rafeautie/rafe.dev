/**
 * Configuration for different "personalities" of stocks.
 */
export interface StockConfig {
  symbol: string;
  volatility: number; // Daily/Tick fluctuation (e.g., 0.015 for 1.5%)
  liquidity: number;  // How many shares it takes to move price by 1%
  drift: number;      // Long-term growth/decay bias
  initialPrice: number;
}

export type OrderSide = 'BUY' | 'SELL';

interface QueuedOrder {
  side: OrderSide;
  quantity: number;
}

export interface TickResult {
  symbol: string;
  oldPrice: number;
  newPrice: number;
  netVolume: number;
  executedShares: number;
  timestamp: number;
}

/**
 * Core Stock Engine designed for high-frequency (e.g., 0.5s) ticks.
 */
export class Stock {
  private price: number;
  private orderQueue: QueuedOrder[] = [];
  private readonly config: StockConfig;

  constructor(config: StockConfig) {
    this.config = config;
    this.price = config.initialPrice;
  }

  /**
   * Queues an order to be processed at the next heartbeat.
   * Use this to collect player intents between ticks.
   */
  public placeOrder(side: OrderSide, quantity: number): void {
    if (quantity <= 0) return;
    this.orderQueue.push({ side, quantity });
  }

  /**
   * Processes all queued orders, applies random walk + market impact, 
   * and updates the price.
   * @returns The results of the tick for UI/Database updates.
   */
  public processTick(): TickResult {
    const oldPrice = this.price;

    // 1. Calculate Order Volume and Pressure
    let buyVolume = 0;
    let sellVolume = 0;

    for (const order of this.orderQueue) {
      if (order.side === 'BUY') buyVolume += order.quantity;
      else sellVolume += order.quantity;
    }

    const netVolume = buyVolume - sellVolume;
    const totalExecuted = buyVolume + sellVolume;

    // 2. Natural Random Walk (Geometric Brownian Motion)
    // drift is the trend, volatility is the randomness
    const randomMove = this.config.drift + (this.config.volatility * this.randomNormal());

    // 3. Market Impact
    // netVolume / liquidity determines how much player action shifts the price
    const marketImpact = netVolume / this.config.liquidity;

    // 4. Calculate New Price
    // Multiplier = 1 + (Trend/Randomness) + (Player Action)
    const multiplier = 1 + randomMove + marketImpact;
    this.price = Math.max(0.01, this.price * multiplier);

    // 5. Reset Queue for the next 0.5s window
    this.orderQueue = [];

    return {
      symbol: this.config.symbol,
      oldPrice: this.round(oldPrice),
      newPrice: this.round(this.price),
      netVolume: netVolume,
      executedShares: totalExecuted,
      timestamp: Date.now()
    };
  }

  /**
   * Standard Normal Distribution (Bell Curve) generator
   * Ensures most moves are small, but "crashes" or "moons" are possible.
   */
  private randomNormal(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  private round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  public getPrice(): number {
    return this.round(this.price);
  }

  public getSymbol(): string {
    return this.config.symbol;
  }
}

export const STOCK_PRESETS = {
  BLUE_CHIP: {
    symbol: "GSFT",
    initialPrice: 150.00,
    volatility: 0.002, // Very stable
    liquidity: 100000, // Hard to move
    drift: 0.0001      // Slight steady growth
  },
  PENNY_STOCK: {
    symbol: "MEME",
    initialPrice: 5.00,
    volatility: 0.05,  // Wild swings
    liquidity: 500,    // Easy to "pump"
    drift: -0.001      // Natural decay
  }
} satisfies Record<string, StockConfig>;
