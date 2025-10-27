import { CircleIcon, SlashIcon, SquareIcon } from 'lucide-react'
import { ButtonGroup } from '../ui/button-group'
import { Button } from '../ui/button'
import { addShape } from '@/state/livery-editor-store'

const ShapeControls = () => {
  return (
    <ButtonGroup className="pointer-events-auto">
      <Button
        variant="outline"
        size="icon"
        onClick={() => addShape({ type: 'rect' })}
      >
        <SquareIcon />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => addShape({ type: 'circle' })}
      >
        <CircleIcon />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => addShape({ type: 'line' })}
      >
        <SlashIcon />
      </Button>
    </ButtonGroup>
  )
}

export default ShapeControls
