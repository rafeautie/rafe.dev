import { Store, useStore } from '@tanstack/react-store'
import { findLast, size } from 'lodash'
import clsx from 'clsx'
import {
  getCarsInTrackOrder,
  getMostRecentChallengeResolution,
  getQualifyingSelectionsFromEvents,
  isValidDiscardSelection,
  isValidExtendSelection,
  isValidPlaySelection,
  sortDeck,
} from '../utils'
import { GameStateValue } from '../types'
import type { RevealState } from './type'
import type {
  Deck,
  DeckCard,
  DeckSortMode,
  GameStateMessage,
  RoomAckMessage,
} from '../types'

interface RaceStoreState {
  messageHistory: Array<GameStateMessage | RoomAckMessage>
  roomId: string | null
  connect: boolean
  selectedCards: Deck
  revealState: RevealState
  handledGameFeedEventIds: Array<string>
  animationInProgressStatus: Record<string, boolean>
}

export const raceStore = new Store<RaceStoreState>({
  messageHistory: [],
  roomId: '',
  connect: false,
  selectedCards: [],
  revealState: 'idle',
  handledGameFeedEventIds: [],
  animationInProgressStatus: {},
})

export const useRaceStore = <TData = unknown>(
  selector: (state: (typeof raceStore)['state']) => TData,
) => {
  return useStore(raceStore, selector)
}

/**
 * Actions
 */

export const processMessage = (message: GameStateMessage | RoomAckMessage) => {
  raceStore.setState((s) => {
    const nextMessageHistory = [...s.messageHistory, message]
    const shouldRevealQualifying =
      getShouldRevealQualifyingResolutionFromMessageHistory(nextMessageHistory)
    const shouldRevealChallenge =
      getShouldRevealChallengeResolutionFromMessageHistory(nextMessageHistory)
    const revealState = clsx({
      qualifying: shouldRevealQualifying,
      challenge: shouldRevealChallenge,
      idle: !shouldRevealQualifying && !shouldRevealChallenge,
    }) as RevealState

    return {
      ...s,
      revealState,
      messageHistory: nextMessageHistory,
    }
  })
}

export const connectToRoom = (roomId: string = '') => {
  raceStore.setState((s) => ({
    ...s,
    roomId: roomId.slice(0, 6),
    connect: true,
  }))
}

export const toggleCardSelection = (card: DeckCard) => {
  const isSelected = raceStore.state.selectedCards.some(
    ({ id }) => id === card.id,
  )

  if (raceStore.state.selectedCards.length >= 2 && !isSelected) {
    return
  }

  raceStore.setState((s) => ({
    ...s,
    previousSelectedCards: [],
    selectedCards: isSelected
      ? s.selectedCards.filter(({ id }) => id !== card.id)
      : [...s.selectedCards, card],
  }))
}

export const clearCardSelection = () => {
  raceStore.setState((s) => ({
    ...s,
    selectedCards: [],
  }))
}

export const setRevealState = (revealState: RevealState) => {
  raceStore.setState((s) => ({
    ...s,
    revealState,
  }))
}

export const markGameFeedEventAsHandled = (eventId: string) => {
  raceStore.setState((s) => ({
    ...s,
    handledGameFeedEventIds: [...s.handledGameFeedEventIds, eventId],
  }))
}

export const setAnimationInProgress = (key: string, inProgress: boolean) => {
  raceStore.setState((s) => ({
    ...s,
    animationInProgressStatus: {
      ...s.animationInProgressStatus,
      [key]: inProgress,
    },
  }))
}

/**
 * Selectors
 */
export const getOwnPlayer = (state: (typeof raceStore)['state']) => {
  return findLast(state.messageHistory, (msg) => msg.type === 'room/ack')
    ?.player
}

export const getLatestMessageFromHistory = (
  messageHistory: RaceStoreState['messageHistory'],
  startingReverseIndex: number = messageHistory.length - 1,
) => {
  return findLast(
    messageHistory,
    (msg) => msg.type === 'game/state',
    startingReverseIndex,
  )
}

export const getLatestGameState = (state: (typeof raceStore)['state']) => {
  return getLatestMessageFromHistory(state.messageHistory)?.state
}
export const getPreviousGameState = (state: (typeof raceStore)['state']) => {
  return getLatestMessageFromHistory(
    state.messageHistory,
    state.messageHistory.length - 2,
  )?.state
}

export const getActiveCar = (state: (typeof raceStore)['state']) => {
  const gameState = getLatestGameState(state)
  const activeCarId = gameState?.context.turn.activeCarId
  return gameState?.context.cars[activeCarId ?? '']
}

export const getCarById =
  (carId: string) => (state: (typeof raceStore)['state']) => {
    const gameState = getLatestGameState(state)
    const cars = Object.values(gameState?.context.cars ?? {})
    return cars.find((car) => car.id === carId)
  }

