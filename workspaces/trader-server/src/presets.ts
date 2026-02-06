import { StockConfig } from "shared";

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