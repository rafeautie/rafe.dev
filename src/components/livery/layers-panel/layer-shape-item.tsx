import { useCallback } from 'react'
import { VisibilityToggle } from './visibility-toggle'
import type { ChangeEventHandler, MouseEventHandler } from 'react'
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

interface LayerShapeItemProps {
  shapeId: string
}

export const LayerShapeItem = ({ shapeId }: LayerShapeItemProps) => {
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
        'rounded-md bg-accent px-3 py-2 flex justify-between items-center pointer-events-auto mt-2',
        {
          'ring-2 ring-blue-500': isShapeSelected,
          'pointer-events-none opacity-50': layer?.visible === false,
        },
      )}
      onClick={onClick}
    >
      <Input
        doubleClickToFocus
        className="text-xs p-0 dark:bg-transparent h-8 focus-visible:ring-0"
        value={shape?.name}
        onChange={onShapeNameChange}
      />
      <VisibilityToggle
        visible={shape?.visible ?? true}
        onToggle={toggleShapeVisibility}
      />
    </div>
  )
}
