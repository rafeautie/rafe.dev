import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { COMMAND_CONFIG } from '@/constants/livery'

export const StageMenu = () => {
  return COMMAND_CONFIG.default.commandGroups
    .filter(({ mode }) => mode !== 'palette-only')
    .map(({ groupName, commands }) => (
      <ContextMenuSub key={groupName}>
        <ContextMenuSubTrigger>{groupName}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {commands.map(({ name, execute }) => (
            <ContextMenuItem key={groupName + name} onClick={execute}>
              {name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    ))
}
