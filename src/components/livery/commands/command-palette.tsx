import { useCallback, useEffect } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { CommandPalettePage } from './command-palette-page'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@/components/ui/command'
import {
  getCommandPaletteSearchTerm,
  getIsCommandPaletteOpen,
  goBackCommandPalettePage,
  liveryEditorStore,
  setCommandPaletteSearchTerm,
  setIsCommandPaletteOpen,
  useLiveryEditorStore,
} from '@/state/livery-store'

export const CommandPalette = () => {
  const isOpen = useLiveryEditorStore(getIsCommandPaletteOpen)
  const searchTerm = useLiveryEditorStore(getCommandPaletteSearchTerm)
  const isAnyQueryFetching = useIsFetching({ queryKey: ['command-palette'] })

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const { pages, isOpen: _isOpen } = liveryEditorStore.state.commandPalette

      switch (e.key) {
        case 'Escape':
          e.preventDefault()

          if (pages.at(-1)?.forceCloseOnEscape === true) {
            setIsCommandPaletteOpen(false)
            return
          }

          if (_isOpen) {
            goBackCommandPalettePage()
          }
          break
        case ' ':
          e.preventDefault()

          if (e.ctrlKey) {
            setIsCommandPaletteOpen(!_isOpen)
          }

          break
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const onInteractOutside = useCallback(() => {
    setIsCommandPaletteOpen(false)
  }, [])

  return (
    <CommandDialog
      open={isOpen}
      onInteractOutside={onInteractOutside}
      className="-translate-y-0 top-[40%]"
    >
      <CommandInput
        value={searchTerm}
        onValueChange={setCommandPaletteSearchTerm}
        placeholder="Type a command or search..."
      />
      <CommandList>
        {!isAnyQueryFetching && <CommandEmpty>No results found.</CommandEmpty>}
        <CommandPalettePage />
      </CommandList>
    </CommandDialog>
  )
}
