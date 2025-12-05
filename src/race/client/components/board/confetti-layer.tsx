import { useMemo, useRef } from 'react'
import { CAR_COLOR_MAP } from '../car'
import type { UseCardPlayEventProps } from '@/race/client/hooks/useCardPlayEvent'
import type { ConfettiRef } from '@/components/ui/confetti'
import { Confetti } from '@/components/ui/confetti'
import { cn } from '@/lib/utils'
import { useCardPlayEventHandler } from '@/race/client/hooks/useCardPlayEvent'
import {
  BOARD_GRID_ITEM_HEIGHT,
  BOARD_GRID_ITEM_WIDTH,
  DISOLVE_DELAY,
  DISOLVE_DURATION,
  RACE_TRANSITION_DURATION,
} from '@/race/constants'
import {
  getCarById,
  getGridPositionByCarId,
  getHighestGridPosition,
  getOwnPlayerCar,
  raceStore,
} from '@/race/client/state'
import { soundEffects } from '@/race/client/sound'

interface ConfettiLayerProps {
  className?: string
}

export const ConfettiLayer = ({ className }: ConfettiLayerProps) => {
  const confettiRef = useRef<ConfettiRef>(null)

  const popConfettiForWinner: UseCardPlayEventProps['challengeResolution'] = (
    challengeResolution,
  ) => {
    const ownPlayerCar = getOwnPlayerCar(raceStore.state)
    const car = getCarById(challengeResolution.winnerId)(raceStore.state)
    const position = getGridPositionByCarId(challengeResolution.winnerId)(
      raceStore.state,
    )
    const highestGridPosition = getHighestGridPosition(raceStore.state)

    if (position == null) {
      return
    }

    const normalizedX = (BOARD_GRID_ITEM_WIDTH * position) / window.innerWidth
    const normalizedY = -BOARD_GRID_ITEM_HEIGHT / 2 / window.innerHeight
    const normalizedBoardLength =
      (BOARD_GRID_ITEM_WIDTH * highestGridPosition) / window.innerWidth / 2
    setTimeout(
      () => {
        confettiRef.current?.fire({
          origin: {
            x: 0.5 + normalizedX - normalizedBoardLength,
            y: 0.5 + normalizedY,
          },
          colors: Object.values(CAR_COLOR_MAP[car?.color ?? 'blue']),
          drift: 0.1,
          startVelocity: 33,
          gravity: 0.3,
          spread: 35,
        })

        if (
          [challengeResolution.winnerId, challengeResolution.loserId].includes(
            ownPlayerCar?.id ?? '',
          )
        ) {
          soundEffects.play(
            ownPlayerCar?.id === challengeResolution.winnerId
              ? 'success'
              : 'error',
          )
        }
      },
      (RACE_TRANSITION_DURATION * 1.5 + DISOLVE_DELAY + DISOLVE_DURATION) *
        1000,
    )
  }

  useCardPlayEventHandler({
    challengeResolution: popConfettiForWinner,
  })

  return useMemo(
    () => (
      <Confetti
        manualStart={true}
        ref={confettiRef}
        className={cn('absolute top-0 left-0 z-0 size-full', className)}
      />
    ),
    [className],
  )
}
