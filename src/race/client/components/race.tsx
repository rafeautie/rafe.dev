import { useParams } from '@tanstack/react-router'
import { useRaceWebsocketSubscription } from '../hooks/useRaceWebsocketSubscription'
import { getLatestGameState, useRaceStore } from '../state'
import { Lobby } from './lobby'
import { Menu } from './menu'
import { Game } from '.'
import { GameStateValue } from '@/race/types'

export const Race = () => {
  const { readyState } = useRaceWebsocketSubscription({
    shouldTrackMessages: true,
  })

  const roomId = useParams({
    from: '/race/$roomId',
    select: (params) => params.roomId,
  })

  const gameState = useRaceStore(getLatestGameState)

  if (readyState !== WebSocket.OPEN) {
    return <Menu roomId={roomId} />
  }

  switch (gameState?.statePath) {
    case GameStateValue.WaitingForPlayers:
      return <Lobby />
    case GameStateValue.QualifyingSelection:
    case GameStateValue.RacingChallengeSelection:
    case GameStateValue.RacingAwaitingAction:
    case GameStateValue.PostRace:
      return <Game />
  }
}
