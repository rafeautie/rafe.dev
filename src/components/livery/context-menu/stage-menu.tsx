import { Layers2Icon } from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { SUPPORTED_SHAPES } from '@/constants/livery'
import { addLayer, addShape, useLiveryEditorStore } from '@/state/livery-store'

export const StageMenu = () => {
  const contextMenuPosition = useLiveryEditorStore(
    (state) => state.contextMenuPosition,
  )
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>New</ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {SUPPORTED_SHAPES.map(({ type, label, icon: Icon }) => (
          <ContextMenuItem
            key={type + label}
            onClick={() => addShape({ type, ...contextMenuPosition })}
          >
            <Icon />
            {label}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={addLayer}>
          <Layers2Icon />
          Layer
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
