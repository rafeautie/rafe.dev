import { useStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'
import { create } from 'mutative'
import { toast } from 'sonner'
import type { Layer, PublicKeyOf, SupportedShapes } from '@/types/livery'
import { DevtoolsStoreEventClient } from '@/devtools/store-devtools/store-event-client'
import { getCallerName } from '@/lib/utils'
import { STAGE_REF, TRANSFORMER_REF } from '@/constants/livery'
import { getDefaultAttributesForShape } from '@/lib/livery'

export type ModifierKeys = 'Shift' | 'Control'

export interface PanelState {
  isOpen: boolean
}

export interface LiveryEditorState {
  layers: Array<Layer>
  shapesById: Record<string, SupportedShapes>
  selectedLayerId: string | null
  selectedShapeIds: Array<string>
  contextMenuPosition: { x: number; y: number } | null
  modifierKeys: Array<ModifierKeys>
  panels: {
    layersPanel: PanelState
    shapesPanel: PanelState
  }
}

DevtoolsStoreEventClient.emit('register-store', {
  storeName: 'LiveryEditorStore',
})

export const liveryEditorStore = new Store<LiveryEditorState>({
  layers: [{ id: 'layer-1', name: 'Layer 1', shapeIds: [], collapsed: false }],
  shapesById: {},
  selectedLayerId: 'layer-1',
  selectedShapeIds: [],
  contextMenuPosition: null,
  modifierKeys: [],
  panels: {
    layersPanel: { isOpen: true },
    shapesPanel: { isOpen: false },
  },
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
    if (draft.layers.length === 0) {
      draft.layers.push({
        id: crypto.randomUUID(),
        name: `Layer ${draft.layers.length + 1}`,
        shapeIds: [],
        collapsed: false,
      })
      draft.selectedLayerId = draft.layers[0].id
    }

    const layerToAddShapeTo = draft.layers.find(
      (layer) => layer.id === draft.selectedLayerId,
    )

    if (!layerToAddShapeTo) {
      toast.warning('Select a layer to add shapes to.')
      return
    }

    const id = crypto.randomUUID()

    draft.shapesById[id] = {
      ...getDefaultAttributesForShape(shape.type),
      ...shape,
      name: shape.type,
      layerId: layerToAddShapeTo.id,
      draggable: true,
      id,
    }

    layerToAddShapeTo.shapeIds.push(id)
  })
}

export const updateShape = (
  id: string,
  shapeUpdates: Partial<SupportedShapes>,
) => {
  updateStoreWithMutative((draft) => {
    draft.shapesById[id] = {
      ...draft.shapesById[id],
      ...shapeUpdates,
    }
  })
}

export const updateShapeOrder = (oldId: string, newId: string) => {
  updateStoreWithMutative((draft) => {
    const layerToUpdate = draft.layers.find((layer) =>
      layer.shapeIds.includes(oldId),
    )

    if (!layerToUpdate) {
      return
    }

    const oldIndex = layerToUpdate.shapeIds.findIndex((id) => id === oldId)
    const newIndex = layerToUpdate.shapeIds.findIndex((id) => id === newId)

    const [movedLayer] = layerToUpdate.shapeIds.splice(oldIndex, 1)
    layerToUpdate.shapeIds.splice(newIndex, 0, movedLayer)
  })
}

