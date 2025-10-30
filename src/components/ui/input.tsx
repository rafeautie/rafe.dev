import * as React from 'react'
import { cn } from '@/lib/utils'

type InputProps = React.ComponentProps<'input'> & {
  doubleClickToFocus?: boolean
}

function Input({
  className,
  type,
  doubleClickToFocus = false,
  onDoubleClick,
  onFocus,
  onMouseDown,
  readOnly,
  tabIndex,
  ...props
}: InputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleDoubleClick = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      if (doubleClickToFocus) {
        inputRef.current?.focus()
      }
      onDoubleClick?.(event)
    },
    [doubleClickToFocus, onDoubleClick],
  )
  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      if (doubleClickToFocus && document.activeElement !== inputRef.current) {
        event.preventDefault()
      }

      onMouseDown?.(event)
    },
    [doubleClickToFocus, onMouseDown],
  )

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      if (doubleClickToFocus && document.activeElement === inputRef.current) {
        event.preventDefault()
        event.stopPropagation()
      }

      onMouseDown?.(event)
    },
    [doubleClickToFocus, onMouseDown],
  )

  const computedTabIndex = doubleClickToFocus ? -1 : tabIndex

  return (
    <input
      ref={inputRef}
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 h-9 w-full min-w-0 rounded-md bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      tabIndex={computedTabIndex}
      {...props}
    />
  )
}

export { Input }
