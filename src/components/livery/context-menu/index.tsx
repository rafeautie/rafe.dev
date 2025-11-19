import { useCallback } from 'react'
import { StageMenu } from './stage-menu'
import { ShapeMenu } from './shape-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { setContextMenuPosition } from '@/state/livery-store'

interface Props {
  children: React.ReactNode
}

export const EditorContextMenu = ({ children }: Props) => {
  const onClose = useCallback((open: boolean) => {
    if (!open) {
      setContextMenuPosition(null)
    }
  }, [])

  return (
    <ContextMenu onOpenChange={onClose}>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <StageMenu />
        <ShapeMenu />
      </ContextMenuContent>
    </ContextMenu>
  )
}
