import { useRef } from 'react'
import { Layer, Rect, Stage } from 'react-konva'
import { useMeasure } from 'react-use'

import {
  GRID_COLOR,
  GRID_DOT_RADIUS,
  GRID_SPACING,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_BY,
} from '../../constants/canvas'
import { useCanvasTransform } from '../../hooks/use-canvas-transform'
import { useGridDots } from '../../hooks/use-grid-dots'
import { GridLayer } from './grid-layer'
import type Konva from 'konva'

const EditorCanvas = () => {
  const [ref, { width, height }] = useMeasure<HTMLDivElement>()
  const stageRef = useRef<Konva.Stage | null>(null)

  const {
    transform,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
  } = useCanvasTransform({
    stageRef,
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

  return (
    <div
      ref={ref}
      className="absolute top-0 left-0 right-0 bottom-0 h-[calc(100vh-16px)] w-full rounded-lg overflow-hidden bg-neutral-900 border-4"
    >
      <Stage
        ref={stageRef}
        width={width || 0}
        height={height || 0}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <GridLayer dots={dots} color={GRID_COLOR} radius={GRID_DOT_RADIUS} />
        <Layer>
          <Rect x={20} y={60} width={65} height={65} fill="red" draggable />
        </Layer>
      </Stage>
    </div>
  )
}

export default EditorCanvas
