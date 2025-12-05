import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { range } from 'lodash'
import { useWindowSize } from '@uidotdev/usehooks'
import {
  getCars,
  getGrid,
  getHighestGridPosition,
  useRaceStore,
} from '../../state'
import { AnimatedCardReveal } from './card-reveal'
import { AnimatedCar } from './animated-car'
import { BoardTile } from './board-tile'
import { ConfettiLayer } from './confetti-layer'
import { cn } from '@/lib/utils'
import { BOARD_GRID_ITEM_WIDTH } from '@/race/constants'

interface BoardProps {
  className?: string
}

export const Board = ({ className }: BoardProps) => {
  const cars = useRaceStore(getCars)
  const grid = useRaceStore(getGrid)
  const highestGridPosition = useRaceStore(getHighestGridPosition)
  const windowSize = useWindowSize()
  const endIndex = highestGridPosition + 1
  const overflowWidth = Math.max(
    0,
    BOARD_GRID_ITEM_WIDTH * endIndex - (windowSize.width ?? Infinity),
  )

  return (
    <motion.div
      className={cn(
        'flex items-center justify-center h-[500px] min-w-[500px]',
        className,
      )}
      drag="x"
      dragTransition={{ bounceStiffness: 250, bounceDamping: 50 }}
      dragElastic={0.05}
      dragConstraints={{
        left: -overflowWidth,
        right: overflowWidth,
      }}
    >
      <div className={'flex items-center'}>
        <ConfettiLayer />
        <AnimatePresence>
          {range(0, endIndex).map((index) => {
            return (
              <BoardTile
                key={index}
                index={index}
                isStart={index === 0}
                isEnd={index === endIndex - 1}
              />
            )
          })}
        </AnimatePresence>
        <LayoutGroup>
          <div className="flex absolute z-20">
            {cars.map(({ car, position }, index) => {
              return (
                <AnimatedCar
                  key={car.id + 'car'}
                  carId={car.id}
                  index={index}
                  gridSize={grid.length}
                  position={position ?? 0}
                  color={car.color}
                />
              )
            })}
          </div>
        </LayoutGroup>
        <div className="flex absolute z-0">
          {cars.map(({ car, position }) => {
            return (
              <AnimatedCardReveal
                key={car.id + 'cardReveal'}
                carId={car.id}
                position={position ?? 0}
              />
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
