import { randomBytes, randomUUID } from 'node:crypto'
import { shuffle } from 'lodash'
import {
  BASE_SUIT_SYMBOLS,
  CARD_RANK_SEQUENCE,
  CARD_VALUES,
  CAR_COLOR_PALETTE,
  DEFAULT_ROOM_ID_ALPHABET,
  DEFAULT_ROOM_ID_LENGTH,
  EXTEND_CARDS,
  REDLINE_CARD,
} from '../constants'
import { getCarsInTrackOrder, getRedlineCount, sanitizeCards } from '../utils'

import type { StateValue } from 'xstate'
import type {
  CarBlueprint,
  CarColor,
  CarState,
  CardPlayEvent,
  CardPlayEventInput,
  CardPlayEventStateSlice,
  CardUsageResult,
  Deck,
  GameContext,
  GameSnapshot,
  GameStateValue,
  GridPosition,
  Player,
  Scoreboard,
  TurnState,
} from '../types'

const getCurrentRaceNumber = (state: CardPlayEventStateSlice): number => {
  const tentative = state.completedRaces + 1
  if (tentative > state.totalRaces) {
    return state.totalRaces
  }
  return tentative
}

export const appendCardPlayEvent = (
  state: CardPlayEventStateSlice,
  payload: CardPlayEventInput,
): { cardPlayEvents: Array<CardPlayEvent>; created: CardPlayEvent } => {
  const sequence = state.cardPlayEvents.length
  const created = {
    id: randomUUID(),
    sequence,
    createdAt: new Date().toISOString(),
    raceNumber: getCurrentRaceNumber(state),
    ...payload,
  } as CardPlayEvent
  return {
    cardPlayEvents: [...state.cardPlayEvents, created],
    created,
  }
}

export const appendCardPlayEvents = (
  state: CardPlayEventStateSlice,
  payloads: Array<CardPlayEventInput>,
): { cardPlayEvents: Array<CardPlayEvent>; created: Array<CardPlayEvent> } => {
  let cardPlayEvents = state.cardPlayEvents
  const created: Array<CardPlayEvent> = []
  payloads.forEach((payload) => {
    const result = appendCardPlayEvent({ ...state, cardPlayEvents }, payload)
    cardPlayEvents = result.cardPlayEvents
    created.push(result.created)
  })
  return { cardPlayEvents, created }
}

/** Provides a blank turn descriptor for the current lap cycle. */
export const emptyTurnState = (): TurnState => ({
  activeCarId: null,
  passes: 0,
})

/** Builds the default machine context for a fresh race session. */
export const createInitialContext = (totalRaces: number): GameContext => ({
  players: [],
  cars: {},
  gridPosition: {},
  turnNumber: 0,
  pendingQualifyingSelections: {},
  pendingChallengeSelections: {},
  pendingChallenge: null,
  turn: emptyTurnState(),
  scoreboard: { drivers: {}, teams: {} },
  finishingOrder: [],
  totalRaces,
  completedRaces: 0,
  finalLapTriggered: false,
  log: [],
  cardPlayEvents: [],
})

/** Ensures scoreboard tables have entries for a driver's individual and team totals. */
export const ensureScoreEntries = (
  scoreboard: Scoreboard,
  player: Player,
): Scoreboard => {
  const next: Scoreboard = {
    drivers: { ...scoreboard.drivers },
    teams: { ...scoreboard.teams },
  }

  if (!(player.id in next.drivers)) {
    next.drivers[player.id] = 0
  }

  const teamKey = player.teamId ?? player.id
  if (!(teamKey in next.teams)) {
    next.teams[teamKey] = 0
  }

  return next
}

/** Builds a positional grid map from the supplied ordered car list. */
export const buildGridPosition = (carIds: Array<string>): GridPosition => {
  return carIds.reduce<GridPosition>((acc, carId, index) => {
    acc[carId] = index
    return acc
  }, {})
}

