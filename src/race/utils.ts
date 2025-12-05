import { findLast, reduce } from 'lodash'
import {
  EXTEND_CARDS,
  MAX_SELECTION_SIZE,
  RANK_ORDER,
  REDLINE_CARD,
  SUIT_ORDER,
} from './constants'
import type {
  CarState,
  ChallengeResolutionEvent,
  Deck,
  DeckCard,
  DeckSortMode,
  GameContext,
  GameStatePayload,
  GridPosition,
  QualifyingResolutionEvent,
} from './types'

type SelectionValidationContext = {
  gameState: GameStatePayload
  cards: Deck
  playerId: string
}

const isExtendCard = (card: DeckCard | undefined): card is DeckCard => {
  if (!card) return false
  return EXTEND_CARDS.includes(card.rank)
}

export const getRedlineCount = (cards: Deck): number =>
  cards.filter((card) => card.rank === REDLINE_CARD).length

export const sanitizeCards = (cards: Deck): Deck =>
  cards.filter((card): card is DeckCard => Boolean(card)).slice(0, 2)

const getRankIndex = (rank: DeckCard['rank']) =>
  RANK_ORDER.get(rank) ?? Number.MAX_SAFE_INTEGER

const getSuitIndex = (suit: DeckCard['suit']) =>
  SUIT_ORDER.get(suit) ?? Number.MAX_SAFE_INTEGER

/** Returns a sorted copy of the given deck using the requested sorting mode. */
export const sortDeck = (deck: Deck, mode: DeckSortMode = 'rank'): Deck => {
  const comparator =
    mode === 'suit'
      ? (a: DeckCard, b: DeckCard) => {
          const suitDiff = getSuitIndex(a.suit) - getSuitIndex(b.suit)
          if (suitDiff !== 0) return suitDiff
          return getRankIndex(a.rank) - getRankIndex(b.rank)
        }
      : (a: DeckCard, b: DeckCard) => {
          const rankDiff = getRankIndex(a.rank) - getRankIndex(b.rank)
          if (rankDiff !== 0) return rankDiff
          return getSuitIndex(a.suit) - getSuitIndex(b.suit)
        }

  return [...deck].sort(comparator)
}

const hasValidSelectionSize = (cards: Deck): boolean =>
  cards.length > 0 && cards.length <= MAX_SELECTION_SIZE

const hasUniqueIds = (cards: Deck): boolean =>
  new Set(cards.map((card) => card.id)).size === cards.length

const hasValidRedlineUsage = (cards: Deck): boolean => {
  const redlineCount = getRedlineCount(cards)
  if (redlineCount > 1) return false
  if (cards.length === 2) {
    return redlineCount === 1
  }
  if (cards.length === 1) {
    return redlineCount === 0
  }
  return true
}

const getLeaderCarId = (gridPosition?: GridPosition): string | null => {
  if (!gridPosition) return null
  let leaderId: string | null = null
  let leaderPosition = -Infinity
  for (const [carId, position] of Object.entries(gridPosition)) {
    if (leaderId == null || position > leaderPosition) {
      leaderId = carId
      leaderPosition = position
    }
  }
  return leaderId
}

const isPlayerLeader = (
  playerId: string | undefined,
  cars: Record<string, CarState> | undefined,
  gridPosition: GridPosition | undefined,
): boolean => {
  if (!playerId || !cars || !gridPosition) return false
  const leaderCarId = getLeaderCarId(gridPosition)
  if (!leaderCarId) return false
  if (!(leaderCarId in cars)) return false
  const leaderCar = cars[leaderCarId]
  return leaderCar.playerId === playerId
}

export const isValidPlaySelection = (cards: Deck): boolean =>
  hasValidSelectionSize(cards) &&
  hasUniqueIds(cards) &&
  hasValidRedlineUsage(cards)

/** Validates extend selections, optionally enforcing leader restrictions. */
export const isValidExtendSelection = (
  context: SelectionValidationContext,
): boolean => {
  if (context.cards.length !== 1) return false
  const [card] = context.cards
  if (!isExtendCard(card)) return false
  const leaderBlocked = isPlayerLeader(
    context.playerId,
    context.gameState.context.cars,
    context.gameState.context.gridPosition,
  )
  if (leaderBlocked && card.rank === 'E3') {
    return false
  }
  return true
}

/** Validates discard plays made while the game awaits the active car's action. */
export const isValidDiscardSelection = (cards: Deck): boolean => {
  return cards.length === 1
}

export const getCarsInTrackOrder = (
  gridPosition: GridPosition,
): Array<string> =>
  Object.entries(gridPosition)
    .sort(([, posA], [, posB]) => posA - posB)
    .map(([carId]) => carId)

/** Returns the latest qualifying selections keyed by car ID. */
export const getQualifyingSelectionsFromEvents = (
  context: GameContext,
): Record<string, Deck> => {
  return reduce(
    context.cardPlayEvents,
    (acc, event) => {
      if (event.type === 'qualifyingResolution') {
        event.results.forEach((result) => {
          acc[result.carId] = result.cards
        })
      }
      return acc
    },
    {} as Record<string, Deck>,
  )
}

/** Returns the most recent qualifying cards for a given car. */
export const getLatestQualifyingSelectionForCar = (
  context: GameContext,
  carId: string,
): Deck => {
  const match = findLast(
    context.cardPlayEvents,
    (event): event is QualifyingResolutionEvent =>
      event.type === 'qualifyingResolution' &&
      event.results.some((r) => r.carId === carId),
  )
  if (!match) return []
  const result = match.results.find((r) => r.carId === carId)
  return result?.cards ?? []
}

/** Collects challenge selections for a specific challenge instance. */
/** Returns the most recent resolved challenge from the event history. */
export const getMostRecentChallengeResolution = (context: GameContext) => {
  const resolved = findLast(
    context.cardPlayEvents,
    (event): event is ChallengeResolutionEvent =>
      event.type === 'challengeResolution',
  )
  if (!resolved) return null
  return {
    attackerId: resolved.attackerId,
    defenderId: resolved.defenderId,
    attackerCards: resolved.attackerCards,
    defenderCards: resolved.defenderCards,
    attackerTotal: resolved.attackerTotal,
    defenderTotal: resolved.defenderTotal,
    winnerId: resolved.winnerId,
    loserId: resolved.loserId,
  }
}
