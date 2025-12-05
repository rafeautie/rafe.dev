import HolographicSticker from 'holographic-sticker'
import { useCallback } from 'react'
import { motion } from 'motion/react'
import Brake from './icons/brake.svg?react'
import GearStick from './icons/gear-stick.svg?react'
import Pedals from './icons/pedals.svg?react'
import Piston from './icons/piston.svg?react'
import SteeringWheel from './icons/steering-wheel.svg?react'
import Suspension from './icons/suspension.svg?react'
import BrakeUrl from './icons/brake.svg?no-inline'
import GearStickUrl from './icons/gear-stick.svg?no-inline'
import PedalsUrl from './icons/pedals.svg?no-inline'
import PistonUrl from './icons/piston.svg?no-inline'
import SteeringWheelUrl from './icons/steering-wheel.svg?no-inline'
import SuspensionUrl from './icons/suspension.svg?no-inline'
import type { CardRank, CardSuit, DeckCard } from '@/race/types'
import { CHAMPION_CARD, EXTEND_CARDS, REDLINE_CARD } from '@/race/constants'
import { cn } from '@/lib/utils'

interface CardProps extends DeckCard {
  className?: string
  onClick?: (card: DeckCard) => void
  side?: 'front' | 'back'
  height?: number
  width?: number
}

const SuitIconMap: Record<CardSuit, typeof Brake> = {
  brake: Brake,
  'gear-stick': GearStick,
  pedals: Pedals,
  piston: Piston,
  'steering-wheel': SteeringWheel,
  suspension: Suspension,
}

const SuitUrlMap: Record<CardSuit, string> = {
  brake: BrakeUrl,
  'gear-stick': GearStickUrl,
  pedals: PedalsUrl,
  piston: PistonUrl,
  'steering-wheel': SteeringWheelUrl,
  suspension: SuspensionUrl,
}

const PatternUrlMap: Partial<Record<CardRank, string>> = {
  '12': '/patterns/noise.svg',
  R: '/patterns/noise.svg',
}
const CAR_ASPECT_RATIO = 0.714

export const Card = ({
  id,
  rank,
  suit,
  side = 'front',
  height = 138,
  width = height * CAR_ASPECT_RATIO,
  className,
  onClick,
}: CardProps) => {
  const isChampion = rank === CHAMPION_CARD
  const isRedLine = rank === REDLINE_CARD
  const isExtend = EXTEND_CARDS.includes(rank)
  const isChampionOrRedLine = isChampion || isRedLine
  const hideRank = height < 115

  const textStyle = cn('text-background', {
    'text-red-300 fill-red-300': isRedLine,
    'text-amber-600 fill-amber-600': isExtend,
    'text-indigo-300 fill-indigo-300': isChampion,
  })
  const bgStyle = cn('bg-amber-50', {
    'bg-red-800': isRedLine,
    'bg-amber-100': isExtend,
    'bg-indigo-600': isChampion,
  })

  const onCardClick = useCallback(
    () => onClick?.({ id, rank, suit }),
    [id, onClick, rank, suit],
  )

  return (
    <motion.div
      animate={{ rotateY: side === 'front' ? 0 : 180 }}
      className={cn('relative transform-3d select-none')}
      onClick={onCardClick}
    >
      <HolographicSticker.Root
        style={{ minHeight: 0 }}
        className="absolute backface-hidden top-0 "
      >
        <HolographicSticker.Scene>
          <HolographicSticker.Card
            width={width}
            className={cn('shadow-xl rounded-lg', className)}
          >
            <HolographicSticker.Content className="rounded-none">
              <div style={{ height, width }} className={bgStyle} />
            </HolographicSticker.Content>

            {isChampionOrRedLine && (
              <>
                <HolographicSticker.Pattern
                  maskUrl={SuitUrlMap[suit]}
                  maskSize="100px 100px"
                  textureUrl={PatternUrlMap[rank]}
                  opacity={0.15}
                  mixBlendMode="hard-light"
                >
                  <HolographicSticker.Refraction intensity={1} />
                </HolographicSticker.Pattern>

                <HolographicSticker.Watermark
                  imageUrl={PatternUrlMap[rank]}
                  opacity={0.5}
                >
                  <HolographicSticker.Refraction intensity={1} />
                </HolographicSticker.Watermark>
              </>
            )}

            <HolographicSticker.Content
              className={cn('shadow-xl rounded-none')}
            >
              <div key={id} className={textStyle}>
                <CornerRankSuit rank={rank} suit={suit} hideRank={hideRank} />
                <CornerRankSuit
                  rank={rank}
                  suit={suit}
                  invert
                  hideRank={hideRank}
                />
                <div
                  style={{ height, width }}
                  className="flex justify-center items-center"
                >
                  <SuitIcon
                    suit={suit}
                    size={Math.max(12, Math.round(height * 0.35))}
                  />
                </div>
              </div>
            </HolographicSticker.Content>

            {isChampionOrRedLine && (
              <HolographicSticker.Spotlight intensity={0.5} />
            )}
            {isChampionOrRedLine && <HolographicSticker.Glare />}
          </HolographicSticker.Card>
        </HolographicSticker.Scene>
      </HolographicSticker.Root>
      <CardBack className="absolute backface-hidden rotate-y-180 top-0" />
    </motion.div>
  )
}

const CornerRankSuit = ({
  rank,
  suit,
  invert,
  hideRank,
}: Omit<DeckCard, 'id'> & {
  invert?: boolean
  hideRank?: boolean
}) => {
  return (
    <div
      className={cn(
        'flex flex-col self-start justify-center items-center absolute text-sm',
        {
          'transform rotate-180 bottom-1 right-2': invert,
          'top-1 left-2': !invert,
        },
      )}
    >
      <p className="text-lg">{rank}</p>
      {!hideRank && <SuitIcon suit={suit} size={18} />}
    </div>
  )
}

const SuitIcon = ({ suit, size = 14 }: { suit: CardSuit; size?: number }) => {
  const Icon = SuitIconMap[suit]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      x="0px"
      y="0px"
      style={{ width: size, height: size }}
    >
      <g>
        <Icon />
      </g>
    </svg>
  )
}

const CardBack = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        'w-[100px] h-[138px] rounded-lg shadow-xl card-back-pattern border-6 border-neutral-900',
        className,
      )}
    />
  )
}
