

import { PortfolioItem } from "shared";

export class PlayerProfile {
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