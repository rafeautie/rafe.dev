import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicGameState, ClientMessage } from 'shared';

interface UseRaceWebSocketResult {
	state: PublicGameState | null;
	playerId: string;
	send: (msg: ClientMessage) => void;
	connected: boolean;
}

const RECONNECT_DELAY_MS = 2000;

export function useRaceWebSocket(gameId: string): UseRaceWebSocketResult {
	const [gameState, setGameState] = useState<PublicGameState | null>(null);
	const [connected, setConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const playerId = getOrCreatePlayerId();
	const playerName = getPlayerName();

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) return;

		const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const url = `${protocol}://${window.location.host}/ws/games/the-race/${gameId}?playerId=${encodeURIComponent(playerId)}&playerName=${encodeURIComponent(playerName)}`;

		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => setConnected(true);

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data as string);
				if (msg.type === 'STATE_UPDATE') {
					setGameState(msg.state as PublicGameState);
				}
			} catch {
				// ignore malformed messages
			}
		};

		ws.onclose = () => {
			setConnected(false);
			reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
		};

		ws.onerror = () => ws.close();
	}, [gameId, playerId, playerName]);

	useEffect(() => {
		connect();
		return () => {
			if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
			wsRef.current?.close();
		};
	}, [connect]);

	const send = useCallback((msg: ClientMessage) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg));
		}
	}, []);

	return { state: gameState, playerId, send, connected };
}

function getOrCreatePlayerId(): string {
	let id = localStorage.getItem('playerId');
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem('playerId', id);
	}
	return id;
}

function getPlayerName(): string {
	return localStorage.getItem('playerName') ?? 'Player';
}
