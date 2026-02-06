import { StockConfig, OrderSide } from "shared";

export class StockEngine {
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