/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import {
  DRAG_DEBOUNCE_MS,
  GRID_BASE_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  PANNING_ENABLED,
  SCALE_BY,
  STAGE_REF,
  ZOOM_ENABLED,
} from '../constants/livery'
import type Konva from 'konva'

export type CanvasTransform = {
  scale: number
  position: {
    x: number
    y: number
  }
}

export type UseCanvasTransformArgs = {
  width: number
  height: number
  minScale?: number
  maxScale?: number
  scaleBy?: number
  enablePan?: boolean
  enableZoom?: boolean
}

type TransformStore = {
  transform: CanvasTransform
  listeners: Set<() => void>
}

type PointerPosition = {
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const useCanvasTransform = ({
  width,
  height,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
  scaleBy = SCALE_BY,
  enablePan = PANNING_ENABLED,
  enableZoom = ZOOM_ENABLED,
}: UseCanvasTransformArgs) => {
  const storeRef = useRef<TransformStore>({
    transform: {
      scale: GRID_BASE_SCALE,
      position: { x: 0, y: 0 },
    },
    listeners: new Set(),
  })
  const rafRef = useRef<number | null>(null)
  const panStateRef = useRef<{
    isDragging: boolean
    lastPointer: PointerPosition | null
  }>({ isDragging: false, lastPointer: null })
  const lastCommitRef = useRef<number>(0)

  const commit = useCallback(() => {
    const stage = STAGE_REF.current
    const { scale, position } = storeRef.current.transform

    if (stage) {
      stage.scale({ x: scale, y: scale })
      stage.position(position)
      stage.batchDraw()
    }

    storeRef.current.listeners.forEach((listener) => listener())
  }, [])

  const scheduleCommit = useCallback(() => {
    if (rafRef.current !== null) {
      return
    }

    if (typeof window === 'undefined') {
      commit()
      return
    }

    // RAF-throttle canvas mutations so large drags do not flood React renders.
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null

      const now = performance.now()
      if (now - lastCommitRef.current < DRAG_DEBOUNCE_MS) {
        scheduleCommit()
        return
      }

      lastCommitRef.current = now
      commit()
    })
  }, [commit])

  const setTransform = useCallback(
    (
      updater:
        | CanvasTransform
        | ((current: CanvasTransform) => CanvasTransform),
    ) => {
      const nextTransform =
        typeof updater === 'function'
          ? (updater as (current: CanvasTransform) => CanvasTransform)(
              storeRef.current.transform,
            )
          : updater

      storeRef.current.transform = nextTransform
      scheduleCommit()
    },
    [scheduleCommit],
  )

  const subscribe = useCallback((listener: () => void) => {
    storeRef.current.listeners.add(listener)
    return () => storeRef.current.listeners.delete(listener)
  }, [])

  const getSnapshot = useCallback(() => storeRef.current.transform, [])

  const transform = useSyncExternalStore(subscribe, getSnapshot)

  const applyZoom = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      const stage = STAGE_REF.current

      if (!enableZoom) {
        return
      }

      event.evt.preventDefault()

      if (!stage) {
        return
      }

      if (event.target !== stage) {
        return
      }

      const pointer = stage.getPointerPosition()
      if (!pointer) {
        return
      }

      // Zoom toward the pointer to keep the cursor anchored during scaling.
      const direction = event.evt.deltaY > 0 ? -1 : 1
      const zoomFactor = direction > 0 ? scaleBy : 1 / scaleBy

      setTransform((current) => {
        const nextScale = clamp(current.scale * zoomFactor, minScale, maxScale)
        const worldPointer: PointerPosition = {
          x: (pointer.x - current.position.x) / current.scale,
          y: (pointer.y - current.position.y) / current.scale,
        }

        const nextPosition = {
          x: pointer.x - worldPointer.x * nextScale,
          y: pointer.y - worldPointer.y * nextScale,
        }

        return {
          scale: nextScale,
          position: nextPosition,
        }
      })
    },
    [enableZoom, maxScale, minScale, scaleBy, setTransform],
  )

  const updatePan = useCallback(
    (pointer: PointerPosition) => {
      const state = panStateRef.current
      if (!state.isDragging || !state.lastPointer) {
        state.lastPointer = pointer
        return
      }

      const delta = {
        x: pointer.x - state.lastPointer.x,
        y: pointer.y - state.lastPointer.y,
      }

      // Apply deltas in screen space; transform store handles batching.
      state.lastPointer = pointer

      setTransform((current) => ({
        scale: current.scale,
        position: {
          x: current.position.x + delta.x,
          y: current.position.y + delta.y,
        },
      }))
    },
    [setTransform],
  )

  const handlePointerDown = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
      const stage = STAGE_REF.current

      if (!enablePan || !stage || event.target !== stage) {
        return
      }

      const pointer = stage.getPointerPosition()
      if (!pointer) {
        return
      }

      panStateRef.current = {
        isDragging: true,
        lastPointer: pointer,
      }
    },
    [enablePan],
  )

  const handlePointerMove = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
      const stage = STAGE_REF.current

      if (!enablePan) {
        return
      }

      if (!panStateRef.current.isDragging) {
        return
      }

      event.evt.preventDefault()

      if (!stage) {
        return
      }

      const pointer = stage.getPointerPosition()
      if (!pointer) {
        return
      }

      updatePan(pointer)
    },
    [enablePan, updatePan],
  )

  const resetPanState = useCallback(() => {
    panStateRef.current = {
      isDragging: false,
      lastPointer: null,
    }
  }, [])

  const handlePointerUp = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
      if (!enablePan) {
        return
      }

      if (panStateRef.current.isDragging) {
        event.evt.preventDefault()
      }

      resetPanState()
    },
    [enablePan, resetPanState],
  )

  const handlePointerLeave = useCallback(() => {
    resetPanState()
  }, [resetPanState])

  const resetTransform = useCallback(() => {
    setTransform({
      scale: GRID_BASE_SCALE,
      position: { x: 0, y: 0 },
    })
  }, [setTransform])

  useEffect(() => {
    scheduleCommit()
  }, [height, scheduleCommit, width])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return {
    transform,
    setTransform,
    handleWheel: applyZoom,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    resetTransform,
  }
}
