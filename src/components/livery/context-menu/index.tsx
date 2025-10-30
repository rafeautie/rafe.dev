import { StageMenu } from './stage-menu'
import { ShapeMenu } from './shape-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface Props {
  children: React.ReactNode
}

export const EditorContextMenu = ({ children }: Props) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <StageMenu />
        <ShapeMenu />
      </ContextMenuContent>
    </ContextMenu>
  )
}
