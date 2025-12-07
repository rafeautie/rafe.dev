import { useEffect } from 'react'
import {
  getIsGameFeedEventHandled,
  getLatestGameFeedEvent,
  markGameFeedEventAsHandled,
  useRaceStore,
} from '../state'
import type {
  ChallengeResolutionEvent,
  DiscardPlayEvent,
  ExtendPlayEvent,
  QualifyingResolutionEvent,
  RaceEndEvent,
} from '@/race/types'

export type UseGameEventHandlerProps = Partial<{
  qualifyingResolution: (
    qualifyingResolutionEvent: QualifyingResolutionEvent,
  ) => void | Promise<void>
  challengeResolution: (
    challengeResolutionEvent: ChallengeResolutionEvent,
  ) => void | Promise<void>
  extendPlay: (extendPlayEvent: ExtendPlayEvent) => void | Promise<void>
  discardPlay: (discardPlayEvent: DiscardPlayEvent) => void | Promise<void>
  raceEnd: (raceEndEvent: RaceEndEvent) => void | Promise<void>
}>

export const useGameEventHandler = (options: UseGameEventHandlerProps) => {
  const latestGameFeedEvent = useRaceStore(getLatestGameFeedEvent)
  const isGameFeedEventHandled = useRaceStore(
    getIsGameFeedEventHandled(latestGameFeedEvent?.id ?? ''),
  )

  useEffect(() => {
    if (!latestGameFeedEvent || isGameFeedEventHandled) {
      return
    }
    options[latestGameFeedEvent.type]?.(latestGameFeedEvent as any)
    markGameFeedEventAsHandled(latestGameFeedEvent.id)
  }, [latestGameFeedEvent, isGameFeedEventHandled, options])
}
