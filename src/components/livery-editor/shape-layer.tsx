import { Layer, Transformer } from 'react-konva'
import { useEffect } from 'react'
import Shape from './shape'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  clearSelectedShapes,
  deselectShape,
  selectShape,
  useLiveryEditorStore,
} from '@/state/livery-editor-store'
import { STAGE_REF, TRANSFORMER_REF } from '@/constants/livery'

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

      if (e.target === stage) {
        transformer.nodes([])
        clearSelectedShapes()
        return
      }

      const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey
      const isSelected = transformer.nodes().indexOf(e.target) >= 0

      if (!metaPressed && !isSelected) {
        // if no key pressed and the node is not selected
        // select just one
        transformer.nodes([e.target])
        clearSelectedShapes()
        selectShape(e.target.attrs.id)
      } else if (metaPressed && isSelected) {
        // if we pressed keys and node was selected
        // we need to remove it from selection:
        const nodes = transformer.nodes().slice() // use slice to have new copy of array
        // remove node from array
        nodes.splice(nodes.indexOf(e.target), 1)
        transformer.nodes(nodes)
        deselectShape(e.target.attrs.id)
      } else if (metaPressed && !isSelected) {
        // add the node into selection
        const nodes = transformer.nodes().concat([e.target])
        transformer.nodes(nodes)
        selectShape(e.target.attrs.id)
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

export default ShapeLayer
