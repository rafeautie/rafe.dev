import type { createGameActor } from './worker/game-state-machine'
import type { StateValue } from 'xstate'

export type GameActorRef = ReturnType<typeof createGameActor>
export type GameSnapshot = ReturnType<GameActorRef['getSnapshot']>

export type CardRank =
  | 'E1'
  | 'E2'
  | 'E3'
  | 'R'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | '11'
  | '12'

export type CardSuit =
  | 'brake'
  | 'gear-stick'
  | 'pedals'
  | 'piston'
  | 'steering-wheel'
  | 'suspension'

export interface DeckCard {
  id: string
  rank: CardRank
  suit: CardSuit
}

export type Deck = Array<DeckCard>

export type DeckSortMode = 'rank' | 'suit'

export interface Player {
  id: string
  name: string
  teamId?: string
}

export type CarColor = 'red' | 'blue' | 'green' | 'orange'
export interface CarBlueprint {
  id: string
  playerId: string
  color: CarColor
}

export interface CarState extends CarBlueprint {
  cardsRemaining: number
  drawPile: Deck
  discardPile: Deck
  status: 'ready' | 'eliminated'
}

export interface ChallengeSlot {
  id: string
  attackerId: string
  defenderId: string
}

export interface TurnState {
  activeCarId: string | null
  passes: number
}

export interface Scoreboard {
  drivers: Record<string, number>
  teams: Record<string, number>
}

export type GridPosition = Record<string, number>

type CardPlayEventMetadata = {
  id: string
  sequence: number
  createdAt: string
  raceNumber: number
}

export type QualifyingResult = {
  carId: string
  cards: Deck
  position: number
  score: number
  total: number
}

export type QualifyingResolutionEvent = CardPlayEventMetadata & {
  type: 'qualifyingResolution'
  results: Array<QualifyingResult>
}

export type ChallengeResolutionEvent = CardPlayEventMetadata & {
  type: 'challengeResolution'
  challengeId: string
  attackerId: string
  defenderId: string
  winnerId: string
  loserId: string
  attackerCards: Deck
  defenderCards: Deck
  attackerTotal: number
  defenderTotal: number
}

export type ExtendPlayEvent = CardPlayEventMetadata & {
  type: 'extendPlay'
  carId: string
  cards: Deck
  fromPosition: number
  toPosition: number
  total: number
}

export type DiscardPlayEvent = CardPlayEventMetadata & {
  type: 'discardPlay'
  carId: string
  cards: Deck
  total: number
}

export type CardPlayEvent =
  | QualifyingResolutionEvent
  | ChallengeResolutionEvent
  | ExtendPlayEvent
  | DiscardPlayEvent

export type CardUsageResult = {
  cars: Record<string, CarState>
  finalLapTriggered: boolean
  finishingOrder: Array<string>
  eliminationMessage?: string
}

type WithoutEventMetadata<T> = T extends unknown
  ? Omit<T, 'id' | 'sequence' | 'createdAt' | 'raceNumber'>
  : never

export type CardPlayEventStateSlice = Pick<
  GameContext,
  'cardPlayEvents' | 'completedRaces' | 'totalRaces'
>

export type CardPlayEventInput = WithoutEventMetadata<CardPlayEvent>

export interface GameContext {
  players: Array<Player>
  cars: Record<string, CarState>
  gridPosition: GridPosition
  turnNumber: number
  pendingQualifyingSelections: Record<string, Deck>
  pendingChallengeSelections: Record<string, Deck>
  pendingChallenge: ChallengeSlot | null
  turn: TurnState
  scoreboard: Scoreboard
  finishingOrder: Array<string>
  totalRaces: number
  completedRaces: number
  finalLapTriggered: boolean
  log: Array<string>
  cardPlayEvents: Array<CardPlayEvent>
}

export type GameEvent =
  | { type: 'ADD_PLAYER'; player: Player }
  | { type: 'REMOVE_PLAYER'; playerId: string }
  | { type: 'START_SETUP' }
  | { type: 'PLAY_CARDS'; carId: string; cards: Deck }
  | { type: 'DISCARD_CARDS'; carId: string; cards: Deck }
  | { type: 'RESET' }

export type ClientGameEvent =
  | { type: 'START_SETUP' }
  | { type: 'PLAY_CARDS'; cards: Deck }
  | { type: 'DISCARD_CARDS'; cards: Deck }

export type RoomAckMessage = {
  type: 'room/ack'
  roomId: string
  player: Player
}

export enum GameStateValue {
  WaitingForPlayers = 'waitingForPlayers',
  SetupAssignCars = 'setup.assignCars',
  SetupDealCards = 'setup.dealCards',
  QualifyingSelection = 'qualifying.selection',
  QualifyingReady = 'qualifying.ready',
  RacingLapGate = 'racing.lapGate',
  RacingAwaitingAction = 'racing.awaitingAction',
  RacingChallengeSelection = 'racing.challengeSelection',
  RacingPostChallenge = 'racing.postChallenge',
  RacingTurnEnded = 'racing.turnEnded',
  Scoring = 'scoring',
  PostRace = 'postRace',
  ChampionshipComplete = 'championshipComplete',
}

export type GameStatePayload = {
  value: StateValue
  context: GameContext
  statePath: GameStateValue
}

export type GameStateMessage = {
  type: 'game/state'
  state: GameStatePayload
}

export type ErrorMessage = {
  type: 'error'
  message: string
}

export type RaceServerMessage = RoomAckMessage | GameStateMessage | ErrorMessage

export type RaceClientMessage = ClientGameEvent

export interface SessionMetadata {
  roomId: string
  player: Player
}
