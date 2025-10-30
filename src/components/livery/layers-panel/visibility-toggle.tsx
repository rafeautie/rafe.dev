import { EyeIcon, EyeOffIcon } from 'lucide-react'
import type { MouseEventHandler } from 'react'
import { Button } from '@/components/ui/button'

interface VisibilityToggleProps {
  visible: boolean
  onToggle: MouseEventHandler<HTMLButtonElement>
}

export const VisibilityToggle = ({
  visible,
  onToggle,
}: VisibilityToggleProps) => {
  return (
    <Button size="icon-sm" variant="ghost" onClick={onToggle}>
      {visible ? <EyeIcon /> : <EyeOffIcon className="opacity-50" />}
    </Button>
  )
}
