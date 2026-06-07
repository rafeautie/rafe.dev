export type Suit = 'gears' | 'fuel' | 'pistons' | 'steering-wheels' | 'shift-gates' | 'belt';

export type Card =
	| { id: string; kind: 'regular'; value: number; suit: Suit }
	| { id: string; kind: 'redline'; suit: Suit };

export interface Car {
	id: number;
	position: number;
	hand: Card[];
	deck: Card[];
	discard: Card[];
	// Per-car race stats, accumulated by the engine as challenges resolve (ADR
	// 0001). Optional only for backward-compat with game state persisted before the
	// feature shipped; createGame initialises them to 0 for every new game.
	overtakes?: number;
	defensesHeld?: number;
	/** Starting grid position, snapshotted when the grid locks in. Drives the
	 *  "places gained" behind Driver of the Day. */
	gridPosition?: number;
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

interface PendingChallenge {
	challengerCarId: number;
	challengerCards?: Card[];
	defenderCarId: number;
	defenderCards?: Card[];
}

export interface ResolvedChallenge {
	challengerCarId: number;
	challengerCards: Card[];
	defenderCarId: number;
	defenderCards: Card[];
	outcome: 'challenger' | 'defender' | 'tie';
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
	// The Season this Race belongs to: completed Races accrue here as each Race
	// ends (ADR 0005). Always present for a started game (createGame seeds it).
	season: SeasonState;
}

export type Action =
	| { type: 'START_GAME' }
	| { type: 'QUALIFY'; carId: number; cardIds: string[] }
	| { type: 'DISCARD'; carId: number; cardId: string }
	| { type: 'EXTEND'; carId: number; cardId: string }
	| { type: 'COMMIT_CHALLENGE_CARDS'; carId: number; cardIds: string[] }
	| { type: 'PLAY_AGAIN' };

// Session-level controls the host sends to drive the Season loop around the
// per-Race engine. The DO orchestrates these (deal a Race, advance, reset) — they
// are not per-turn engine Actions.
export type SessionMessage =
	| { type: 'START_SEASON' }
	| { type: 'ADVANCE_RACE' }
	| { type: 'NEW_SEASON' };

// Player-scoped controls a non-host can send for their own session — distinct
// from the host-only SessionMessage. SET_NAME renames the sender in the lobby.
export type PlayerMessage = { type: 'SET_NAME'; name: string };

// WebSocket message shapes (client → server): the per-turn car Actions, the
// host Season controls, and per-player controls. JOIN is handled at WebSocket
// handshake time via URL params.
export type ClientMessage = Action | SessionMessage | PlayerMessage;

// ─── Race events ────────────────────────────────────────────────────────────────
//
// Discrete "what just happened" events — the single source for both the game log
// (the persisted, scrollable history) and presentation choreography (animating
// transitions the engine passes through instantaneously). State is the source of
// truth for *what is*; events describe *what changed*, carrying enough structured
// data to render a log line and drive an animation without diffing snapshots —
// e.g. a resolved challenge carries both hands and the pre-swap positions.
//
// The client renders each variant directly (badges, cards, copy), so events hold
// structured data only — no pre-formatted text or markup.
export type RaceEvent =
	| { type: 'gameStarted' }
	| { type: 'qualifyingLockedIn'; carId: number }
	| { type: 'qualified'; carId: number; cards: Card[] }
	| { type: 'gridSet' }
	| { type: 'discarded'; carId: number; card?: Card }
	| { type: 'extended'; carId: number; card?: Card; newPosition?: number }
	| {
			type: 'challengeResolved';
			challengerCarId: number;
			defenderCarId: number;
			challengerCards: Card[];
			defenderCards: Card[];
			outcome: 'challenger' | 'defender' | 'tie';
	  };

// What every `applyAction` returns: the next state and the ordered events that
// transition produced. The engine is the single producer of the RaceEvent
// channel (ADR 0003) — callers persist `state`, then log/broadcast `events`.
export interface ActionResult {
	state: GameState;
	events: RaceEvent[];
}

// Public state (hand contents hidden for opponents)
export interface PublicCarState {
	id: number;
	position: number;
	handSize: number;
	hand?: Card[];
	liveryId: number;
	/** 0-based team index. Both of a player's cars share it in Team Mode. */
	teamId: number;
	// Set only for the viewer's own cars during qualifying — the cards locked in
	// but not yet revealed/resolved. Lets the standings show your own selection.
	qualifyingCards?: Card[];
	// Per-car race stats for the results screen. Always present (defaulted to 0 in
	// the projection), unlike the optional engine-side fields on Car.
	overtakes: number;
	defensesHeld: number;
	gridPosition: number;
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
	challengeWinsThisTurn: number;
	// challengerCards only sent to the challenger; defenderCards only sent to the defender.
	// The *Committed flags expose whether each side has locked in its (hidden) cards
	// so opponents can show a face-down card without seeing the values.
	pendingChallenge?: {
		challengerCarId: number;
		defenderCarId: number;
		challengerCards?: Card[];
		defenderCards?: Card[];
		challengerCommitted: boolean;
		defenderCommitted: boolean;
	};
	qualifiedCarIds: number[];
	finalScores?: Score[];
	// The Season standings + fact table for the results screen, when a Season is
	// active. Absent in the lobby of a not-yet-started game.
	season?: PublicSeasonState;
	// The game log: an append-only, capped history of events. The newest also
	// arrive transiently in the STATE_UPDATE envelope's `events` for animation.
	log: RaceEvent[];
}

// ─── createGame inputs ────────────────────────────────────────────────────────

export interface CreateGamePlayer {
	id: string;
	isHost: boolean;
}

export interface CreateGameOpts {
	suits: Suit[];
	/** Number of cars per player. 2 for 2-player mode, 1 otherwise. */
	carsPerPlayer?: number;
	/** Optional RNG for the deck shuffle. Defaults to Math.random. */
	rng?: () => number;
	/** The Season to carry into this Race. Defaults to a fresh empty Season. */
	season?: SeasonState;
}

// ─── Legal-moves shapes & advertisement ───────────────────────────────────────
//
// The shape interfaces are intentionally narrow so that carLegalMoves works with
// both the server-side GameState and the client-side PublicGameState — the caller
// passes whichever it has.

interface LegalMovesCarShape {
	id: number;
	position: number;
}

/** Minimal state shape accepted by legality predicates. */
export interface LegalMovesStateShape {
	cars: LegalMovesCarShape[];
	pendingThisRound: number[];
	pendingChallenge?: {
		challengerCarId: number;
		defenderCarId: number;
		// Accept any truthy value for committed/card-present checks
		challengerCards?: unknown;
		defenderCards?: unknown;
	};
}

/** Role this car plays in the current pending challenge, if any. */
export type ChallengeRole = 'challenger' | 'defender' | null;

export interface CarLegalMoves {
	/** True if it is this car's turn (it is first in pendingThisRound). */
	isMyTurn: boolean;
	/** Role in the active challenge, or null if no active challenge concerns this car. */
	challengeRole: ChallengeRole;
	/** True if this car has already committed challenge cards and is waiting. */
	hasCommittedChallenge: boolean;
	/**
	 * Per-card extend eligibility. Index matches the hand array passed in.
	 * Always an empty array when the car has no hand (opponent, hidden hand).
	 */
	cardCanExtend: boolean[];
}

// ─── Card-selection state machine ─────────────────────────────────────────────
//
// Tracks per-car card selection: a main card id plus an optional Redline pairing
// id.
//
// Shape: Record<carId, string[]>
//   []                  – nothing selected
//   [mainId]            – main card selected
//   [mainId, redlineId] – main card + Redline pair

export type SelectionState = Record<number, string[]>;

export type SelectionAction =
	| { type: 'SELECT_MAIN'; carId: number; cardId: string | null }
	| { type: 'TOGGLE_REDLINE'; carId: number; redlineId: string }
	| { type: 'CLEAR'; carId: number }
	| { type: 'CLEAR_ALL' };

// ─── Race view-model ──────────────────────────────────────────────────────────
//
// Everything the RaceView component needs to render: the round-level sets, the
// currently-viewed car's hand/selection, and the enable/disable gating for each
// action button.

export interface RaceView {
	// ─── Round-level ──────────────────────────────────────────────────
	/** Car ids owned by the viewer. */
	myCarIds: number[];
	/** The viewer's own cars. */
	myCars: PublicCarState[];
	/** Car(s) on the clock right now — drives the standings highlight. One car on
	 *  a solo turn, both duellists during a challenge, all cars during qualifying. */
	activeCarIds: Set<number>;
	/** Cars that still owe a card right now — challenge-aware (drives the tab beam). */
	carsNeedingCard: number[];
	/** True during the qualifying phase. */
	isQualifying: boolean;
	/** Hold all cars at the start line (qualifying, pre-reveal). */
	holdAtStart: boolean;

