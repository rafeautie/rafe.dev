import { useEffect, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { STATIC_COMMAND_CONFIG } from '@/constants/livery'

export const CommandPalette = () => {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.ctrlKey) {
        e.preventDefault()
        setOpen((prevOpen) => !prevOpen)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="-translate-y-0 top-[40%]"
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {[
          STATIC_COMMAND_CONFIG.shapeCommands,
          STATIC_COMMAND_CONFIG.layerCommands,
        ].map((commandGroup, index) => (
          <CommandGroup key={index} heading={commandGroup.groupName}>
            {commandGroup.commands.map(({ icon: Icon, name, execute }) => (
              <CommandItem
                key={name}
                variant="transparent"
                onSelect={() => {
                  execute()
                  setOpen(false)
                }}
              >
                <Icon />
                {name}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
