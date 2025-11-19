import { useQuery } from '@tanstack/react-query'
import type { CommandGroup as CommandGroupType } from '@/types/livery'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { COMMAND_CONFIG } from '@/constants/livery'
import {
  getCommandPalettePage,
  setIsCommandPaletteOpen,
  useLiveryEditorStore,
} from '@/state/livery-store'

export const CommandPalettePage = () => {
  const page = useLiveryEditorStore(getCommandPalettePage)

  return COMMAND_CONFIG[page.key].commandGroups
    .filter(({ mode }) => mode !== 'control-only')
    .map((commandGroup) => (
      <CommandPalettePageGroup key={commandGroup.groupName} {...commandGroup} />
    ))
}

const CommandPalettePageGroup = ({
  groupName,
  commands,
  query,
}: CommandGroupType) => {
  const page = useLiveryEditorStore(getCommandPalettePage)
  const hasRemoteDataSource = query != null
  const { data, isLoading } = useQuery({
    queryKey: ['command-palette', groupName],
    queryFn: query ?? (() => []),
    enabled: hasRemoteDataSource,
  })
  const commandsToDisplay =
    hasRemoteDataSource && data != null ? data : commands

  return (
    <CommandGroup
      key={page + groupName}
      heading={groupName}
      loading={isLoading}
    >
      {commandsToDisplay.map(
        (
          {
            leftIcon: LeftIcon,
            rightIcon: RightIcon,
            name,
            execute,
            closeOnExecute,
          },
          index,
        ) => (
          <CommandItem
            key={page + name + index}
            variant="transparent"
            className="flex justify-between"
            onSelect={() => {
              execute()
              if (closeOnExecute !== false) {
                setIsCommandPaletteOpen(false)
              }
            }}
          >
            <div className="flex gap-3 items-center">
              <LeftIcon />
              {name}
            </div>
            {RightIcon && <RightIcon />}
          </CommandItem>
        ),
      )}
    </CommandGroup>
  )
}
