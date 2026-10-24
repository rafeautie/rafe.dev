// What a /zombies lobby's signaling socket carries. The lobby only introduces
// players: the host's browser runs the game, and every other player connects
// to it directly over WebRTC, using this socket to trade the offers and
// network candidates that set that connection up.

export const LOBBY_PATH = '/zombies/lobby/';
export const MAX_PLAYERS = 4;

// Codes skip 0/O and 1/I/L, so one read aloud or typed from a screenshot works.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export function makeLobbyCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
	return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function isLobbyCode(code: string): boolean {
	return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

export type Role = 'host' | 'join';

// browser to lobby
export type SignalUp = { type: 'signal'; to: string; data: unknown };

// lobby to browser
export type SignalDown =
	| { type: 'welcome'; id: string; hostId: string; iceServers: RTCIceServer[] }
	| { type: 'peer-joined'; id: string; name: string }
	| { type: 'peer-left'; id: string }
	| { type: 'signal'; from: string; data: unknown }
	| { type: 'host-left' }
	| { type: 'refused'; reason: 'no-lobby' | 'taken' | 'full' };