export const deleteSelectedShapes = () => {
  updateStoreWithMutative((draft) => {
    for (const id of draft.selectedShapeIds) {
      const shapeToDelete = draft.shapesById[id]
      const layerOfShapeBeingDeleted = draft.layers.find(
        (layer) => layer.id === shapeToDelete.layerId,
      )
      if (layerOfShapeBeingDeleted != null) {
        layerOfShapeBeingDeleted.shapeIds =
          layerOfShapeBeingDeleted.shapeIds.filter((sid) => sid !== id)
      }
      delete draft.shapesById[id]
    }
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
  const shape = STAGE_REF.current?.findOne(`#${id}`)
  if (shape) {
    const nodes = TRANSFORMER_REF.current?.getNodes() ?? []
    TRANSFORMER_REF.current?.setNodes([...nodes, shape])
  }
}

export const deselectShape = (id: string) => {
  updateStoreWithMutative((draft) => {
    draft.selectedShapeIds = draft.selectedShapeIds.filter((sid) => sid !== id)
  })
  const nodes = TRANSFORMER_REF.current?.getNodes() ?? []
  const filteredNodes = nodes.filter((node) => node.attrs.id !== id)
  TRANSFORMER_REF.current?.setNodes(filteredNodes)
}

export const clearSelectedShapes = () => {
  updateStoreWithMutative((draft) => {
    draft.selectedShapeIds = []
  })
  TRANSFORMER_REF.current?.setNodes([])
}

export const setContextMenuPosition = (
  position: LiveryEditorState['contextMenuPosition'],
) => {
  updateStoreWithMutative((draft) => {
    draft.contextMenuPosition = position
  })
}

export const addLayer = () => {
  updateStoreWithMutative((draft) => {
    const newId = crypto.randomUUID()
    draft.layers.push({
      id: newId,
      name: `Layer ${draft.layers.length + 1}`,
      shapeIds: [],
      collapsed: false,
    })
    draft.selectedLayerId = newId
  })
}

export const updateLayer = (
  id: string,
  layerUpdates: Partial<SupportedShapes>,
) => {
  updateStoreWithMutative((draft) => {
    const layerIndex = draft.layers.findIndex((layer) => layer.id === id)
    draft.layers[layerIndex] = {
      ...draft.layers[layerIndex],
      ...layerUpdates,
    }
  })
}

export const updateLayerOrder = (oldId: string, newId: string) => {
  updateStoreWithMutative((draft) => {
    const oldIndex = draft.layers.findIndex(({ id }) => id === oldId)
    const newIndex = draft.layers.findIndex(({ id }) => id === newId)
    const [movedLayer] = draft.layers.splice(oldIndex, 1)
    draft.layers.splice(newIndex, 0, movedLayer)
  })
}

export const deleteLayer = (layerId: string) => {
  updateStoreWithMutative((draft) => {
    const layerToDelete = draft.layers.find((layer) => layer.id === layerId)
    layerToDelete?.shapeIds.forEach((shapeId) => {
      delete draft.shapesById[shapeId]
    })
    draft.layers = draft.layers.filter((layer) => layer.id !== layerId)

    if (layerToDelete?.id === draft.selectedLayerId) {
      draft.selectedLayerId = null
    }
  })
}

export const selectLayer = (layerId: string) => {
  updateStoreWithMutative((draft) => {
    draft.selectedLayerId = layerId
  })
}

export const clearSelectedLayer = () => {
  updateStoreWithMutative((draft) => {
    draft.selectedLayerId = null
  })
  clearSelectedShapes()
}

export const setIsPanelOpen = (
  panelKey: keyof LiveryEditorState['panels'],
  isOpen: boolean,
) => {
  updateStoreWithMutative((draft) => {
    draft.panels[panelKey].isOpen = isOpen
  })
}

/**
 * Selectors
 */

export const getLayerById = (
  state: LiveryEditorState,
  id: string,
): Layer | undefined => {
  return state.layers.find((layer) => layer.id === id)
}

export const getLayerIds = (state: LiveryEditorState): Array<string> => {
  return state.layers.map((layer) => layer.id)
}

export const getShapeById = (
  state: LiveryEditorState,
  id: string,
): SupportedShapes | undefined => {
  return state.shapesById[id]
}

export const getIsShapeSelectedById = (
  state: LiveryEditorState,
  id: string,
): boolean => {
  return state.selectedShapeIds.includes(id)
}

export const getShapeProperty = <T extends PublicKeyOf<SupportedShapes>>(
  state: LiveryEditorState,
  shapeId: string,
  propKey: T,
): SupportedShapes[T] | undefined => {
  const shape = getShapeById(state, shapeId)
  return shape?.[propKey]
}

export const getIsBothPanelsOpen = (state: LiveryEditorState): boolean => {
  return state.panels.layersPanel.isOpen && state.panels.shapesPanel.isOpen
}
