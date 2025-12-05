import { useEffect } from 'react'
import {
  getIsCardPlayEventHandled,
  getLatestCardPlayEvent,
  markCardPlayEventAsHandled,
  useRaceStore,
} from '../state'
import type {
  ChallengeResolutionEvent,
  DiscardPlayEvent,
  ExtendPlayEvent,
  QualifyingResolutionEvent,
} from '@/race/types'

export type UseCardPlayEventProps = Partial<{
  // [key in CardPlayEvent['type']]: () => void | Promise<void>
  qualifyingResolution: (
    qualifyingResolutionEvent: QualifyingResolutionEvent,
  ) => void | Promise<void>
  challengeResolution: (
    challengeResolutionEvent: ChallengeResolutionEvent,
  ) => void | Promise<void>
  extendPlay: (extendPlayEvent: ExtendPlayEvent) => void | Promise<void>
  discardPlay: (discardPlayEvent: DiscardPlayEvent) => void | Promise<void>
}>

export const useCardPlayEventHandler = (options: UseCardPlayEventProps) => {
  const latestCardPlayEvent = useRaceStore(getLatestCardPlayEvent)
  const isCardPlayEventHandled = useRaceStore(
    getIsCardPlayEventHandled(latestCardPlayEvent?.id ?? ''),
  )

  useEffect(() => {
    if (!latestCardPlayEvent || isCardPlayEventHandled) {
      return
    }
    options[latestCardPlayEvent.type]?.(latestCardPlayEvent as any)
    markCardPlayEventAsHandled(latestCardPlayEvent.id)
  }, [latestCardPlayEvent, isCardPlayEventHandled, options])
}