const findCarAtPosition = (
  gridPosition: GridPosition,
  position: number,
): string | null => {
  for (const [carId, value] of Object.entries(gridPosition)) {
    if (value === position) return carId
  }
  return null
}

/** Finds the closest car ahead of the provided car (may have gaps). */
export const getCarAhead = (
  gridPosition: GridPosition,
  carId: string,
): string | null => {
  const currentPosition = gridPosition[carId]
  let candidate: { id: string; position: number } | null = null
  for (const [otherId, position] of Object.entries(gridPosition)) {
    if (otherId === carId) continue
    if (position > currentPosition) {
      if (!candidate || position < candidate.position) {
        candidate = { id: otherId, position }
      }
    }
  }
  return candidate?.id ?? null
}

/** Soft helper to check whether a car has an immediately open space in front. */
export const hasOpenSpaceAhead = (
  gridPosition: GridPosition,
  carId: string,
): boolean => {
  const currentPosition = gridPosition[carId]
  const targetPosition = currentPosition + 1
  return findCarAtPosition(gridPosition, targetPosition) == null
}

/** True when `behindCarId` is exactly one space behind `aheadCarId`. */
export const areCarsAdjacent = (
  gridPosition: GridPosition,
  behindCarId: string,
  aheadCarId: string,
): boolean => {
  const behindPosition = gridPosition[behindCarId]
  const aheadPosition = gridPosition[aheadCarId]
  return aheadPosition - behindPosition === 1
}

/** Returns the last-place car in the lane (tail of the grid). */
export const getLastPlaceCar = (gridPosition: GridPosition): string | null => {
  return getCarsInTrackOrder(gridPosition).at(0) || null
}

/** Moves a car forward one position, swapping if another car occupies that slot. */
export const moveCarForwardOne = (
  gridPosition: GridPosition,
  carId: string,
): GridPosition => {
  const currentPosition = gridPosition[carId]
  const targetPosition = currentPosition + 1
  const occupant = findCarAtPosition(gridPosition, targetPosition)
  const next: GridPosition = { ...gridPosition }
  next[carId] = targetPosition
  if (occupant) {
    next[occupant] = currentPosition
  }
  return next
}

/** True when a card play represents a single-card extend action. */
export const isExtendCardPlay = (cards: Deck): boolean => {
  if (cards.length !== 1) return false
  const [card] = cards
  return Boolean(card) && EXTEND_CARDS.includes(card.rank)
}

/**
 * Generate a cryptographically secure room code.
 * Uses rejection sampling to avoid bias.
 *
 * @param length - number of characters in the room code (default 6)
 * @param chars - optional custom alphabet
 */
export function generateRoomCode(
  length = DEFAULT_ROOM_ID_LENGTH,
  chars = DEFAULT_ROOM_ID_ALPHABET,
): string {
  const alpha = chars
  const n = alpha.length
  if (n < 2) throw new Error('Alphabet must contain at least 2 characters')

  const out: Array<string> = []
  const maxByte = 256 - (256 % n)

  while (out.length < length) {
    // Request a few random bytes at once for efficiency
    const buf = randomBytes(Math.ceil((length - out.length) * 1.3))
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const val = buf[i]
      if (val >= maxByte) continue // reject to avoid modulo bias
      out.push(alpha[val % n])
    }
  }

  return out.join('')
}

/**
 * Normalize and validate a room code string.
 * - Trims, uppercases, and removes characters not in the provided alphabet.
 *
 * @param input - raw input (may contain spaces, dashes, etc.)
 * @param chars - optional alphabet to validate against
 */
export function normalizeRoomCode(
  input: string,
  chars = DEFAULT_ROOM_ID_ALPHABET,
): string {
  const allowed = new Set(chars.split(''))
  return (input || '')
    .toUpperCase()
    .split('')
    .filter((c) => allowed.has(c))
    .join('')
}

/**
 * Quick validator for room codes (checks length and allowed chars).
 *
 * @param code - code to validate
 * @param length - expected length (optional)
 * @param chars - optional alphabet to validate against
 */
