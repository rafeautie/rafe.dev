import { Stage } from 'react-konva'
import { useMeasure } from 'react-use'
import { useCallback, useEffect } from 'react'
import {
  GRID_SPACING,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_BY,
  STAGE_REF,
  TRANSFORMER_REF,
} from '../../../constants/livery'
import { useCanvasTransform } from '../../../hooks/use-canvas-transform'
import { useGridDots } from '../../../hooks/use-grid-dots'
import { GridLayer } from '../grid-layer'
import ShapeControls from '../shape-controls'
import { EditorContextMenu } from '../context-menu'
import { ShapePropertiesPanel } from '../shape-properties-panel'
import { LayersPanel } from '../layers-panel'
import { Layers } from './layers'
import { TransformerLayer } from './transformer-layer'
import type Konva from 'konva'
import type { KonvaEventObject, Node, NodeConfig } from 'konva/lib/Node'
import {
  clearSelectedShapes,
  deselectShape,
  selectShape,
  setContextMenuPosition,
} from '@/state/livery-store'
import { cn } from '@/lib/utils'

export const Canvas = () => {
  const [ref, { width, height }] = useMeasure<HTMLDivElement>()

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

      const metaPressed = e.evt.shiftKey || e.evt.ctrlKey
      const isSelected = transformer.nodes().indexOf(e.target) >= 0

      if (!metaPressed && !isSelected) {
        clearSelectedShapes()
        selectShape(e.target.attrs.id)
      } else if (metaPressed && isSelected) {
        deselectShape(e.target.attrs.id)
      } else if (metaPressed && !isSelected) {
        selectShape(e.target.attrs.id)
      }
    }

    STAGE_REF.current?.on('click', handleStageClick)

    return () => {
      STAGE_REF.current?.off('click', handleStageClick)
    }
  }, [])

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
      className="absolute top-0 left-0 right-0 bottom-0 h-(--inset-area-height) w-full rounded-lg bg-neutral-900 border-solid border-[calc(var(--inset-area-border))]  border-blue-500 select-none overflow-hidden"
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
          <Layers />
          <TransformerLayer />
        </Stage>
        <div
          className={cn(
            'flex justify-between items-start h-(--canvas-area-height) absolute inset-0 py-5 px-5 pointer-events-none',
          )}
        >
          <ShapeControls />
          <div className="flex flex-col justify-start gap-5 h-full">
            <LayersPanel />
            <ShapePropertiesPanel />
          </div>
        </div>
      </EditorContextMenu>
    </div>
  )
}
