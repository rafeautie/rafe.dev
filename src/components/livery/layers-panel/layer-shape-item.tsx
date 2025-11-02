import { useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripHorizontalIcon } from 'lucide-react'
import { VisibilityToggle } from './visibility-toggle'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { ChangeEventHandler, MouseEventHandler } from 'react'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import {
  clearSelectedShapes,
  deselectShape,
  getIsShapeSelectedById,
  getLayerById,
  getShapeById,
  selectShape,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-store'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface LayerShapeItemProps {
  shapeId: string
  gripAttributes?: DraggableAttributes
  gripListeners?: SyntheticListenerMap | undefined
  setActivatorNodeRef?: (element: HTMLElement | null) => void
}

export const LayerShapeItem = ({
  shapeId,
  gripAttributes,
  gripListeners,
  setActivatorNodeRef,
}: LayerShapeItemProps) => {
  const shape = useLiveryEditorStore((state) => getShapeById(state, shapeId))
  const layer = useLiveryEditorStore((state) =>
    getLayerById(state, shape?.layerId ?? ''),
  )
  const isShapeSelected = useLiveryEditorStore((state) =>
    getIsShapeSelectedById(state, shapeId),
  )

  const onClick = useCallback<MouseEventHandler>(
    (e) => {
      if (isShapeSelected) {
        return deselectShape(shapeId)
      }

      if (!e.ctrlKey && !e.shiftKey) {
        clearSelectedShapes()
      }

      selectShape(shapeId)
    },
    [isShapeSelected, shapeId],
  )

  const toggleShapeVisibility = useCallback<MouseEventHandler>(
    (e) => {
      const visible = !(shape?.visible ?? true)
      updateShape(shapeId, { visible })
      e.stopPropagation()
    },
    [shapeId, shape?.visible],
  )

  const onShapeNameChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => updateShape(shapeId, { name: e.target.value }),
    [shapeId],
  )

  return (
    <div
      className={cn(
        'rounded-md bg-accent pr-3 py-2 flex justify-between items-center pointer-events-auto',
        {
          'ring-2 ring-blue-500': isShapeSelected,
          'pointer-events-none opacity-50': layer?.visible === false,
        },
      )}
      onClick={onClick}
    >
      <div className="flex items-center">
        <Button
          className="mx-1"
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
          className="text-xs p-0 dark:bg-transparent h-8 focus-visible:ring-0"
          value={shape?.name}
          onChange={onShapeNameChange}
        />
      </div>
      <VisibilityToggle
        visible={shape?.visible ?? true}
        onToggle={toggleShapeVisibility}
      />
    </div>
  )
}

export const SortableLayerShapeItem = (props: LayerShapeItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.shapeId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className="mb-2"
    >
      <LayerShapeItem
        {...props}
        setActivatorNodeRef={setActivatorNodeRef}
        gripAttributes={attributes}
        gripListeners={listeners}
      />
    </div>
  )
}
