import { motion, useAnimate } from 'motion/react'
import { useRef, useState } from 'react'
import {
  getGrid,
  getLatestPlayedCardsByCarId,
  getLatestPlayedTotalByCarId,
  setAnimationInProgress,
  useRaceStore,
} from '../../state'
import { Card } from '../card'
import DisolveEffect from '../effects/dissolve-effect'
import type { DisolveEffectHandle } from '../effects/dissolve-effect'
import type { MotionProps } from 'motion/react'
import type { DeckCard } from '@/race/types'
import type { NumberTickerRef } from '@/components/fancy/text/basic-number-ticker'
import { cn } from '@/lib/utils'
import {
  BOARD_GRID_ITEM_HEIGHT,
  BOARD_GRID_ITEM_WIDTH,
  CARD_REVEAL_ROTATE_DELAY,
  CAR_QUALIFYING_ANIMATION_DURATION,
  DISOLVE_DELAY,
  DISOLVE_DURATION,
  RACE_TRANSITION,
  RACE_TRANSITION_DURATION,
} from '@/race/constants'
import { useGameEventHandler } from '@/race/client/hooks/useGameEvent'
import { soundEffects } from '@/race/client/sound'
import { waitWhileVisible } from '@/race/client/utils'
import NumberTicker from '@/components/fancy/text/basic-number-ticker'

export const AnimatedCardReveal = ({
  carId,
  position,
  className,
}: {
  carId: string
  position: number
  className?: string
} & Pick<MotionProps, 'onLayoutAnimationComplete'>) => {
  const grid = useRaceStore(getGrid)
  const playedCards = useRaceStore(getLatestPlayedCardsByCarId(carId))
  const playedTotal = useRaceStore(getLatestPlayedTotalByCarId(carId))
  const [showTotal, setShowTotal] = useState(false)

  const [scope, animate] = useAnimate()
  const [scopeTotal, animateTotal] = useAnimate()
  const numberTickerRef = useRef<NumberTickerRef>(null)

  const triggerTotalAnimation = async ({
    show,
    delay = 0,
  }: {
    show: boolean
    delay?: number
  }) => {
    if (show) {
      setShowTotal(true)
    }
    await animateTotal(
      scopeTotal.current,
      show
        ? { opacity: 1, filter: 'blur(0px)' }
        : { opacity: 0, filter: 'blur(4px)' },
      {
        ...RACE_TRANSITION,
        delay,
      },
    )
    if (!show) {
      setShowTotal(false)
    }
  }

  const entranceAnimation = async ({
    startDelay = 0,
    startAtPosition = false,
    skipTotalAnimation = false,
  }: {
    startDelay?: number
    startAtPosition?: boolean
    skipTotalAnimation?: boolean
  } = {}) => {
    setAnimationInProgress(`cardReveal-${carId}`, true)

    if (startAtPosition) {
      await animate(
        scope.current,
        { x: BOARD_GRID_ITEM_WIDTH * position },
        { duration: 0, delay: 0 },
      )
    }

    await animate(
      scope.current,
      {
        y: -BOARD_GRID_ITEM_HEIGHT / 2 - 130,
        opacity: 1,
      },
      {
        ...RACE_TRANSITION,
        delay: startDelay,
      },
    )

    if (!startAtPosition) {
      await animate(
        scope.current,
        {
          x: BOARD_GRID_ITEM_WIDTH * position,
        },
        RACE_TRANSITION,
      )
    }

    if (!skipTotalAnimation) {
      await triggerTotalAnimation({ show: true })
      await triggerTotalAnimation({ show: false, delay: DISOLVE_DELAY })
    }

    await animate(
      scope.current,
      {
        y: 0,
        x: BOARD_GRID_ITEM_WIDTH * position,
        opacity: 0,
      },
      {
        ...RACE_TRANSITION,
        duration: 0,
      },
    )

    setAnimationInProgress(`cardReveal-${carId}`, false)
  }

  useGameEventHandler({
    qualifyingResolution: () =>
      entranceAnimation({
        startDelay: CAR_QUALIFYING_ANIMATION_DURATION * grid.length,
        startAtPosition: true,
      }),
    challengeResolution: () => entranceAnimation(),
    extendPlay: () => entranceAnimation(),
    discardPlay: () => entranceAnimation(),
  })

  return (
    <motion.div
      ref={scope}
      initial={{
        x: BOARD_GRID_ITEM_WIDTH * position,
        y: -BOARD_GRID_ITEM_HEIGHT / 2,
      }}
      transition={RACE_TRANSITION}
      id="container"
      className={cn(
        'absolute w-28 h-25 flex flex-col justify-center items-center',
        className,
      )}
    >
      <motion.div
        ref={scopeTotal}
        initial={{ opacity: 0, filter: 'blur(8px)' }}
        className="absolute -top-12"
      >
        {showTotal && playedTotal !== undefined && (
          <NumberTicker
            ref={numberTickerRef}
            className="text-2xl"
            from={0}
            target={playedTotal}
            transition={{
              duration: DISOLVE_DELAY,
              type: 'tween',
              ease: 'easeOut',
            }}
            autoStart
            audibleTick
          />
        )}
      </motion.div>
      {playedCards?.map((card, cardIndex) => (
        <AnimatedCard key={card.id + 'reveal'} index={cardIndex} {...card} />
      ))}
    </motion.div>
  )
}

const AnimatedCard = ({
  index,
  className,
  numberOfCards,
  ...card
}: {
  index: number
  className?: string
  numberOfCards?: number
} & DeckCard) => {
  const grid = useRaceStore(getGrid)

  const [scope, animate] = useAnimate()
  const dissolveRef = useRef<DisolveEffectHandle>(null)

  const animation = async ({
    startDelay = CARD_REVEAL_ROTATE_DELAY,
  }: {
    startDelay?: number
  } = {}) => {
    setAnimationInProgress(`cardReveal-${card.id}`, true)
    await Promise.all([
      animate(
        scope.current,
        {
          rotate: index * 15,
          x: index * 20,
        },
        {
          ...RACE_TRANSITION,
          delay: startDelay,
        },
      ).finished,
      waitWhileVisible(RACE_TRANSITION_DURATION + startDelay + DISOLVE_DELAY),
    ])

    if (index === 0) {
      soundEffects.play('crumple', { delay: DISOLVE_DELAY })
    }

    await dissolveRef.current?.start({
      delay: DISOLVE_DELAY,
      duration: DISOLVE_DURATION,
    })

    await animate(
      scope.current,
      {
        rotate: 0,
        x: 0,
      },
      RACE_TRANSITION,
    )
    setAnimationInProgress(`cardReveal-${card.id}`, false)
  }

  useGameEventHandler({
    qualifyingResolution: () =>
      animation({
        startDelay: CAR_QUALIFYING_ANIMATION_DURATION * grid.length,
      }),
    challengeResolution: () => animation(),
    extendPlay: () => animation(),
    discardPlay: () => animation(),
  })

  return (
    <motion.div ref={scope} className={cn('absolute', className)}>
      <DisolveEffect key={card.id} ref={dissolveRef}>
        <Card {...card} height={100} />
      </DisolveEffect>
    </motion.div>
  )
}
