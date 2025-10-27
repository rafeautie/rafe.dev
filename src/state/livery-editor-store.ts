import { useStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'
import { create } from 'mutative'
import type Konva from 'konva'
import { DevtoolsStoreEventClient } from '@/devtools/store-devtools/store-event-client'
import { getCallerName } from '@/lib/utils'
import { TRANSFORMER_REF } from '@/constants/canvas'

export type SupportedShapes = { id?: string } & (
  | (Konva.RectConfig & { type: 'rect' })
  | (Konva.CircleConfig & { type: 'circle' })
  | (Konva.LineConfig & { type: 'line' })
)

export interface LiveryEditorState {
  shapes: Array<SupportedShapes>
  selectedShapeIds: Array<string>
}

export const liveryEditorStore = new Store<LiveryEditorState>({
  shapes: [],
  selectedShapeIds: [],
})

DevtoolsStoreEventClient.emit('register-store', {
  storeName: 'LiveryEditorStore',
})

export const useLiveryEditorStore = <TData = unknown>(
  selector: (state: (typeof liveryEditorStore)['state']) => TData,
) => {
  return useStore(liveryEditorStore, selector)
}

const updateStoreWithMutative = (
  updater: (draft: (typeof liveryEditorStore)['state']) => void,
) => {
  const state = create(liveryEditorStore.state, updater)
  liveryEditorStore.setState(state)
  DevtoolsStoreEventClient.emit('state-change', {
    storeName: 'LiveryEditorStore',
    action: getCallerName(),
    state: state,
    timestamp: Date.now(),
  })
}

export const addShape = (shape: SupportedShapes) => {
  updateStoreWithMutative((draft) => {
    draft.shapes.push({
      ...shape,
      width: shape.width ?? 100,
      height: shape.height ?? 100,
      points: shape.points ?? [0, 0, 100, 100, 150, 150],
      fill: shape.fill ?? 'red',
      stroke: shape.stroke ?? 'red',
      radius: shape.radius ?? 50,
      x: shape.x ?? 100,
      y: shape.y ?? 100,
      draggable: true,
      id: crypto.randomUUID(),
    })
  })
}

export const updateShape = (id: string, shapeUpdates: SupportedShapes) => {
  updateStoreWithMutative((draft) => {
    const shapeToUpdateIndex = draft.shapes.findIndex((s) => s.id === id)

    if (shapeToUpdateIndex < 0) {
      console.warn(`Shape with id ${id} not found`)
      return
    }

    draft.shapes[shapeToUpdateIndex] = {
      ...draft.shapes[shapeToUpdateIndex],
      ...shapeUpdates,
    }
  })
}

export const deleteSelectedShapes = () => {
  updateStoreWithMutative((draft) => {
    draft.shapes = draft.shapes.filter(
      (s) => !draft.selectedShapeIds.includes(s.id!),
    )
  })
  TRANSFORMER_REF.current?.setNodes([])
}

export const selectShape = (id: string) => {
  updateStoreWithMutative((draft) => {
    if (!draft.selectedShapeIds.includes(id)) {
      draft.selectedShapeIds.push(id)
    }
  })
}

export const deselectShape = (id: string) => {
  updateStoreWithMutative((draft) => {
    draft.selectedShapeIds = draft.selectedShapeIds.filter((sid) => sid !== id)
  })
}

export const clearSelectedShapes = () => {
  updateStoreWithMutative((draft) => {
    draft.selectedShapeIds = []
  })
}
