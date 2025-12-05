import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

interface BoardTileProps {
  index: number
  isStart: boolean
  isEnd: boolean
}

export const BoardTile = ({ index, isStart, isEnd }: BoardTileProps) => {
  return (
    <motion.div
      key={index}
      layout
      className={cn(
        'flex justify-center items-center h-25 w-28 z-10',
        index % 2 === 0 ? 'bg-blue-400' : 'bg-blue-50',
        index < 0 ? 'opacity-50' : '',
        isStart ? 'rounded-l-lg' : '',
        isEnd ? 'rounded-r-lg' : '',
      )}
    />
  )
}
