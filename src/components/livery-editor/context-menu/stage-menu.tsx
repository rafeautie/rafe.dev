import { use } from 'react'
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { SUPPORTED_SHAPES } from '@/constants/livery'
import { addShape, useLiveryEditorStore } from '@/state/livery-editor-store'

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
            onClick={() => addShape({ type, ...contextMenuPosition })}
          >
            <Icon />
            {label}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
