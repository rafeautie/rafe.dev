export type Card = { kind: 'regular'; value: number } | { kind: 'redline' };

export interface Car {
	id: number;
	position: number;
	hand: Card[];
	deck: Card[];
	discard: Card[];
}

export interface Player {
	id: string;
	carIds: number[];
	isHost: boolean;
}

export interface Score {
	carId: number;
	rank: number;
	points: number;
}

export interface PendingChallenge {
	challengerCarId: number;
	challengerCards: Card[];
	defenderCarId: number;
}

export type Phase = 'lobby' | 'qualifying' | 'race' | 'results';

export interface GameState {
	phase: Phase;
	players: Player[];
	cars: Car[];
	pendingThisRound: number[];
	endAfterRound: boolean;
	pendingChallenge?: PendingChallenge;
	challengeWinsThisTurn: number;
	qualifyingCards: Record<number, Card[]>;
}

export type Action =
	| { type: 'START_GAME' }
	| { type: 'QUALIFY'; carId: number; cardIndices: number[] }
	| { type: 'DISCARD'; carId: number; cardIndex: number }
	| { type: 'EXTEND'; carId: number; cardIndex: number }
	| { type: 'CHALLENGE'; carId: number; cardIndices: number[]; defenderCarId: number }
	| { type: 'DEFEND'; carId: number; cardIndices: number[] }
	| { type: 'PLAY_AGAIN' };

// WebSocket message shapes (client → server)
export type ClientMessage =
	| { type: 'JOIN'; playerId: string }
	| { type: 'START_GAME' }
	| { type: 'QUALIFY'; carId: number; cardIndices: number[] }
	| { type: 'DISCARD'; carId: number; cardIndex: number }
	| { type: 'EXTEND'; carId: number; cardIndex: number }
	| { type: 'CHALLENGE'; carId: number; cardIndices: number[]; defenderCarId: number }
	| { type: 'DEFEND'; carId: number; cardIndices: number[] }
	| { type: 'PLAY_AGAIN' };

// WebSocket message shapes (server → client)
export type ServerMessage =
	| { type: 'STATE_UPDATE'; state: PublicGameState }
	| { type: 'ERROR'; message: string };

// Public state (hand contents hidden for opponents)
export interface PublicCarState {
	id: number;
	position: number;
	handSize: number;
	hand?: Card[];
}

export interface PublicPlayer {
	id: string;
	name: string;
	carIds: number[];
	isHost: boolean;
	connected: boolean;
}

export interface PublicGameState {
	phase: Phase;
	players: PublicPlayer[];
	cars: PublicCarState[];
	pendingThisRound: number[];
	endAfterRound: boolean;
	pendingChallenge?: Omit<PendingChallenge, 'challengerCards'>;
	qualifiedCarIds: number[];
	finalScores?: Score[];
}
