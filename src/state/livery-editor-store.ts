import { useStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'
import { create } from 'mutative'
import type Konva from 'konva'
import type { PublicKeyOf } from '@/types/livery'
import { DevtoolsStoreEventClient } from '@/devtools/store-devtools/store-event-client'
import { getCallerName } from '@/lib/utils'
import { TRANSFORMER_REF } from '@/constants/livery'
import { getDefaultAttributesForShape } from '@/lib/livery'

export type SupportedShapes = { id?: string } & (
  | (Konva.RectConfig & { type: 'Rect' })
  | (Konva.CircleConfig & { type: 'Circle' })
  | (Konva.LineConfig & { type: 'Line' })
)

export interface LiveryEditorState {
  shapes: Array<SupportedShapes>
  selectedShapeIds: Array<string>
  contextMenuPosition: { x: number; y: number } | null
}

export const liveryEditorStore = new Store<LiveryEditorState>({
  shapes: [],
  selectedShapeIds: [],
  contextMenuPosition: null,
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
      ...getDefaultAttributesForShape(shape.type),
      ...shape,
      draggable: true,
      id: crypto.randomUUID(),
    })
  })
}

export const updateShape = (
  id: string,
  shapeUpdates: Partial<SupportedShapes>,
) => {
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
    draft.selectedShapeIds = []
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

export const setContextMenuPosition = (
  position: LiveryEditorState['contextMenuPosition'],
) => {
  updateStoreWithMutative((draft) => {
    draft.contextMenuPosition = position
  })
}

/**
 * Selectors
 */

export const getShapeById = (state: LiveryEditorState, id: string) => {
  return state.shapes.find((s) => s.id === id)
}

export const getShapeProperty = <T extends PublicKeyOf<SupportedShapes>>(
  state: LiveryEditorState,
  shapeId: string,
  propKey: T,
): SupportedShapes[T] | undefined => {
  const shape = getShapeById(state, shapeId)
  return shape ? (shape[propKey] as T) : undefined
}
