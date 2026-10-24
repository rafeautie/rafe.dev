import { HostGame, TICK, type GameSave } from './host';
import { HostNet, PeerNet } from './net';
import type { HostMessage, Loadout, PlayerMessage } from './protocol';
import { makeLobbyCode } from './signal';

export type SessionState = {
	status: 'connecting' | 'lobby' | 'playing' | 'closed';
	code: string;
	isHost: boolean;
	you: string | null;
	players: { id: string; name: string }[];
	error: string | null;
	// the connection to the host dropped, and it's being found again (or
	// this player is taking over as host)
	reconnecting: boolean;
};

// how often the host hands everyone a copy of the game, in case it leaves
const SAVE_EVERY = 2000;
// how long to keep trying to get back into a game before giving up
const RECONNECT_FOR = 30_000;
const RETRY_EVERY = 1500;
// with no host in the lobby, the next player in line takes over after this
// long, and each after them waits this much longer, so two don't both try
const TAKE_OVER_AFTER = 3500;
const TAKE_OVER_STEP = 4000;

// A player's id for this lobby, the same through dropped connections and
// reloads of the page, so the host knows them when they come back.
function playerId(code: string): string {
	const key = `zombies-id-${code}`;
	try {
		const saved = sessionStorage.getItem(key);
		if (saved) return saved;
	} catch {
		// storage blocked: a fresh id each time
	}
	const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
		b.toString(16).padStart(2, '0')
	).join('');
	try {
		sessionStorage.setItem(key, id);
	} catch {
		// kept for this visit only
	}
	return id;
}

// One player's place in a game, from the lobby on. The host's session runs the
// game and talks to its own player directly; everyone else's talks to the host
// over WebRTC. If a guest's connection drops, it finds the host again; if the
// host leaves, the next player in line carries the game on from the last copy
// the host sent. The game view listens through `listen`; the lobby screen
// reads `state`.
export class Session {
	state: SessionState;
	// what the game view needs that arrived before it was there
	doors: boolean[] = [];
	spawn: { x: number; z: number } | null = null;
	// the guns this player had, coming back into a game after reloading
	loadout: Loadout | null = null;
	// the game itself, on the host
	game: HostGame | null = null;
	private readonly id: string;
	private listeners = new Set<() => void>();
	private handler: ((m: HostMessage) => void) | null = null;
	private send: (m: PlayerMessage) => void = () => {};
	private stop: () => void = () => {};
	// the last copy of the game from the host
	private save: GameSave | null = null;
	private connected = false;

	private constructor(
		code: string,
		isHost: boolean,
		private name: string
	) {
		this.id = playerId(code);
		this.state = {
			status: 'connecting',
			code,
			isHost,
			you: null,
			players: [],
			error: null,
			reconnecting: false
		};
		// let the others know straight away when the tab closes, rather than
		// leaving them to notice the silence
		addEventListener('pagehide', this.leaving);
	}

	private leaving = () => this.close();

	static host(name: string): Session {
		const session = new Session(makeLobbyCode(), true, name);
		session.runHost(null);
		return session;
	}

	static join(code: string, name: string): Session {
		const session = new Session(code, false, name);
		session.runGuest();
		return session;
	}

	// Runs the game here: a new one, or one carried on from a save.
	private runHost(save: GameSave | null) {
		const deliver = (m: HostMessage) => queueMicrotask(() => this.receive(m));
		// each player's connection, by player id, and the other way round
		const peerOf = new Map<string, string>();
		const playerOf = new Map<string, string>();
		let net: HostNet | null = null;
		const send = (to: string, m: HostMessage) => {
			if (to === this.id) deliver(m);
			else {
				const peer = peerOf.get(to);
				if (peer) net?.send(peer, m);
			}
		};
		const game = save ? HostGame.restore(send, save, this.id) : new HostGame(send);
		this.game = game;
		net = new HostNet(this.state.code, this.name, {
			ready: () => {
				game.addPlayer(this.id, this.name);
				if (save) this.set({ reconnecting: false, isHost: true });
			},
			peerOpen: () => {},
			peerMessage: (peer, m) => {
				if (m.t === 'hello') {
					const id = typeof m.id === 'string' && m.id ? m.id.slice(0, 24) : peer;
					// the same player on a new connection replaces the old one
					const old = peerOf.get(id);
					if (old && old !== peer) {
						playerOf.delete(old);
						net?.kick(old);
					}
					peerOf.set(id, peer);
					playerOf.set(peer, id);
					if (!game.addPlayer(id, m.name)) net?.turnAway(peer);
					return;
				}
				const id = playerOf.get(peer);
				if (id && m.t !== 'start' && m.t !== 'restart') game.handle(id, m);
			},
			peerClose: (peer) => {
				const id = playerOf.get(peer);
				playerOf.delete(peer);
				if (id && peerOf.get(id) === peer) {
					peerOf.delete(id);
					game.leave(id);
				}
			},
			failed: (reason) => {
				// someone else got there first: join them instead
				if (save && reason === 'taken') {
					this.stop();
					this.game = null;
					this.runGuest();
				} else this.close(reason);
			}
		});
		this.send = (m) => queueMicrotask(() => game.handle(this.id, m));
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
		const saver = setInterval(() => {
			if (!peerOf.size) return;
			const copy: HostMessage = { t: 'save', save: game.save(this.id) };
			for (const id of peerOf.keys()) send(id, copy);
		}, SAVE_EVERY);
		this.stop = () => {
			clearInterval(timer);
			clearInterval(saver);
			net?.close();
		};
	}

	// Connects to the host as a player; if that drops once in, tries again.
	private runGuest(started = performance.now()) {
		let opened = false;
		const net = new PeerNet(this.state.code, this.name, {
			open: () => {
				opened = true;
				this.connected = true;
				net.send({ t: 'hello', name: this.name, id: this.id });
				if (this.state.reconnecting) this.set({ reconnecting: false });
			},
			message: (m) => {
				if (m.t === 'save') this.save = m.save;
				else this.receive(m);
			},
			closed: (reason) => {
				if (this.state.status === 'closed') return;
				// never got in the first time: nothing to come back to
				if (!this.connected || reason === 'full' || reason === 'taken') return this.close(reason);
				this.recover(opened ? performance.now() : started, reason);
			}
		});
		this.send = (m) => net.send(m);
		this.stop = () => net.close();
	}

	// The connection to the host is gone: try again for a while, and if there
	// is no host at all, the next in line takes over.
	private recover(since: number, reason: string) {
		this.set({ reconnecting: true });
		const waited = performance.now() - since;
		if (waited > RECONNECT_FOR) return this.close('lost');
		const save = this.save;
		if (reason === 'no-lobby' || reason === 'host-left') {
			const line = save ? save.players.map((p) => p.id).filter((id) => id !== save.host) : [];
			const place = line.indexOf(this.id);
			if (save && place >= 0 && waited > TAKE_OVER_AFTER + place * TAKE_OVER_STEP) {
				this.stop();
				this.runHost(save);
				return;
			}
		}
		setTimeout(() => {
			if (this.state.status !== 'closed') this.runGuest(since);
		}, RETRY_EVERY);
	}

	private receive(m: HostMessage) {
		if (this.state.status === 'closed') return;
		switch (m.t) {
			case 'full':
				this.close('full');
				return;
			case 'welcome':
				this.doors = m.doors;
				this.spawn = { x: m.x, z: m.z };
				this.loadout = m.loadout;
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
		removeEventListener('pagehide', this.leaving);
		this.stop();
		this.set({ status: 'closed', error, reconnecting: false });
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
