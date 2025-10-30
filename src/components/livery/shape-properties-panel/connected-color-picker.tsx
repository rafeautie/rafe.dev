import { useMemo } from 'react'
import ColorPickerTrigger from '../../ui/shadcn-io/color-picker/trigger'
import type { ShapeAttributeProps } from './shape-property-item'
import {
  getShapeProperty,
  liveryEditorStore,
  updateShape,
} from '@/state/livery-store'

export function ConnectedColorPickerTrigger<T>({
  shapeId,
  propKey,
}: ShapeAttributeProps<T>) {
  const propertyValue = useMemo(() => {
    return getShapeProperty(liveryEditorStore.state, shapeId, propKey)
  }, [shapeId, propKey])

  return (
    <ColorPickerTrigger
      key={shapeId + propKey}
      className="min-w-40 max-w-40 mr-2"
      value={propertyValue}
      onChange={(color) => {
        updateShape(shapeId, { [propKey]: color })
      }}
    />
  )
}
