import { memo } from 'react'
import { Layer, Shape } from 'react-konva'
import type { GridDot } from '../../hooks/use-grid-dots'
import { GRID_COLOR, GRID_DOT_RADIUS } from '@/constants/canvas'

export type GridLayerProps = {
  dots: Array<GridDot>
}

const GridLayerComponent = ({ dots }: GridLayerProps) => {
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
            ctx.moveTo(dot.x + GRID_DOT_RADIUS, dot.y)
            ctx.arc(dot.x, dot.y, GRID_DOT_RADIUS, 0, Math.PI * 2)
          }

          ctx.fillStrokeShape(shape)
        }}
      />
    </Layer>
  )
}

export const GridLayer = memo(GridLayerComponent)
GridLayer.displayName = 'GridLayer'
