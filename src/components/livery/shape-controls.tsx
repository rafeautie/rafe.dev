import { Layers2Icon } from 'lucide-react'
import { ButtonGroup } from '../ui/button-group'
import { Button } from '../ui/button'
import { SidebarTrigger } from '../ui/sidebar'
import { addLayer, addShape } from '@/state/livery-store'
import { SUPPORTED_SHAPES } from '@/constants/livery'
import { cn } from '@/lib/utils'

const ShapeControls = () => {
  return (
    <div
      className="flex gap-5 pointer-events-auto"
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      <SidebarTrigger variant="outline" size="icon" />
      <ButtonGroup
        orientation="horizontal"
        className={cn('pointer-events-auto')}
      >
        {SUPPORTED_SHAPES.map(({ type, icon: Icon }) => (
          <Button
            key={type}
            variant="outline"
            size="icon"
            onClick={() => addShape({ type })}
          >
            <Icon />
          </Button>
        ))}
      </ButtonGroup>
      <Button variant="outline" size="icon" onClick={() => addLayer()}>
        <Layers2Icon />
      </Button>
    </div>
  )
}

export default ShapeControls
