import type { raceStore } from './state'
import type { useRaceWebsocketSubscription } from './hooks/useRaceWebsocketSubscription'
import type { GameStateValue } from '../types'

export type GameStateControlMapItem = {
  title: string
  description: string
  actions: Array<GameStateControlAction>
  actionCompleteValidator: GameStateControlValidator
  actionCompleteTitle: string
  actionCompleteDescription: string
  opponentTurnOnlyValidator: GameStateControlValidator
  opponentTurnOnlyTitle: string
  opponentTurnOnlyDescription?: string
}

export type GameStateControlMap = Record<
  GameStateValue,
  GameStateControlMapItem
>

export type GameStateControlActionType = Extract<
  keyof ReturnType<typeof useRaceWebsocketSubscription>,
  'playCards' | 'discardCards'
>

export type GameStateControlStringGetter = (
  state: typeof raceStore.state,
) => string

export type GameStateControlValidator = (
  state: typeof raceStore.state,
) => boolean

export type GameStateControlAction = {
  type: GameStateControlActionType
  label: string
  validator: GameStateControlValidator
}

export type RevealState = 'idle' | 'qualifying' | 'challenge'

export type Point = { x: number; y: number; rotate: number } // angle expects degrees
export type PathNode = {
  x: number
  y: number
  dx: number
  dy: number
  angle: number // radians
}
