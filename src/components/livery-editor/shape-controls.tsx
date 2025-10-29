import { ButtonGroup } from '../ui/button-group'
import { Button } from '../ui/button'
import { addShape } from '@/state/livery-editor-store'
import { SUPPORTED_SHAPES } from '@/constants/livery'

const ShapeControls = () => {
  return (
    <ButtonGroup className="pointer-events-auto self-end">
      {SUPPORTED_SHAPES.map(({ type, icon: Icon }) => (
        <Button
          variant="outline"
          size="icon"
          onClick={() => addShape({ type })}
        >
          <Icon />
        </Button>
      ))}
    </ButtonGroup>
  )
}

export default ShapeControls
