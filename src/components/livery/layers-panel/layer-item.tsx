import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  GripHorizontalIcon,
  Trash2Icon,
} from 'lucide-react'
import { useCallback } from 'react'
import { motion } from 'motion/react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SortableLayerShapeItem } from './layer-shape-item'
import { VisibilityToggle } from './visibility-toggle'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { ChangeEventHandler, MouseEventHandler } from 'react'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { cn } from '@/lib/utils'
import {
  clearSelectedLayer,
  deleteLayer,
  getLayerById,
  getShapeIds,
  selectLayer,
  updateLayer,
  useLiveryEditorStore,
} from '@/state/livery-store'
import { ButtonGroup } from '@/components/ui/button-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LayerItemProps {
  layerId: string
  gripAttributes?: DraggableAttributes
  gripListeners?: SyntheticListenerMap | undefined
  setActivatorNodeRef?: (element: HTMLElement | null) => void
}

export const LayerItem = ({
  layerId,
  gripAttributes,
  gripListeners,
  setActivatorNodeRef,
}: LayerItemProps) => {
  const layer = useLiveryEditorStore((state) => getLayerById(state, layerId))
  const shapeIds = useLiveryEditorStore((state) => getShapeIds(state, layerId))
  const selectedLayer = useLiveryEditorStore((state) => state.selectedLayerId)

  const visibility = !layer?.collapsed

  const toggleLayerSelection = useCallback<MouseEventHandler>(
    (e) => {
      if (selectedLayer === layerId) {
        clearSelectedLayer()
      } else {
        selectLayer(layerId)
      }
      e.stopPropagation()
    },
    [layerId, selectedLayer],
  )

  const toggleLayerVisibility = useCallback<MouseEventHandler>(
    (e) => {
      updateLayer(layerId, {
        visible: !(layer?.visible ?? false),
      })
      e.stopPropagation()
    },
    [layerId, layer?.visible],
  )

  const toggleLayerCollapsed = useCallback<MouseEventHandler>(
    (e) => {
      updateLayer(layerId, {
        collapsed: !(layer?.collapsed ?? false),
      })
      e.stopPropagation()
    },
    [layerId, layer?.collapsed],
  )

  const onDeleteLayer = useCallback<MouseEventHandler>(
    () => deleteLayer(layerId),
    [layerId],
  )

  const onLayerNameChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => updateLayer(layerId, { name: e.target.value }),
    [layerId],
  )

  return (
    <div
      className={cn(
        'rounded-md px-2 pt-2 inset-shadow-[0_0_20px_rgba(0,0,0,0.3)] bg-neutral-900/35 overflow-hidden shrink-0',
        {
          'ring-2 ring-blue-500/50': selectedLayer === layerId,
        },
      )}
    >
      <div
        className={cn('flex justify-between items-center gap-2 pb-2')}
        onClick={toggleLayerSelection}
      >
        <div className="flex items-center">
          <Button
            size="icon-sm"
            variant="ghost"
            ref={setActivatorNodeRef}
            {...gripAttributes}
            {...gripListeners}
          >
            <GripHorizontalIcon className="text-neutral-400" />
          </Button>
          <Input
            doubleClickToFocus
            className="p-2 dark:bg-transparent h-8 focus-visible:ring-0"
            value={layer?.name}
            onChange={onLayerNameChange}
          />
        </div>
        <ButtonGroup className="pointer-events-auto self-end">
          <Button
            className="dark:hover:bg-red-600/40"
            variant="ghost"
            size="icon-sm"
            onClick={onDeleteLayer}
          >
            <Trash2Icon />
          </Button>
          <VisibilityToggle
            onToggle={toggleLayerVisibility}
            visible={layer?.visible ?? true}
          />
          <Button variant="ghost" size="icon-sm" onClick={toggleLayerCollapsed}>
            {layer?.collapsed ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
          </Button>
        </ButtonGroup>
      </div>
      <SortableContext
        id="shapes"
        items={layer?.shapeIds ?? []}
        strategy={verticalListSortingStrategy}
      >
        <motion.div
          className={cn('flex flex-col', {
            'pointer-events-none': !visibility,
          })}
          transition={{
            duration: 0.2,
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
          {shapeIds.map((shapeId) => (
            <SortableLayerShapeItem key={shapeId} shapeId={shapeId} />
          ))}
        </motion.div>
      </SortableContext>
    </div>
  )
}

export const SortableLayerItem = (props: LayerItemProps) => {
  const layer = useLiveryEditorStore((state) =>
    getLayerById(state, props.layerId),
  )

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.layerId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }

  if (layer?.layerType === 'non-editable-template-layers') {
    return null
  }

  return (
    <div ref={setNodeRef} style={style}>
      <LayerItem
        {...props}
        setActivatorNodeRef={setActivatorNodeRef}
        gripAttributes={attributes}
        gripListeners={listeners}
      />
    </div>
  )
}
