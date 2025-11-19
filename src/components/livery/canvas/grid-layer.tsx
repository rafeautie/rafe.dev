import { memo } from 'react'
import { Layer, Shape } from 'react-konva'
import type { GridDot } from '../../../hooks/use-grid-dots'
import { GRID_COLOR, GRID_DOT_RADIUS } from '@/constants/livery'

export type GridLayerProps = {
  dots: Array<GridDot>
  offsetX?: number
  offsetY?: number
}

const GridLayerComponent = ({ dots, offsetX, offsetY }: GridLayerProps) => {
  return (
    <Layer listening={false} shadowForStrokeEnabled={false}>
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        hitStrokeWidth={0}
        fill={GRID_COLOR}
        sceneFunc={(ctx, shape) => {
          if (dots.length === 0) {
            return
          }

          ctx.beginPath()

          for (const dot of dots) {
            const x = dot.x + (offsetX || 0)
            const y = dot.y + (offsetY || 0)
            ctx.moveTo(x + GRID_DOT_RADIUS, y)
            ctx.arc(x, y, GRID_DOT_RADIUS, 0, Math.PI * 2)
          }

          ctx.fillStrokeShape(shape)
        }}
      />
    </Layer>
  )
}

export const GridLayer = memo(GridLayerComponent)
GridLayer.displayName = 'GridLayer'
