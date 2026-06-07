import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PublicGameState, ClientMessage, RaceEvent } from '../engine/types';

interface UseRaceWebSocketResult {
	state: PublicGameState | null;
	// Presentation events from the most recent message (e.g. a resolved
	// challenge). A stable empty array until a message carries events, so callers
	// can detect new events by reference change.
	events: RaceEvent[];
	playerId: string;
	send: (msg: ClientMessage) => void;
	connected: boolean;
}

const RECONNECT_DELAY_MS = 2000;
const NO_EVENTS: RaceEvent[] = [];

export function useRaceWebSocket(gameId: string): UseRaceWebSocketResult {
	// State and events are bundled so they update atomically: when `events`
	// changes, `state` is guaranteed to be the snapshot that accompanied them.
	const [message, setMessage] = useState<{ state: PublicGameState; events: RaceEvent[] } | null>(
		null
	);
	const [connected, setConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [playerId] = useState(() => {
		if (typeof localStorage === 'undefined') return '';
		let id = localStorage.getItem('playerId');
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem('playerId', id);
		}
		return id;
	});
	const [playerName] = useState(() => {
		if (typeof localStorage === 'undefined') return 'Player';
		return localStorage.getItem('playerName') ?? 'Player';
	});

	const connect = useCallback(() => {
		const rs = wsRef.current?.readyState;
		if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;

		const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const url = `${protocol}://${window.location.host}/ws/games/the-race/${gameId}?playerId=${encodeURIComponent(playerId)}&playerName=${encodeURIComponent(playerName)}`;

		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => setConnected(true);

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data as string);
				if (msg.type === 'STATE_UPDATE') {
					setMessage({
						state: msg.state as PublicGameState,
						events: (msg.events as RaceEvent[] | undefined) ?? NO_EVENTS
					});
				} else if (msg.type === 'ERROR') {
					// The server built these rejections; surfacing them is both the
					// user feedback and the client-side signal that something failed.
					console.warn('[the-race] server rejected action:', msg.message);
					toast.error(msg.message);
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
			const ws = wsRef.current;
			if (ws) {
				// Detach onclose first: an intentional teardown must not schedule a
				// reconnect (which would outlive unmount or race a new connect).
				ws.onclose = null;
				ws.close();
			}
		};
	}, [connect]);

	const send = useCallback((msg: ClientMessage) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg));
		}
	}, []);

	return {
		state: message?.state ?? null,
		events: message?.events ?? NO_EVENTS,
		playerId,
		send,
		connected
	};
}
