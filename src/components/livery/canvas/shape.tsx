import { useCallback } from 'react'
import { Circle, Line, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  getShapeById,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-store'

const ShapeMap = {
  Rect,
  Circle,
  Line,
}

interface ShapeProps {
  shapeId: string
}

const Shape = ({ shapeId }: ShapeProps) => {
  const shape = useLiveryEditorStore((state) => getShapeById(state, shapeId))

  const onTransformEnd = useCallback(
    (e: KonvaEventObject<Event>) => {
      if (!shape?.id) {
        console.warn('Shape id is not defined')
        return
      }

      updateShape(shape.id, e.currentTarget.attrs)
    },
    [shape],
  )

  if (!shape) {
    return null
  }

  const Component = ShapeMap[shape.type]

  return (
    <Component
      key={shape.id}
      {...shape}
      onTransformEnd={onTransformEnd}
      onDragEnd={onTransformEnd}
    />
  )
}

export default Shape
