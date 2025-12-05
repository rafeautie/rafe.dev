import { useEffect, useRef } from 'react'
import { getDidRaceEnd, useRaceStore } from '../state'

export const useRaceEndEvent = (onRaceEnd: () => void) => {
  const didRaceEnd = useRaceStore((state) =>
    getDidRaceEnd(state.messageHistory),
  )
  const onRaceEndRef = useRef(onRaceEnd)

  useEffect(() => {
    onRaceEndRef.current = onRaceEnd
  }, [onRaceEnd])

  useEffect(() => {
    if (didRaceEnd) {
      onRaceEndRef.current()
    }
  }, [didRaceEnd])
}
