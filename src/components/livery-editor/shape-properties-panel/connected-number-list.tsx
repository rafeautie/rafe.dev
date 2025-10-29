import type { ShapeAttributeProps } from './shape-property-item'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  getShapeProperty,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-editor-store'

export function ConnectedNumberList<T>({
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
    <div className="flex min-w-56 max-w-40 mr-2">
      {propertyValue.map((value, index) => (
        <Input
          {...rest}
          type="number"
          className={cn('rounded-none text-center', {
            'rounded-l-md': index === 0,
            'rounded-r-md': index === propertyValue.length - 1,
          })}
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
