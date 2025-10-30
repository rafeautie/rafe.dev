import { Label } from 'react-konva'
import { ConnectedColorPickerTrigger } from './connected-color-picker'
import { ConnectedInput } from './connected-input'
import { ConnectedSelect } from './connected-select'
import { ConnectedCheckbox } from './connected-checkbox'
import { ConnectedNumberList } from './connected-number-list'
import { ConnectedPointList } from './connected-point-list'
import type React from 'react'
import type { LiveryShapeAttributeItem, SupportedShapes } from '@/types/livery'
import { camelToTitle } from '@/lib/utils'

export type ShapeAttributeProps<T> = LiveryShapeAttributeItem<T> & {
  shapeId: string
  propKey: LiveryShapeAttributeItem<T>['key']
}

const ShapePropertyComponentMap: Record<
  ShapeAttributeProps<any>['type'],
  React.ComponentType<any>
> = {
  color: ConnectedColorPickerTrigger,
  select: ConnectedSelect,
  string: ConnectedInput,
  number: ConnectedInput,
  numberList: ConnectedNumberList,
  pointList: ConnectedPointList,
  boolean: ConnectedCheckbox,
}

export function ShapePropertyItem<T = SupportedShapes>(
  props: ShapeAttributeProps<T>,
) {
  const Component = ShapePropertyComponentMap[props.type]

  return (
    <div className="flex justify-between items-center gap-4 py-1">
      <Label className="text-xs text-muted-foreground" htmlFor={props.propKey}>
        {camelToTitle(props.propKey)}
      </Label>
      <Component {...props} key={props.shapeId + props.propKey} />
    </div>
  )
}
