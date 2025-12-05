import type {
  ClientGameEvent,
  Deck,
  DeckCard,
  ErrorMessage,
  GameStateMessage,
  GameStatePayload,
  Player,
  RaceClientMessage,
  RaceServerMessage,
  RoomAckMessage,
} from './types'

export const createRoomAckMessage = (
  roomId: string,
  player: Player,
): RoomAckMessage => ({
  type: 'room/ack',
  roomId,
  player,
})

export const createGameStateMessage = (
  state: GameStatePayload,
): GameStateMessage => ({
  type: 'game/state',
  state,
})

export const createStartSetupMessage = (): ClientGameEvent => ({
  type: 'START_SETUP',
})

export const createPlayCardsMessage = (cards: Deck): ClientGameEvent => ({
  type: 'PLAY_CARDS',
  cards,
})

export const createDiscardCardsMessage = (cards: Deck): ClientGameEvent => ({
  type: 'DISCARD_CARDS',
  cards,
})

export const createErrorMessage = (message: string): ErrorMessage => ({
  type: 'error',
  message,
})

const isCard = (value: unknown): value is DeckCard => {
  if (typeof value !== 'object' || value === null) return false
  const card = value as Partial<DeckCard>
  return (
    typeof card.id === 'string' &&
    typeof card.rank === 'string' &&
    typeof card.suit === 'string'
  )
}

const isCardArray = (value: unknown): value is Deck =>
  Array.isArray(value) && value.length > 0 && value.every((c) => isCard(c))

export const isRaceClientMessage = (
  value: unknown,
): value is RaceClientMessage => {
  const event = value as Partial<RaceClientMessage>
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    event == null ||
    typeof event !== 'object' ||
    typeof event.type !== 'string'
  ) {
    return false
  }

  switch (event.type) {
    case 'START_SETUP':
      return true
    case 'PLAY_CARDS':
    case 'DISCARD_CARDS':
      return isCardArray(event.cards)
    default:
      return false
  }
}

export const serializeServerMessage = (message: RaceServerMessage): string =>
  JSON.stringify(message)