	// ─── Currently-viewed car ─────────────────────────────────────────
	/** Resolved id of the viewed car (preferred tab, or the first owned car). */
	selectedCarId: number | undefined;
	/** The viewed car's hand (empty for opponents / when unknown). */
	hand: Card[];
	/** ID of the selected main card, or null. */
	mainCardId: string | null;
	/** ID of the paired Redline, or null. */
	pairCardId: string | null;
	/** The selected card(s), in [main, redline?] order, for the action summary. */
	selectedCards: Card[];
	/** Whether a Redline can be paired onto the current selection. Always false on
	 *  a solo turn — pairing is a challenge-only mechanic. */
	canPairRedline: boolean;
	/** Button label for the challenge action: Attack / Defend / Challenge. */
	challengeLabel: string;

	// ─── Action gating ────────────────────────────────────────────────
	canQualify: boolean;
	canDiscard: boolean;
	canExtend: boolean;
	canChallenge: boolean;
}

// ─── Per-Race results aggregation ─────────────────────────────────────────────

export interface DriverOfTheDay {
	carId: number;
	placesGained: number;
}

// ─── Season / Championship ────────────────────────────────────────────────────
//
// A Season is a fixed sequence of Races played in one room. The engine accrues a
// per-Race, per-car fact table onto GameState as each Race ends (ADR 0005); the
// Drivers'/Constructors' Championship standings, the results matrix, the running
// points, and the stat leaders are all pure derivations over it (engine/season.ts).

/** One car's outcome in one Race — the fact-table row snapshotted at results time. */
export interface RaceCarResult {
	carId: number;
	rank: number;
	points: number;
	gridPosition: number;
	overtakes: number;
	defensesHeld: number;
}

/** One completed Race: one result row per car. */
export interface RaceResult {
	results: RaceCarResult[];
}

/** The Season carried on GameState: its length and the Races completed so far. */
export interface SeasonState {
	totalRaces: number;
	races: RaceResult[];
}

/** A row of the Drivers' Championship — Season points per driver. */
export interface DriverStanding {
	carId: number;
	liveryId: number;
	points: number;
	wins: number;
}

/** A row of the Constructors' Championship — Season points per team (Team Mode). */
export interface ConstructorStanding {
	teamId: number;
	teamName: string;
	carIds: number[];
	points: number;
	wins: number;
}

/** The Season projected to the client for the results screen. */
export interface PublicSeasonState {
	totalRaces: number;
	racesCompleted: number;
	/** Race to display: the in-progress Race, or the just-finished one in 'results'. */
	raceNumber: number;
	isComplete: boolean;
	/** The fact table — the client derives the matrix / running points / stats from it. */
	races: RaceResult[];
	driverStandings: DriverStanding[];
	/** Present only in Team Mode. */
	constructorStandings?: ConstructorStanding[];
}

// ─── Durable Object state (mirrors the shape stored in the DO) ─────────────────
//
// Defined here so projection.ts is self-contained and testable without importing
// from the DO module.

interface DOPlayerEntry {
	id: string;
	name: string;
	isHost: boolean;
	connected: boolean;
}

interface DOGameState {
	phase: Phase;
	players: Array<{ id: string; carIds: number[] }>;
	cars: Array<{
		id: number;
		position: number;
		hand: Card[];
		deck: Card[];
		discard: Card[];
		overtakes?: number;
		defensesHeld?: number;
		gridPosition?: number;
	}>;
	pendingThisRound: number[];
	endAfterRound: boolean;
	challengeWinsThisTurn: number;
	qualifyingCards: Record<number, Card[]>;
	pendingChallenge?: {
		challengerCarId: number;
		challengerCards?: Card[];
		defenderCarId: number;
		defenderCards?: Card[];
	};
	season?: SeasonState;
}

export interface ProjectionDOState {
	players: DOPlayerEntry[];
	phase: Phase;
	gameState?: DOGameState;
	log: RaceEvent[];
	carLiveries: Record<number, number>;
}

// ─── F1 livery ────────────────────────────────────────────────────────────────

export interface F1Livery {
	id: number;
	/** 0-based team index shared by both of a team's liveries. */
	teamId: number;
	teamName: string;
	driverName: string;
	number: number;
	primary: string;
	secondary: string;
	/**
	 * Driver-distinguishing colour, painted on the cockpit/camera housing. Mirrors
	 * the FIA onboard-camera convention used to tell teammates apart: the team's
	 * first car carries black housings, the second fluorescent yellow.
	 */
	tertiary: string;
}
