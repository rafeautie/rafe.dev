import { memo, useEffect, useRef } from 'react'
import { Layer, Shape } from 'react-konva'
import type Konva from 'konva'

import type { GridDot } from '../../hooks/use-grid-dots'

export type GridLayerProps = {
  dots: Array<GridDot>
  color: string
  radius: number
}

const GridLayerComponent = ({ dots, color, radius }: GridLayerProps) => {
  const shapeRef = useRef<Konva.Shape | null>(null)

  useEffect(() => {
    const layer = shapeRef.current?.getLayer()
    layer?.batchDraw()
  }, [color, dots, radius])

  return (
    <Layer
      listening={false}
      hitGraphEnabled={false}
      shadowForStrokeEnabled={false}
    >
      <Shape
        ref={shapeRef}
        listening={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        hitStrokeWidth={0}
        fill={color}
        sceneFunc={(ctx, shape) => {
          if (dots.length === 0) {
            return
          }

          ctx.beginPath()

          for (const dot of dots) {
            ctx.moveTo(dot.x + radius, dot.y)
            ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2)
          }

          ctx.fillStrokeShape(shape)
        }}
      />
    </Layer>
  )
}

export const GridLayer = memo(GridLayerComponent)
GridLayer.displayName = 'GridLayer'
