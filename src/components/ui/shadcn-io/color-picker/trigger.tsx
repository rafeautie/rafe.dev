import Color from 'color'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '../../popover'
import { Button } from '../../button'
import {
  ColorPicker,
  ColorPickerAlpha,
  ColorPickerEyeDropper,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerSelection,
} from '.'
import type { ColorLike } from 'color'
import { cn, throttle } from '@/lib/utils'

interface ColorPickerTriggerProps {
  value: string | undefined
  onChange: (value: ColorLike) => void
  className?: string
}

const ColorPickerTrigger = ({
  value,
  onChange,
  className,
}: ColorPickerTriggerProps) => {
  const [triggerColor, setTriggerColor] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleColorChange = useCallback(
    throttle((color: ColorLike) => {
      console.log('Color changed to:', color)
      const parsedColor = Color(color)
      const hexa = parsedColor.hexa()
      onChange(hexa)
      setTriggerColor(hexa)
    }, 44),
    [onChange],
  )

  const isDark = useMemo(
    () => Color(triggerColor ?? value).isDark(),
    [triggerColor, value],
  )

  useEffect(() => {
    if (triggerColor == null && value != null) {
      setTriggerColor(value)
    }
  }, [triggerColor, value])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(className)}
          style={{ backgroundColor: triggerColor ?? 'transparent' }}
        >
          <p
            style={{
              color: isDark ? 'white' : 'black',
            }}
          >
            Pick Color
          </p>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-0"
        side="left"
        collisionPadding={40}
      >
        <ColorPicker
          defaultValue={value}
          onChange={handleColorChange}
          className="rounded-md border p-4 shadow-sm"
        >
          <ColorPickerSelection className="h-56" />
          <div className="flex items-center gap-4">
            <ColorPickerEyeDropper />
            <div className="grid w-full gap-1">
              <ColorPickerHue />
              <ColorPickerAlpha />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ColorPickerFormat />
          </div>
        </ColorPicker>
      </PopoverContent>
    </Popover>
  )
}

export default ColorPickerTrigger
