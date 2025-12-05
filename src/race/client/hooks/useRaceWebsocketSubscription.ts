import { useCallback, useEffect } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import { useMatch, useNavigate } from '@tanstack/react-router'
import {
  clearCardSelection,
  connectToRoom,
  getSelectedCards,
  processMessage,
  useRaceStore,
} from '../state'
import type { GameStateMessage, RoomAckMessage } from '@/race/types'
import {
  createDiscardCardsMessage,
  createPlayCardsMessage,
  createStartSetupMessage,
} from '@/race/messages'

interface UseRaceWebsocketSubscription {
  shouldTrackMessages?: boolean
}

export const useRaceWebsocketSubscription = (
  options: UseRaceWebsocketSubscription = { shouldTrackMessages: false },
) => {
  const navigate = useNavigate()
  const raceMatch = useMatch({ strict: false })
  const roomIdToConnect = useRaceStore((s) => s.roomId)
  const connect = useRaceStore((s) => s.connect)
  const selectedCards = useRaceStore(getSelectedCards)

  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket<
    GameStateMessage | RoomAckMessage | undefined
  >(
    `http://localhost:8787/api/race/${roomIdToConnect}`,
    {
      share: true,
    },
    connect,
  )

  useEffect(() => {
    if (!options.shouldTrackMessages) {
      return
    }

    if (
      lastJsonMessage &&
      lastJsonMessage.type === 'room/ack' &&
      raceMatch.routeId === '/race/' &&
      readyState === ReadyState.OPEN
    ) {
      navigate({ to: `/race/${lastJsonMessage.roomId}` })
    }

    if (lastJsonMessage) {
      processMessage(lastJsonMessage)
    }
  }, [
    options.shouldTrackMessages,
    lastJsonMessage,
    readyState,
    raceMatch,
    navigate,
  ])

  const createRoom = useCallback(() => connectToRoom(), [])

  const joinRoom = useCallback(
    (roomId: string) => {
      connectToRoom(roomId)
      navigate({
        to: '/race/$roomId',
        params: { roomId },
        replace: true,
      })
    },
    [navigate],
  )

  const startSetup = useCallback(
    () => sendJsonMessage(createStartSetupMessage()),
    [sendJsonMessage],
  )

  const playCards = useCallback(() => {
    sendJsonMessage(createPlayCardsMessage(selectedCards))
    clearCardSelection()
  }, [sendJsonMessage, selectedCards])

  const discardCards = useCallback(() => {
    sendJsonMessage(createDiscardCardsMessage(selectedCards))
    clearCardSelection()
  }, [sendJsonMessage, selectedCards])

  return {
    createRoom,
    joinRoom,
    startSetup,
    playCards,
    discardCards,
    readyState,
  }
}