export const getOwnPlayerCar = (state: (typeof raceStore)['state']) => {
  const player = getOwnPlayer(state)
  const gameState = getLatestGameState(state)
  const cars = Object.values(gameState?.context.cars ?? {})
  return cars.find((car) => car.playerId === player?.id)
}

export const getSelectedCards = (state: (typeof raceStore)['state']) => {
  return state.selectedCards
}

export const getCurrentCardSelectionValidForPlay = (
  state: (typeof raceStore)['state'],
) => {
  const cards = getSelectedCards(state)
  return getIsOwnPlayersTurn(state) && isValidPlaySelection(cards)
}

export const getCurrentCardSelectionValidForDiscard = (
  state: (typeof raceStore)['state'],
) => {
  const cards = getSelectedCards(state)
  return getIsOwnPlayersTurn(state) && isValidDiscardSelection(cards)
}

export const getCurrentCardSelectionValidForExtend = (
  state: (typeof raceStore)['state'],
) => {
  const player = getOwnPlayer(state)
  const gameState = getLatestGameState(state)
  const cards = getSelectedCards(state)

  if (!player || !gameState) {
    return false
  }

  return (
    getIsOwnPlayersTurn(state) &&
    isValidExtendSelection({ playerId: player.id, gameState, cards })
  )
}

export const getIsQualifyingSelectionComplete = (
  state: (typeof raceStore)['state'],
) => {
  const car = getOwnPlayerCar(state)
  const gameState = getLatestGameState(state)
  const selection =
    gameState?.context.pendingQualifyingSelections[car?.id ?? ''] ?? []
  return (
    gameState?.statePath === GameStateValue.QualifyingSelection &&
    selection.length > 0
  )
}

export const getIsRacingChallengeSelectionComplete = (
  state: (typeof raceStore)['state'],
) => {
  const car = getOwnPlayerCar(state)
  const gameState = getLatestGameState(state)
  const selection =
    gameState?.context.pendingChallengeSelections[car?.id ?? ''] ?? []
  return (
    gameState?.statePath === GameStateValue.RacingChallengeSelection &&
    selection.length > 0
  )
}

export const getIsOwnPlayersTurn = (state: (typeof raceStore)['state']) => {
  const playerCar = getOwnPlayerCar(state)
  const activeCar = getActiveCar(state)
  const pendingChallenge = getPendingChallenge(state)
  return (
    [
      pendingChallenge?.attackerId,
      pendingChallenge?.defenderId,
      activeCar?.id,
    ].includes(playerCar?.id) || getIsQualifying(state)
  )
}

export const getIsQualifying = (state: (typeof raceStore)['state']) => {
  const gameState = getLatestGameState(state)
  return gameState?.statePath === GameStateValue.QualifyingSelection
}

export const getPendingQualifyingSelections = (
  state: (typeof raceStore)['state'],
) => {
  const car = getOwnPlayerCar(state)
  const gameState = getLatestGameState(state)
  return gameState?.context.pendingQualifyingSelections[car?.id ?? ''] ?? []
}

export const getPendingChallenge = (state: (typeof raceStore)['state']) => {
  const gameState = getLatestGameState(state)
  return gameState?.context.pendingChallenge
}

export const getPendingChallengeSelections = (
  state: (typeof raceStore)['state'],
) => {
  const car = getOwnPlayerCar(state)
  const gameState = getLatestGameState(state)
  return gameState?.context.pendingChallengeSelections[car?.id ?? ''] ?? []
}

export const getSortedHand =
  (mode: DeckSortMode = 'rank') =>
  (state: (typeof raceStore)['state']) => {
    const ownCar = getOwnPlayerCar(state)
    const drawPile = ownCar?.drawPile ?? []
    return sortDeck(drawPile, mode)
  }

export const getGridPositionByCarId =
  (carId: string) => (state: (typeof raceStore)['state']) => {
    const gameState = getLatestGameState(state)
    return gameState?.context.gridPosition[carId] ?? null
  }

export const getGrid = (state: (typeof raceStore)['state']) => {
  const currentGameState = getLatestGameState(state)
  return getCarsInTrackOrder(currentGameState?.context.gridPosition ?? {}).map(
    (carId) => ({
      car: currentGameState?.context.cars[carId],
      position: currentGameState?.context.gridPosition[carId],
    }),
  )
}

export const getCars = (state: (typeof raceStore)['state']) => {
  const currentGameState = getLatestGameState(state)
  const gameState = getLatestGameState(state)
  return Object.entries(gameState?.context.cars ?? {}).map(([carId, car]) => ({
    car,
    position: currentGameState?.context.gridPosition[carId],
  }))
}

export const getHighestGridPosition = (state: (typeof raceStore)['state']) => {
  const gameState = getLatestGameState(state)
  const gridPositions = Object.values(gameState?.context.gridPosition ?? {})
  return Math.max(...gridPositions, 0)
}

