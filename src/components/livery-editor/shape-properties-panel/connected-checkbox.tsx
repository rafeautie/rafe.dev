import type { ShapeAttributeProps } from './shape-property-item'
import { Checkbox } from '@/components/ui/checkbox'
import { formatShapeAttribute } from '@/lib/livery'
import {
  getShapeProperty,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-editor-store'

export function ConnectedCheckbox<T>({
  shapeId,
  propKey,
  type,
  ...rest
}: ShapeAttributeProps<T>) {
  const propertyValue = useLiveryEditorStore((state) => {
    return getShapeProperty(state, shapeId, propKey)
  })

  return (
    <Checkbox
      {...rest}
      className="mr-21"
      id={propKey}
      key={shapeId + propKey}
      value={propertyValue}
      onCheckedChange={(e) => {
        if (e === 'indeterminate') {
          return
        }

        updateShape(shapeId, {
          [propKey]: formatShapeAttribute(type, e),
        })
      }}
    />
  )
}
