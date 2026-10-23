import { RELIABLE, type HostMessage, type PlayerMessage } from './protocol';
import { LOBBY_PATH, type SignalDown, type SignalUp } from './signal';

// WebRTC between the host and each player. The lobby's socket carries the
// offer, the answer and the network candidates; after that, every message goes
// straight between the two browsers on two data channels, one reliable and one
// that drops what arrives late.

const CONNECT_TIMEOUT = 15_000;
const RECONNECT_DELAY = 2000;
// skip a snapshot rather than queue it behind a slow connection
const MAX_BUFFERED = 64 * 1024;

type Signal = { sdp: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

function lobbySocket(code: string, role: 'host' | 'join', name: string) {
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	const query = new URLSearchParams({ role, name });
	return new WebSocket(`${scheme}://${location.host}${LOBBY_PATH}${code}?${query}`);
}

function sendOn(
	channels: { r?: RTCDataChannel; u?: RTCDataChannel },
	message: object,
	reliable: boolean
) {
	const channel = reliable ? channels.r : channels.u;
	if (channel?.readyState !== 'open') return;
	if (!reliable && channel.bufferedAmount > MAX_BUFFERED) return;
	channel.send(JSON.stringify(message));
}

export const REFUSALS: Record<string, string> = {
	'no-lobby': 'That lobby has closed',
	taken: 'That lobby is already hosted',
	full: 'That lobby is full',
	timeout: 'Could not reach the host',
	'host-left': 'The host left',
	lost: 'Lost the connection to the host',
	socket: 'could not reach the lobby'
};

type Peer = {
	pc: RTCPeerConnection;
	channels: { r?: RTCDataChannel; u?: RTCDataChannel };
	open: boolean;
	pending: RTCIceCandidateInit[];
};

export class HostNet {
	private ws!: WebSocket;
	private peers = new Map<string, Peer>();
	private iceServers: RTCIceServer[] = [];
	private welcomed = false;
	private closed = false;

	constructor(
		private code: string,
		private name: string,
		private events: {
			ready(): void;
			peerOpen(id: string): void;
			peerMessage(id: string, message: PlayerMessage): void;
			peerClose(id: string): void;
			failed(reason: string): void;
		}
	) {
		this.openSocket();
		setTimeout(() => {
			if (!this.welcomed && !this.closed) this.events.failed('socket');
		}, CONNECT_TIMEOUT);
	}

	// The lobby socket is what lets new players in. If it drops once the lobby
	// is open (a deploy restarts the lobby, or the network blips), the game
	// carries on and the socket comes back, so the invite link keeps working.
	private openSocket() {
		const ws = lobbySocket(this.code, 'host', this.name);
		this.ws = ws;
		ws.onmessage = (e) => {
			const message = JSON.parse(e.data) as SignalDown;
			if (message.type === 'welcome') {
				this.iceServers = message.iceServers;
				if (!this.welcomed) {
					this.welcomed = true;
					this.events.ready();
				}
			} else if (message.type === 'refused') {
				// a reconnect can be refused while the lobby still holds the old socket
				if (!this.welcomed) this.events.failed(message.reason);
			} else if (message.type === 'peer-joined') this.connect(message.id);
			else if (message.type === 'signal') void this.signal(message.from, message.data as Signal);
		};
		ws.onclose = () => {
			if (this.closed || !this.welcomed) return;
			setTimeout(() => {
				if (!this.closed && this.ws === ws) this.openSocket();
			}, RECONNECT_DELAY);
		};
		ws.onerror = () => {
			if (!this.welcomed) this.events.failed('socket');
		};
	}

	private connect(id: string) {
		const pc = new RTCPeerConnection({ iceServers: this.iceServers });
		const peer: Peer = { pc, channels: {}, open: false, pending: [] };
		this.peers.set(id, peer);
		const r = pc.createDataChannel('r');
		const u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
		for (const channel of [r, u]) {
			channel.onopen = () => {
				peer.channels[channel.label as 'r' | 'u'] = channel;
				if (!peer.open && peer.channels.r && peer.channels.u) {
					peer.open = true;
					this.events.peerOpen(id);
				}
			};
			channel.onmessage = (e) => {
				try {
					this.events.peerMessage(id, JSON.parse(e.data));
				} catch {
					// not ours
				}
			};
			channel.onclose = () => this.drop(id);
		}
		pc.onicecandidate = (e) => {
			if (e.candidate) this.relay(id, { candidate: e.candidate.toJSON() });
		};
		pc.onconnectionstatechange = () => {
			if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(id);
		};
		setTimeout(() => {
			if (!peer.open) this.drop(id);
		}, CONNECT_TIMEOUT);
		void pc
			.createOffer()
			.then((offer) => pc.setLocalDescription(offer))
			.then(() => this.relay(id, { sdp: pc.localDescription!.toJSON() }));
	}

	private async signal(from: string, data: Signal) {
		const peer = this.peers.get(from);
		if (!peer) return;
		if ('sdp' in data) {
			await peer.pc.setRemoteDescription(data.sdp);
			for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c);
		} else if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
		else peer.pending.push(data.candidate);
	}

	private relay(to: string, data: Signal) {
		if (this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({ type: 'signal', to, data } satisfies SignalUp));
	}

	private drop(id: string) {
		const peer = this.peers.get(id);
		if (!peer) return;
		this.peers.delete(id);
		peer.pc.close();
		if (peer.open) this.events.peerClose(id);
	}

	send(id: string, message: HostMessage) {
		const peer = this.peers.get(id);
		if (peer?.open) sendOn(peer.channels, message, RELIABLE(message));
	}

	// turns a peer away when the game is full, telling it why first
	turnAway(id: string) {
		this.send(id, { t: 'full' });
		setTimeout(() => this.drop(id), 500);
	}

	close() {
		this.closed = true;
		this.ws.close();
		for (const id of [...this.peers.keys()]) this.drop(id);
	}
}

