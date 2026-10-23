import { HostGame, TICK } from './host';
import { HostNet, PeerNet } from './net';
import type { HostMessage, PlayerMessage } from './protocol';
import { makeLobbyCode } from './signal';

export type SessionState = {
	status: 'connecting' | 'lobby' | 'playing' | 'closed';
	code: string;
	isHost: boolean;
	you: string | null;
	players: { id: string; name: string }[];
	error: string | null;
};

const HOST_ID = 'host';

// One player's place in a game, from the lobby on. The host's session runs the
// game and talks to its own player directly; everyone else's talks to the host
// over WebRTC. The game view listens through `listen`; the lobby screen reads
// `state`.
export class Session {
	state: SessionState;
	// what the game view needs that arrived before it was there
	doors: boolean[] = [];
	spawn: { x: number; z: number } | null = null;
	// the game itself, on the host
	game: HostGame | null = null;
	private listeners = new Set<() => void>();
	private handler: ((m: HostMessage) => void) | null = null;
	private send: (m: PlayerMessage) => void = () => {};
	private stop: () => void = () => {};

	private constructor(code: string, isHost: boolean) {
		this.state = { status: 'connecting', code, isHost, you: null, players: [], error: null };
	}

	static host(name: string): Session {
		const session = new Session(makeLobbyCode(), true);
		const deliver = (m: HostMessage) => queueMicrotask(() => session.receive(m));
		let net: HostNet | null = null;
		const game = new HostGame((to, m) => (to === HOST_ID ? deliver(m) : net?.send(to, m)));
		session.game = game;
		net = new HostNet(session.state.code, name, {
			ready: () => game.addPlayer(HOST_ID, name),
			peerOpen: () => {},
			peerMessage: (id, m) => {
				if (m.t === 'hello') {
					if (!game.addPlayer(id, m.name)) net?.kick(id);
				} else if (m.t !== 'start' && m.t !== 'restart') game.handle(id, m);
			},
			peerClose: (id) => game.removePlayer(id),
			failed: (reason) => session.close(reason)
		});
		session.send = (m) => queueMicrotask(() => game.handle(HOST_ID, m));
		// a timer, not animation frames, so the game keeps going when the
		// host's tab is in the background (if slowly: browsers hold background
		// timers to about once a second)
		let last = performance.now();
		const timer = setInterval(() => {
			const now = performance.now();
			let elapsed = Math.min(1, (now - last) / 1000);
			last = now;
			while (elapsed >= TICK * 0.5) {
				game.tick(Math.min(TICK, elapsed));
				elapsed -= TICK;
			}
		}, TICK * 1000);
		session.stop = () => {
			clearInterval(timer);
			net?.close();
		};
		return session;
	}

	static join(code: string, name: string): Session {
		const session = new Session(code, false);
		const net = new PeerNet(code, name, {
			open: () => net.send({ t: 'hello', name }),
			message: (m) => session.receive(m),
			closed: (reason) => session.close(reason)
		});
		session.send = (m) => net.send(m);
		session.stop = () => net.close();
		return session;
	}

	private receive(m: HostMessage) {
		if (this.state.status === 'closed') return;
		switch (m.t) {
			case 'welcome':
				this.doors = m.doors;
				this.spawn = { x: m.x, z: m.z };
				this.set({ you: m.you, status: m.phase === 'lobby' ? 'lobby' : 'playing' });
				break;
			case 'lobby':
				this.set({ players: m.players });
				break;
			case 'start':
				this.set({ status: 'playing' });
				break;
			case 'door':
				this.doors[m.door] = true;
				break;
			case 'restart':
				this.doors = this.doors.map(() => false);
				break;
			case 'respawn':
				this.spawn = { x: m.x, z: m.z };
				break;
		}
		this.handler?.(m);
	}

	listen(handler: ((m: HostMessage) => void) | null) {
		this.handler = handler;
	}

	post(m: PlayerMessage) {
		this.send(m);
	}

	start() {
		this.send({ t: 'start' });
	}

	close(error: string | null = null) {
		if (this.state.status === 'closed') return;
		this.stop();
		this.set({ status: 'closed', error });
	}

	get inviteLink() {
		return `${location.origin}/zombies?lobby=${this.state.code}`;
	}

	private set(patch: Partial<SessionState>) {
		this.state = { ...this.state, ...patch };
		for (const l of this.listeners) l();
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getState = () => this.state;
}
