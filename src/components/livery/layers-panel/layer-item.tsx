import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  Trash2Icon,
} from 'lucide-react'
import { useCallback } from 'react'
import { motion } from 'motion/react'
import { LayerShapeItem } from './layer-shape-item'
import { VisibilityToggle } from './visibility-toggle'
import type { ChangeEventHandler, MouseEventHandler } from 'react'
import { cn } from '@/lib/utils'
import {
  clearSelectedLayer,
  deleteLayer,
  getLayerById,
  selectLayer,
  updateLayer,
  useLiveryEditorStore,
} from '@/state/livery-store'
import { ButtonGroup } from '@/components/ui/button-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LayerItemProps {
  layerId: string
}

export const LayerItem = ({ layerId }: LayerItemProps) => {
  const layer = useLiveryEditorStore((state) => getLayerById(state, layerId))
  const selectedLayer = useLiveryEditorStore((state) => state.selectedLayerId)

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
        visible: !(layer?.visible ?? true),
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
        'rounded-md my-1 p-2 inset-shadow-[0_0_20px_rgba(0,0,0,0.3)] bg-neutral-900/35 overflow-hidden shrink-0',
        {
          'ring-2 ring-blue-500/50': selectedLayer === layerId,
        },
      )}
    >
      <div
        className={cn('flex justify-between items-center gap-2')}
        onClick={toggleLayerSelection}
      >
        <Input
          doubleClickToFocus
          className="p-2 dark:bg-transparent h-8 focus-visible:ring-0"
          value={layer?.name}
          onChange={onLayerNameChange}
        />
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
            {layer?.collapsed ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
          </Button>
        </ButtonGroup>
      </div>
      <motion.div
        className={cn('flex flex-col', {
          'pointer-events-none': !layer?.collapsed,
        })}
        transition={{
          duration: 0.2,
        }}
        initial={{
          opacity: layer?.collapsed ? 0 : 1,
          height: layer?.collapsed ? 0 : 'auto',
        }}
        animate={{
          opacity: layer?.collapsed ? 0 : 1,
          height: layer?.collapsed ? 0 : 'auto',
        }}
      >
        {layer?.shapeIds.map((shapeId) => (
          <LayerShapeItem key={shapeId} shapeId={shapeId} />
        ))}
      </motion.div>
    </div>
  )
}
