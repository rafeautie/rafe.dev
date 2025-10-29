import { Stage } from 'react-konva'
import { useMeasure } from 'react-use'

import { useCallback } from 'react'
import {
  GRID_SPACING,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_BY,
  STAGE_REF,
} from '../../constants/livery'
import { useCanvasTransform } from '../../hooks/use-canvas-transform'
import { useGridDots } from '../../hooks/use-grid-dots'
import { GridLayer } from './grid-layer'
import ShapeControls from './shape-controls'
import ShapeLayer from './shape-layer'
import { EditorContextMenu } from './context-menu'
import { ShapePropertiesPanel } from './shape-properties-panel'
import type { KonvaEventObject, Node, NodeConfig } from 'konva/lib/Node'
import {
  selectShape,
  setContextMenuPosition,
} from '@/state/livery-editor-store'

const EditorCanvas = () => {
  const [ref, { width, height }] = useMeasure<HTMLDivElement>()

  const {
    transform,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
  } = useCanvasTransform({
    width: width || 0,
    height: height || 0,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    scaleBy: SCALE_BY,
  })

  const dots = useGridDots({
    width: width || 0,
    height: height || 0,
    transform,
    spacing: GRID_SPACING,
  })

  const onContextMenu = useCallback(
    (event: KonvaEventObject<PointerEvent, Node<NodeConfig>>) => {
      const shape = event.target.id()
      const pointerPosition = STAGE_REF.current?.getRelativePointerPosition()

      if (shape) {
        selectShape(shape)
      }

      setContextMenuPosition({
        x: pointerPosition?.x ?? 0,
        y: pointerPosition?.y ?? 0,
      })
    },
    [],
  )

  return (
    <div
      ref={ref}
      className="absolute top-0 left-0 right-0 bottom-0 h-[calc(100vh-16px)] w-full rounded-lg overflow-hidden bg-neutral-900 border-2 border-blue-500"
    >
      <EditorContextMenu>
        <Stage
          ref={STAGE_REF}
          width={width || 0}
          height={height || 0}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={onContextMenu}
        >
          <GridLayer dots={dots} />
          <ShapeLayer />
        </Stage>
        <div className="grid grid-cols-[1fr_1fr_1fr] justify-items-center h-full absolute top-0 left-0 right-0 pointer-events-none py-5 px-5">
          <div />
          <ShapeControls />
          <ShapePropertiesPanel />
        </div>
      </EditorContextMenu>
    </div>
  )
}

export default EditorCanvas