export class PeerNet {
	private ws: WebSocket;
	private pc: RTCPeerConnection | null = null;
	private channels: { r?: RTCDataChannel; u?: RTCDataChannel } = {};
	private open = false;
	private closed = false;
	private hostId = '';
	private iceServers: RTCIceServer[] = [];
	private pending: RTCIceCandidateInit[] = [];

	constructor(
		code: string,
		name: string,
		private events: {
			open(): void;
			message(message: HostMessage): void;
			closed(reason: string): void;
		}
	) {
		this.ws = lobbySocket(code, 'join', name);
		this.ws.onmessage = (e) => {
			const message = JSON.parse(e.data) as SignalDown;
			if (message.type === 'welcome') {
				this.hostId = message.hostId;
				this.iceServers = message.iceServers;
			} else if (message.type === 'refused') this.fail(message.reason);
			else if (message.type === 'host-left') this.fail('host-left');
			else if (message.type === 'signal') void this.signal(message.data as Signal);
		};
		this.ws.onerror = () => this.fail('socket');
		setTimeout(() => {
			if (!this.open) this.fail('timeout');
		}, CONNECT_TIMEOUT);
	}

	private async signal(data: Signal) {
		if ('sdp' in data) {
			const pc = new RTCPeerConnection({ iceServers: this.iceServers });
			this.pc = pc;
			pc.onicecandidate = (e) => {
				if (e.candidate) this.relay({ candidate: e.candidate.toJSON() });
			};
			pc.ondatachannel = (e) => {
				const channel = e.channel;
				channel.onopen = () => {
					this.channels[channel.label as 'r' | 'u'] = channel;
					if (!this.open && this.channels.r && this.channels.u) {
						this.open = true;
						// the lobby's job is done
						this.ws.close();
						this.events.open();
					}
				};
				channel.onmessage = (m) => {
					try {
						this.events.message(JSON.parse(m.data));
					} catch {
						// not ours
					}
				};
				channel.onclose = () => this.fail('lost');
			};
			pc.onconnectionstatechange = () => {
				if (pc.connectionState === 'failed') this.fail('lost');
			};
			await pc.setRemoteDescription(data.sdp);
			await pc.setLocalDescription(await pc.createAnswer());
			this.relay({ sdp: pc.localDescription!.toJSON() });
			for (const c of this.pending.splice(0)) await pc.addIceCandidate(c);
		} else if (this.pc?.remoteDescription) await this.pc.addIceCandidate(data.candidate);
		else this.pending.push(data.candidate);
	}

	private relay(data: Signal) {
		if (this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({ type: 'signal', to: this.hostId, data } satisfies SignalUp));
	}

	private fail(reason: string) {
		if (this.closed) return;
		this.closed = true;
		this.ws.close();
		this.pc?.close();
		this.events.closed(reason);
	}

	send(message: PlayerMessage) {
		sendOn(this.channels, message, RELIABLE(message));
	}

	close() {
		this.closed = true;
		this.ws.close();
		this.pc?.close();
	}
}
