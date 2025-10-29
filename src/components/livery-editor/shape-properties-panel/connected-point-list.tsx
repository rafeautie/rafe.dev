import type { ShapeAttributeProps } from './shape-property-item'
import { Input } from '@/components/ui/input'
import {
  getShapeProperty,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-editor-store'

export function ConnectedPointList<T>({
  shapeId,
  propKey,
  type,
  default: defaultValue,
  ...rest
}: Extract<ShapeAttributeProps<T>, { type: 'numberList' }>) {
  const propertyValue = useLiveryEditorStore((state) => {
    return getShapeProperty(state, shapeId, propKey) as Array<number>
  })

  return (
    <div className="grid grid-cols-2 gap-2 min-w-40 max-w-40 mr-2">
      <p className="text-center">X</p>
      <p className="text-center">Y</p>
      {propertyValue.map((value, index) => (
        <Input
          {...rest}
          type="number"
          className="text-center"
          id={propKey}
          key={shapeId + propKey}
          value={value}
          onChange={(e) => {
            const newValue = e.target.valueAsNumber
            const newList = [...propertyValue]
            newList[index] = isNaN(newValue) ? 0 : newValue

            updateShape(shapeId, {
              [propKey]: newList,
            })
          }}
        />
      ))}
    </div>
  )
}
