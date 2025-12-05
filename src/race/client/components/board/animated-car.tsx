import { motion, stagger } from 'motion/react'
import { useMemo, useState } from 'react'
import { cubicPathKeyFrames } from '../../utils'
import { Car } from '../car'
import type { Point } from '../../type'
import type { CarProps } from '../car'
import type { MotionProps } from 'motion/react'
import { cn } from '@/lib/utils'
import {
  BOARD_GRID_ITEM_HEIGHT,
  BOARD_GRID_ITEM_WIDTH,
  CAR_QUALIFYING_ANIMATION_DURATION,
  RACE_TRANSITION,
  RACE_TRANSITION_DURATION,
} from '@/race/constants'
import { useCardPlayEventHandler } from '@/race/client/hooks/useCardPlayEvent'

export const AnimatedCar = ({
  carId,
  index,
  gridSize,
  position,
  color,
  onLayoutAnimationComplete,
}: {
  carId: string
  index: number
  gridSize: number
  position: number
} & CarProps &
  Pick<MotionProps, 'onLayoutAnimationComplete'>) => {
  const initialPosition: Point = useMemo(
    () => ({
      x: -BOARD_GRID_ITEM_WIDTH * 2,
      y: (index - gridSize / 2) * BOARD_GRID_ITEM_HEIGHT,
      rotate: 0,
    }),
    [gridSize, index],
  )
  const carX = BOARD_GRID_ITEM_WIDTH * position
  const carY = -BOARD_GRID_ITEM_HEIGHT / 2

  const [targetAnimation, setTargetAnimation] =
    useState<MotionProps['animate']>(undefined)

  const moveCarToStartingGridPosition = () => {
    const keyFrames = cubicPathKeyFrames(
      initialPosition,
      {
        x: carX,
        y: carY,
        rotate: 0,
      },
      0.6,
      200,
    )

    setTargetAnimation({
      x: keyFrames.x,
      y: keyFrames.y,
      rotate: keyFrames.rotate,
      transition: {
        ease: 'linear',
        duration: CAR_QUALIFYING_ANIMATION_DURATION,
        delay: stagger(1, { startDelay: 0.5, from: 'last' })(
          position,
          gridSize,
        ),
        times: keyFrames.times,
      },
    })
  }

  const moveCarToPosition = () => {
    setTargetAnimation({
      x: carX,
      y: carY,
      rotate: 0,
      transition: {
        ...RACE_TRANSITION,
        delay: RACE_TRANSITION_DURATION,
      },
    })
  }

  useCardPlayEventHandler({
    qualifyingResolution: moveCarToStartingGridPosition,
    challengeResolution: moveCarToPosition,
    extendPlay: moveCarToPosition,
  })

  return (
    <motion.div
      key={carId}
      layoutId={carId}
      initial={initialPosition}
      animate={targetAnimation}
      onAnimationComplete={onLayoutAnimationComplete}
      transition={RACE_TRANSITION}
      className={cn('absolute w-25')}
    >
      <Car color={color} className="w-25 translate-x-1.5" />
    </motion.div>
  )
}
