import { ChevronDownIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { LayerItem, SortableLayerItem } from './layer-item'
import { LayerShapeItem } from './layer-shape-item'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  getActiveDragLayerId,
  getActiveDragLayerShapeId,
  getLayerIds,
  setActiveDragLayerId,
  setActiveDragLayerShapeId,
  setIsPanelOpen,
  updateLayerOrder,
  updateShapeOrder,
  useLiveryEditorStore,
} from '@/state/livery-store'
import { cn } from '@/lib/utils'
import { verticalSortableListCollisionDetection } from '@/lib/drag-and-drop'

export const LayersPanel = () => {
  const isOpen = useLiveryEditorStore(
    (state) => state.panels.layersPanel.isOpen,
  )
  const layerIds = useLiveryEditorStore(getLayerIds)
  const activeDragLayerId = useLiveryEditorStore(getActiveDragLayerId)
  const activeDragLayerShapeId = useLiveryEditorStore(getActiveDragLayerShapeId)

  const hasLayers = layerIds.length > 0
  const visibility = isOpen && hasLayers

  const onVisibleTriggerClick = useCallback(() => {
    if (hasLayers) {
      setIsPanelOpen('layersPanel', !isOpen)
    }
  }, [hasLayers, isOpen])

  const sensors = useSensors(useSensor(PointerSensor))

  const onDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event

    switch (active.data.current?.sortable.containerId) {
      case 'layers':
        setActiveDragLayerId(active.id as string)
        break
      case 'shapes':
        setActiveDragLayerShapeId(active.id as string)
        break
    }
  }, [])

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      switch (active.data.current?.sortable.containerId) {
        case 'layers':
          updateLayerOrder(active.id as string, over?.id as string)
          break
        case 'shapes':
          updateShapeOrder(active.id as string, over?.id as string)
          break
      }
    }

    setActiveDragLayerId(null)
    setActiveDragLayerShapeId(null)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={
        activeDragLayerShapeId
          ? closestCenter
          : verticalSortableListCollisionDetection
      }
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <Card
        variant="translucent"
        className={cn(
          'pointer-events-auto w-96 min-h-[106px] max-h-[calc(var(--canvas-area-height-with-padding))]',
        )}
        onContextMenu={(e) => {
          e.preventDefault()
        }}
      >
        <CardHeader className="cursor-pointer" onClick={onVisibleTriggerClick}>
          <div className="flex items-center justify-between">
            <CardTitle>Layers</CardTitle>
            <motion.div
              transition={{ duration: 0.3 }}
              initial={{
                rotate: visibility ? 0 : 90,
                opacity: hasLayers ? 1 : 0.5,
              }}
              animate={{
                rotate: visibility ? 0 : 90,
                opacity: hasLayers ? 1 : 0.5,
              }}
            >
              <ChevronDownIcon />
            </motion.div>
          </div>
        </CardHeader>
        <CardContent className="pl-6 pr-5 overflow-y-scroll pointer-events-auto">
          <SortableContext
            id="layers"
            items={layerIds}
            strategy={verticalListSortingStrategy}
          >
            <motion.div
              className={cn('flex flex-col', {
                'pointer-events-none': !visibility,
              })}
              transition={{
                duration: 0.3,
              }}
              initial={{
                opacity: visibility ? 1 : 0,
                height: visibility ? 'auto' : 0,
              }}
              animate={{
                opacity: visibility ? 1 : 0,
                height: visibility ? 'auto' : 0,
              }}
            >
              {layerIds.map((layerId) => (
                <SortableLayerItem layerId={layerId} key={layerId} />
              ))}
            </motion.div>
          </SortableContext>

          <motion.div
            transition={{ duration: 0.2 }}
            className="absolute bottom-6 text-sm text-muted-foreground"
            initial={{
              opacity: !visibility ? 1 : 0,
              height: !visibility ? 'auto' : 0,
            }}
            animate={{
              opacity: !visibility ? 1 : 0,
              height: !visibility ? 'auto' : 0,
            }}
          >
            <div>Manage existing layers.</div>
          </motion.div>
        </CardContent>
      </Card>
      <DragOverlay>
        {activeDragLayerId && <LayerItem layerId={activeDragLayerId} />}
        {activeDragLayerShapeId && (
          <LayerShapeItem shapeId={activeDragLayerShapeId} />
        )}
      </DragOverlay>
    </DndContext>
  )
}