export function isValidRoomCode(
  code: string,
  length?: number,
  chars = DEFAULT_ROOM_ID_ALPHABET,
): boolean {
  if (!code || typeof code !== 'string') return false
  if (length && code.length !== length) return false
  const allowed = new Set(chars.split(''))
  for (const c of code) if (!allowed.has(c)) return false
  return true
}

/**
 * Extract the optional room slug from a URL or path.
 *
 * Accepts a URL object or a string (absolute URL or path starting with "/").
 * Matches:
 * - "/api/race" => null
 * - "/api/race/{slug}" => returns slug (allowed chars: A-Za-z0-9_-)
 *
 * @param url - URL object or string
 * @returns the slug string if present, otherwise null
 */
export function extractRoomSlug(url: string): string | null {
  const pathname = new URL(url).pathname
  const match = pathname.match(/^\/api\/race(?:\/([A-Za-z0-9_-]+))?$/)
  return match && match[1] ? match[1] : null
}

export function getRoomSlugFromHeader(headers: Headers): string | null {
  const roomId = headers.get('x-room-id')
  return roomId && isValidRoomCode(roomId) ? roomId : null
}

/**
 * Builds the combined deck by assigning a unique suit to every car in play and
 * duplicating the full card rank list for each suit.
 */
export const createDeckForCarCount = (carCount: number): Deck => {
  const cards: Deck = []
  for (let i = 0; i < carCount; i += 1) {
    const suit = BASE_SUIT_SYMBOLS[i]
    CARD_RANK_SEQUENCE.forEach((rank) => {
      cards.push({
        id: `${rank}-${suit}`,
        rank,
        suit,
      })
    })
  }
  return cards
}

/**
 * Deals the provided cards round-robin to the supplied car IDs, ensuring the
 * distribution stays even regardless of deck size.
 */
export const dealDecksToCars = (
  cards: Deck,
  carIds: Array<string>,
): Record<string, Deck> => {
  const dealt: Record<string, Deck> = {}
  carIds.forEach((id) => {
    dealt[id] = []
  })
  if (!carIds.length) return dealt
  cards.forEach((card, index) => {
    const targetIndex = index % carIds.length
    const carId = carIds[targetIndex]
    if (!carId) return
    dealt[carId].push(card)
  })
  return dealt
}

/**
 * Convenience helper that builds, shuffles, and deals a fresh set of decks for
 * the provided car IDs in a single step.
 */
export const createDealtDecksForCars = (
  carIds: Array<string>,
): Record<string, Deck> => {
  if (!carIds.length) return {}
  const combined = createDeckForCarCount(carIds.length)
  const shuffled = shuffle(combined)
  return dealDecksToCars(shuffled, carIds)
}

export const appendLog = (
  context: GameContext,
  message: string,
): Array<string> => [
  ...context.log,
  `${new Date().toISOString()} :: ${message}`,
]

export const appendWithLog = (
  context: GameContext,
  currentLog: Array<string>,
  message: string,
): Array<string> => appendLog({ ...context, log: currentLog }, message)

export const carHasCardsInHand = (
  car: CarState | undefined,
  cards: Deck,
): boolean => {
  return (
    car?.drawPile.find((card) =>
      cards.find((playedCard) => playedCard.id === card.id),
    ) !== undefined
  )
}

const removeRanksFromDrawPile = (
  drawPile: Deck,
  cards: Deck,
): { nextPile: Deck; spent: Deck } => {
  if (!cards.length) {
    return {
      nextPile: [...drawPile],
      spent: [],
    }
  }
  const nextPile = [...drawPile]
  const spent: Deck = []
  cards.forEach((card) => {
    const index = nextPile.findIndex((nextCard) => nextCard.id === card.id)
    if (index === -1) return
    const deleted = nextPile.splice(index, 1)
    spent.push(...deleted)
  })
  return { nextPile, spent }
}