export const getShouldRevealCarsResolutionFromMessageHistory = (
  messageHistory: RaceStoreState['messageHistory'],
) => {
  const latestGameState = getLatestMessageFromHistory(messageHistory)?.state
  const previousGameState = getLatestMessageFromHistory(
    messageHistory,
    messageHistory.length - 2,
  )?.state

  if (!latestGameState) {
    return false
  }

  return (
    previousGameState?.statePath === GameStateValue.WaitingForPlayers &&
    latestGameState.statePath === GameStateValue.QualifyingSelection
  )
}

export const getShouldRevealQualifyingResolutionFromMessageHistory = (
  messageHistory: RaceStoreState['messageHistory'],
) => {
  const latestGameState = getLatestMessageFromHistory(messageHistory)?.state
  const previousGameState = getLatestMessageFromHistory(
    messageHistory,
    messageHistory.length - 2,
  )?.state

  if (!latestGameState) {
    return false
  }

  return (
    previousGameState?.statePath === GameStateValue.QualifyingSelection &&
    latestGameState.statePath === GameStateValue.RacingChallengeSelection &&
    size(getQualifyingSelectionsFromEvents(latestGameState.context)) > 0
  )
}

export const getShouldRevealChallengeResolutionFromMessageHistory = (
  messageHistory: RaceStoreState['messageHistory'],
) => {
  const latestGameState = getLatestMessageFromHistory(messageHistory)?.state
  const previousGameState = getLatestMessageFromHistory(
    messageHistory,
    messageHistory.length - 2,
  )?.state

  if (!latestGameState) {
    return false
  }

  return (
    previousGameState?.statePath === GameStateValue.RacingChallengeSelection &&
    latestGameState.statePath === GameStateValue.RacingAwaitingAction &&
    getMostRecentChallengeResolution(latestGameState.context) != null
  )
}

export const getLatestGameFeedEvent = (state: (typeof raceStore)['state']) => {
  const gameState = getLatestGameState(state)
  if (!gameState) {
    return null
  }

  return gameState.context.gameFeed.at(-1)
}

export const getLatestGameFeedEventByCarId =
  (carId: string) => (state: (typeof raceStore)['state']) => {
    const latestPlayedCardEvent = getLatestGameFeedEvent(state)
    switch (latestPlayedCardEvent?.type) {
      case 'extendPlay':
      case 'discardPlay':
        if (latestPlayedCardEvent.carId === carId) {
          return latestPlayedCardEvent
        }
        return null
      case 'qualifyingResolution':
        if (latestPlayedCardEvent.results.some((r) => r.carId === carId)) {
          return latestPlayedCardEvent
        }
        return null
      case 'challengeResolution':
        if (
          latestPlayedCardEvent.attackerId === carId ||
          latestPlayedCardEvent.defenderId === carId
        ) {
          return latestPlayedCardEvent
        }
        return null
      default:
        return null
    }
  }

export const getLatestPlayedCardsByCarId =
  (carId: string) => (state: (typeof raceStore)['state']) => {
    const latestCardPlayEventByCarId =
      getLatestGameFeedEventByCarId(carId)(state)

    switch (latestCardPlayEventByCarId?.type) {
      case 'extendPlay':
      case 'discardPlay':
        return latestCardPlayEventByCarId.cards
      case 'qualifyingResolution': {
        const result = latestCardPlayEventByCarId.results.find(
          (r) => r.carId === carId,
        )
        return result?.cards ?? []
      }
      case 'challengeResolution': {
        const isAttacker = latestCardPlayEventByCarId.attackerId === carId
        return isAttacker
          ? latestCardPlayEventByCarId.attackerCards
          : latestCardPlayEventByCarId.defenderCards
      }
    }
  }

export const getLatestPlayedTotalByCarId =
  (carId: string) => (state: (typeof raceStore)['state']) => {
    const latestCardPlayEventByCarId =
      getLatestGameFeedEventByCarId(carId)(state)

    switch (latestCardPlayEventByCarId?.type) {
      case 'extendPlay':
      case 'discardPlay':
        return latestCardPlayEventByCarId.total
      case 'qualifyingResolution': {
        const result = latestCardPlayEventByCarId.results.find(
          (r) => r.carId === carId,
        )
        return result?.total ?? 0
      }
      case 'challengeResolution': {
        const isAttacker = latestCardPlayEventByCarId.attackerId === carId
        return isAttacker
          ? latestCardPlayEventByCarId.attackerTotal
          : latestCardPlayEventByCarId.defenderTotal
      }
    }
  }

export const getIsGameFeedEventHandled =
  (eventId: string) => (state: (typeof raceStore)['state']) => {
    return state.handledGameFeedEventIds.includes(eventId)
  }

export const getAnyAnimationInProgress = (
  state: (typeof raceStore)['state'],
) => {
  return Object.values(state.animationInProgressStatus).some(
    (inProgress) => inProgress,
  )
}
