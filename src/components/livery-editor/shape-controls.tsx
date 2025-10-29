import { CircleIcon, SlashIcon, SquareIcon } from 'lucide-react'
import { ButtonGroup } from '../ui/button-group'
import { Button } from '../ui/button'
import { addShape } from '@/state/livery-editor-store'

const ShapeControls = () => {
  return (
    <ButtonGroup className="pointer-events-auto self-end">
      <Button
        variant="outline"
        size="icon"
        onClick={() => addShape({ type: 'Rect' })}
      >
        <SquareIcon />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => addShape({ type: 'Circle' })}
      >
        <CircleIcon />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => addShape({ type: 'Line' })}
      >
        <SlashIcon />
      </Button>
    </ButtonGroup>
  )
}

export default ShapeControls