export const scoreCardSet = (rawCards: Deck): number => {
  const cards = sanitizeCards(rawCards)
  if (cards.length === 0) return 0
  const redlineCount = getRedlineCount(cards)
  if (redlineCount >= 2) return 0
  if (redlineCount === 1) {
    const main = cards.find((card) => card.rank !== REDLINE_CARD)
    if (!main) return 0
    return CARD_VALUES[main.rank] + 2
  }
  return cards.reduce((total, card) => total + CARD_VALUES[card.rank], 0)
}

export const buildChallengeResult = (params: {
  attackerId: string
  defenderId: string
  attackerCards: Deck
  defenderCards: Deck
}) => {
  const attackerTotal = scoreCardSet(params.attackerCards)
  const defenderTotal = scoreCardSet(params.defenderCards)
  const attackerWins = attackerTotal > defenderTotal
  const winnerId = attackerWins ? params.attackerId : params.defenderId
  const loserId =
    winnerId === params.attackerId ? params.defenderId : params.attackerId
  return {
    attackerId: params.attackerId,
    defenderId: params.defenderId,
    attackerCards: sanitizeCards(params.attackerCards),
    defenderCards: sanitizeCards(params.defenderCards),
    attackerTotal,
    defenderTotal,
    winnerId,
    loserId,
  }
}

export const spendCardsForCar = (
  car: CarState,
  cards: Deck,
): { car: CarState; eliminated: boolean } => {
  if (!cards.length) return { car, eliminated: false }
  const cardsToSpend = sanitizeCards(cards)
  const { nextPile, spent } = removeRanksFromDrawPile(
    car.drawPile,
    cardsToSpend,
  )
  if (spent.length !== cardsToSpend.length) {
    return { car, eliminated: false }
  }
  const nextRemaining = nextPile.length
  const nextCar: CarState = {
    ...car,
    drawPile: nextPile,
    cardsRemaining: nextRemaining,
    discardPile: [...car.discardPile, ...spent],
    status: nextRemaining === 0 ? 'eliminated' : car.status,
  }
  return {
    car: nextCar,
    eliminated: nextRemaining === 0,
  }
}

export const applyCardUsage = (
  context: GameContext,
  carId: string,
  cards: Deck,
): CardUsageResult => {
  const car = context.cars[carId] as CarState | undefined
  if (!car || cards.length === 0)
    return {
      cars: context.cars,
      finalLapTriggered: context.finalLapTriggered,
      finishingOrder: context.finishingOrder,
      eliminationMessage: undefined,
    }
  const { car: updatedCar, eliminated } = spendCardsForCar(car, cards)
  const cars = { ...context.cars, [carId]: updatedCar }
  let eliminationMessage: string | undefined
  let finalLapTriggered = context.finalLapTriggered
  let finishingOrder = context.finishingOrder
  if (eliminated && car.status !== 'eliminated') {
    eliminationMessage = `Car ${carId} ran out of cards.`
    finalLapTriggered = true
    if (!context.finishingOrder.length) {
      finishingOrder = getCarsInTrackOrder(context.gridPosition)
    }
  }
  return {
    cars,
    finalLapTriggered,
    finishingOrder,
    eliminationMessage,
  }
}

export const resolveQualifyingOrder = (context: GameContext) => {
  const entries = Object.entries(context.pendingQualifyingSelections).map(
    ([carId, cards]) => ({
      carId,
      cards,
      score: scoreCardSet(cards),
      seed: Math.random(),
    }),
  )
  entries.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.seed - b.seed
  })
  return {
    order: entries.map((entry) => entry.carId),
    discarded: entries.reduce<Record<string, Deck>>((acc, entry) => {
      acc[entry.carId] = entry.cards
      return acc
    }, {}),
  }
}

/** Returns the IDs of the cars owned by the provided player. */
export const getPlayerCarIds = (
  context: GameContext,
  playerId: string,
): Array<string> =>
  Object.entries(context.cars)
    .filter(([, car]) => car.playerId === playerId)
    .map(([carId]) => carId)

