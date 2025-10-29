import { useCallback } from 'react'
import { Circle, Line, Rect } from 'react-konva'
import type { SupportedShapes } from '@/state/livery-editor-store'
import type { KonvaEventObject } from 'konva/lib/Node'
import { updateShape } from '@/state/livery-editor-store'

const ShapeMap = {
  Rect,
  Circle,
  Line,
}

const Shape = ({ type, ...attributes }: SupportedShapes) => {
  const onTransformEnd = useCallback(
    (e: KonvaEventObject<Event>) => {
      if (!attributes.id) {
        console.warn('Shape id is not defined')
        return
      }

      updateShape(attributes.id, e.currentTarget.attrs)
    },
    [attributes.id],
  )

  const Component = ShapeMap[type]

  return (
    <Component
      key={attributes.id}
      {...attributes}
      onTransformEnd={onTransformEnd}
      onDragEnd={onTransformEnd}
    />
  )
}

export default Shape
