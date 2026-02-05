import { PUBLIC_TRADER_GAME_WEBSOCKET_URL } from '$env/static/public';
import { formatUSD, type MarketStateMessage, type OrderPlacedMessage, type PlaceOrderMessage } from 'shared';
import { traderState } from './shared.svelte';
import { toast } from 'svelte-sonner';

export class WebSocketManager {
    message = $state(null);
    status: "disconnected" | "connected" = $state('disconnected');
    #socket: WebSocket | null = null;

    connect() {
        if (this.#socket) return;

        this.#socket = new WebSocket(PUBLIC_TRADER_GAME_WEBSOCKET_URL);

        this.#socket.onopen = () => {
            this.status = 'connected';
        };

        this.#socket.onmessage = (event) => {
            this.processMessage(JSON.parse(event.data));
        };

        this.#socket.onclose = () => {
            this.status = 'disconnected';
            this.#socket = null;
        };
    }

    send(data: PlaceOrderMessage) {
        if (this.#socket?.readyState === WebSocket.OPEN) {
            this.#socket.send(JSON.stringify(data));
        }
    }

    private processMessage(message: MarketStateMessage | OrderPlacedMessage) {
        switch (message.type) {
            case 'market_update':
                this.processMarketUpdate(message);
                break;
            case 'order_placed':
                break;
        }
    }

    private processMarketUpdate(message: MarketStateMessage) {
        traderState.data.push(message);

        message.reports.forEach((report) => {
            if (report.status === 'FILLED') {
                toast.success(
                    `${report.side} ${report.quantity} shares at ${formatUSD(report.price)} filled.`,
                    { description: formatUSD(report.quantity * report.price) }
                );
            } else {
                toast.error(
                    `Order ${report.side} ${report.quantity} shares at ${formatUSD(report.price)} failed.`,
                    { description: report.reason }
                );
            }
        });

        traderState.pendingOrdersCount = Math.max(
            0,
            traderState.pendingOrdersCount - message.reports.length
        );
    }
}

// Export a single instance for global use
export const websocketManager = new WebSocketManager();