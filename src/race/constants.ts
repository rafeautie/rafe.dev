import type { Transition } from 'motion'
import type { CarColor, CardRank, CardSuit, DeckCard } from './types'

export const MIN_PLAYERS = 2
export const MAX_SELECTION_SIZE = 2
export const CARD_RANK_SEQUENCE: ReadonlyArray<CardRank> = [
  'E1',
  'E2',
  'E3',
  'R',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
]
export const CARD_VALUES: Record<CardRank, number> = {
  E1: 1,
  E2: 2,
  E3: 3,
  R: 0,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  '11': 11,
  '12': 12,
}
export const BASE_SUIT_SYMBOLS: ReadonlyArray<CardSuit> = [
  'brake',
  'gear-stick',
  'pedals',
  'piston',
  'steering-wheel',
  'suspension',
]
export const CHAMPION_CARD: CardRank = '12'
export const REDLINE_CARD: CardRank = 'R'
export const EXTEND_CARDS: ReadonlyArray<CardRank> = ['E1', 'E2', 'E3']
export const RANK_ORDER = new Map<DeckCard['rank'], number>(
  CARD_RANK_SEQUENCE.map((rank, index) => [rank, index]),
)
export const SUIT_ORDER = new Map<DeckCard['suit'], number>(
  BASE_SUIT_SYMBOLS.map((suit, index) => [suit, index]),
)
export const DEFAULT_ROOM_ID_LENGTH = 6
export const DEFAULT_ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude visually ambiguous characters: I, O, 1, 0
export const CAR_COLOR_PALETTE: ReadonlyArray<CarColor> = [
  'blue',
  'red',
  'green',
  'orange',
]

/**
 * Board Constants
 */
export const BOARD_GRID_ITEM_HEIGHT = 100
export const BOARD_GRID_ITEM_WIDTH = 112
export const RACE_TRANSITION_DURATION = 0.8
export const RACE_TRANSITION: Transition = {
  type: 'spring',
  bounce: 0,
  duration: RACE_TRANSITION_DURATION,
}
export const GRID_EXIT_TRANSITION: Transition = {
  duration: 0.5,
  delay: RACE_TRANSITION_DURATION,
}
export const CAR_QUALIFYING_ANIMATION_DURATION = 1.5
export const DISOLVE_DELAY = 1
export const DISOLVE_DURATION = 1.5
export const CARD_REVEAL_ROTATE_DELAY = 0.4
