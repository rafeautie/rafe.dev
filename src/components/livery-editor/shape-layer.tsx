import { Circle, Layer, Line, Rect, Transformer } from 'react-konva'
import { useCallback, useEffect } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { SupportedShapes } from '@/state/livery-editor-store'
import { updateShape, useLiveryEditorStore } from '@/state/livery-editor-store'
import { STAGE_REF, TRANSFORMER_REF } from '@/constants/canvas'

const ShapeLayer = () => {
  const shapes = useLiveryEditorStore((state) => state.shapes)

  useEffect(() => {
    const handleStageClick = (
      e: KonvaEventObject<PointerEvent, Konva.Stage>,
    ) => {
      const transformer = TRANSFORMER_REF.current
      const stage = STAGE_REF.current

      if (!transformer || !stage) {
        return
      }

      const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey
      const isSelected = transformer.nodes().indexOf(e.target) >= 0

      if (!metaPressed && !isSelected) {
        // if no key pressed and the node is not selected
        // select just one
        transformer.nodes([e.target])
      } else if (metaPressed && isSelected) {
        // if we pressed keys and node was selected
        // we need to remove it from selection:
        const nodes = transformer.nodes().slice() // use slice to have new copy of array
        // remove node from array
        nodes.splice(nodes.indexOf(e.target), 1)
        transformer.nodes(nodes)
      } else if (metaPressed && !isSelected) {
        // add the node into selection
        const nodes = transformer.nodes().concat([e.target])
        transformer.nodes(nodes)
      }
    }

    STAGE_REF.current?.on('click', handleStageClick)

    return () => {
      STAGE_REF.current?.off('click', handleStageClick)
    }
  }, [])

  return (
    <Layer>
      {shapes.map((shape) => (
        <Shape {...shape} />
      ))}
      <Transformer
        ref={TRANSFORMER_REF}
        anchorCornerRadius={25}
        anchorSize={8}
        anchorStrokeWidth={0}
        anchorFill="#fafafa"
        borderStroke="#fafafa"
      />
    </Layer>
  )
}

const Shape = ({ type, ...attributes }: SupportedShapes) => {
  const handleTransformEnd = useCallback(
    (e: KonvaEventObject<Event>) => {
      if (!attributes.id) {
        console.warn('Shape id is not defined')
        return
      }

      updateShape(attributes.id, e.currentTarget.attrs)
    },
    [attributes.id],
  )

  switch (type) {
    case 'rect':
      return (
        <Rect
          key={attributes.id}
          {...attributes}
          onTransformEnd={handleTransformEnd}
          onDragEnd={handleTransformEnd}
        />
      )
    case 'circle':
      return (
        <Circle
          key={attributes.id}
          {...attributes}
          onTransformEnd={handleTransformEnd}
          onDragEnd={handleTransformEnd}
        />
      )
    case 'line':
      return (
        <Line
          key={attributes.id}
          {...attributes}
          onTransformEnd={handleTransformEnd}
          onDragEnd={handleTransformEnd}
        />
      )
    default:
      return null
  }

  return
}

export default ShapeLayer