/** True when every car has submitted qualifying cards. */
export const areQualifyingSelectionsRevealed = (
  context: GameContext,
): boolean => {
  const carIds = Object.keys(context.cars)
  return (
    carIds.length > 0 &&
    carIds.every(
      (id) => (context.pendingQualifyingSelections[id] ?? []).length > 0,
    )
  )
}

/** True when both sides have locked their challenge cards. */
export const areChallengeSelectionsRevealed = (
  context: GameContext,
): boolean => {
  const pending = context.pendingChallenge
  if (!pending) return false
  const attackerCards =
    context.pendingChallengeSelections[pending.attackerId] ?? []
  const defenderCards =
    context.pendingChallengeSelections[pending.defenderId] ?? []
  return attackerCards.length > 0 && defenderCards.length > 0
}

/** Builds the context view that should be sent to a specific player. */
export const buildVisibleContextForPlayer = (
  snapshot: GameSnapshot,
  playerId: string,
): GameContext => {
  const { context } = snapshot
  const playerCarIds = getPlayerCarIds(context, playerId)
  const playerCarSet = new Set(playerCarIds)
  const revealQual = areQualifyingSelectionsRevealed(context)
  const revealChallenge = areChallengeSelectionsRevealed(context)

  const visibleQualSelections = revealQual
    ? { ...context.pendingQualifyingSelections }
    : (Object.fromEntries(
        playerCarIds
          .filter((carId) => carId in context.pendingQualifyingSelections)
          .map((carId) => [carId, context.pendingQualifyingSelections[carId]]),
      ) as Record<string, Deck>)

  const visibleChallengeSelections = revealChallenge
    ? { ...context.pendingChallengeSelections }
    : (Object.fromEntries(
        playerCarIds
          .filter((carId) => carId in context.pendingChallengeSelections)
          .map((carId) => [carId, context.pendingChallengeSelections[carId]]),
      ) as Record<string, Deck>)

  const sanitizedCars = Object.fromEntries(
    Object.entries(context.cars).map(([carId, car]) => [
      carId,
      {
        ...car,
        drawPile: playerCarSet.has(carId) ? car.drawPile : [],
        discardPile: playerCarSet.has(carId) ? car.discardPile : [],
      },
    ]),
  ) as Record<string, CarState>

  return {
    ...context,
    cars: sanitizedCars,
    pendingQualifyingSelections: visibleQualSelections,
    pendingChallengeSelections: visibleChallengeSelections,
  }
}

/**
 * Produces a dot-delimited string representing the current XState state tree.
 */
export const flattenStateValue = (value: StateValue): GameStateValue => {
  if (typeof value === 'string') {
    return value as GameStateValue
  }
  if (Array.isArray(value)) {
    return value
      .map(flattenStateValue)
      .filter(Boolean)
      .join('.') as GameStateValue
  }
  if (typeof value !== 'object') {
    return '' as GameStateValue
  }
  const entries = Object.entries(value as Record<string, StateValue>)
  if (!entries.length) {
    return '' as GameStateValue
  }
  return entries
    .map(([key, child]) => {
      const childPath = flattenStateValue(child)
      return `${key}.${childPath}`
    })
    .filter(Boolean)
    .join('.') as GameStateValue
}

const pickCarColor = (used: Set<string>): CarColor => {
  const available = CAR_COLOR_PALETTE.filter((color) => !used.has(color))
  const choice = available[Math.floor(Math.random() * available.length)]
  used.add(choice)
  return choice
}

export const createCarBlueprints = (
  players: Array<Player>,
): Array<CarBlueprint> => {
  const usedColors = new Set<string>()
  return players.map((player) => ({
    id: `car-${randomUUID()}`,
    playerId: player.id,
    color: pickCarColor(usedColors),
  }))
}

/**
 * Generates a server-side player profile with a unique ID and readable name.
 */
export const createServerPlayer = (): Player => ({
  id: randomUUID(),
  name: `Driver ${Math.floor(Math.random() * 900 + 100)}`,
})
