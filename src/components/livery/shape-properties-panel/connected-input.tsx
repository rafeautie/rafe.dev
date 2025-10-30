import type { ShapeAttributeProps } from './shape-property-item'
import { Input } from '@/components/ui/input'
import { formatShapeAttribute } from '@/lib/livery'
import {
  getShapeProperty,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-store'

export function ConnectedInput<T>({
  shapeId,
  propKey,
  type,
  ...rest
}: ShapeAttributeProps<T>) {
  const propertyValue = useLiveryEditorStore((state) => {
    return getShapeProperty(state, shapeId, propKey)
  })

  return (
    <Input
      {...rest}
      className="min-w-40 max-w-40 mr-2"
      id={propKey}
      type={type}
      key={shapeId + propKey}
      value={propertyValue}
      onChange={(e) => {
        updateShape(shapeId, {
          [propKey]: formatShapeAttribute(type, e.target.value),
        })
      }}
    />
  )
}
