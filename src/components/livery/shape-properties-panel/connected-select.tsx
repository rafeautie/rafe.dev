import type { ShapeAttributeProps } from './shape-property-item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatShapeAttribute } from '@/lib/livery'
import { capitalize } from '@/lib/utils'
import {
  getShapeProperty,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-store'

export function ConnectedSelect<T>({
  shapeId,
  propKey,
  type,
  options,
  default: defaultValue,
}: Extract<ShapeAttributeProps<T>, { type: 'select' }>) {
  const propertyValue = useLiveryEditorStore((state) => {
    return getShapeProperty(state, shapeId, propKey)
  })

  return (
    <Select
      key={shapeId + propKey}
      value={propertyValue}
      onValueChange={(e) => {
        updateShape(shapeId, {
          [propKey]: formatShapeAttribute(type, e),
        })
      }}
    >
      <SelectTrigger className="min-w-40 max-w-40 mr-2">
        <SelectValue placeholder={defaultValue ?? options[0]} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {capitalize(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
