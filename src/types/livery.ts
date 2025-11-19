import type Konva from 'konva'
import type { GetSet } from 'konva/lib/types'

export enum SupportedShape {
  Rect = 'Rect',
  Circle = 'Circle',
  Line = 'Line',
  Image = 'Image',
}

export type SupportedShapesConfig<T extends SupportedShape = SupportedShape> = {
  id?: string
  layerId?: string
} & (T extends SupportedShape.Rect
  ? Konva.RectConfig & { type: SupportedShape.Rect }
  : T extends SupportedShape.Circle
    ? Konva.CircleConfig & { type: SupportedShape.Circle }
    : T extends SupportedShape.Line
      ? Konva.LineConfig & { type: SupportedShape.Line }
      : T extends SupportedShape.Image
        ? Konva.ImageConfig & { type: SupportedShape.Image }
        :
            | (Konva.RectConfig & { type: SupportedShape.Rect })
            | (Konva.CircleConfig & { type: SupportedShape.Circle })
            | (Konva.LineConfig & { type: SupportedShape.Line })
            | (Konva.ImageConfig & { type: SupportedShape.Image }))

export type PublicKeyOf<T> = Extract<
  {
    [K in keyof T]: K extends `_${string}`
      ? never
      : T[K] extends GetSet<any, any>
        ? K
        : never
  }[keyof T],
  string
>

export type LiveryShapeAttributeItem<T> = { key: PublicKeyOf<T> } & (
  | {
      type: 'numberList'
      step?: number
      default?: Array<number>
      min?: number
      max?: number
    }
  | {
      type: 'pointList'
      step?: number
      default?: Array<number>
    }
  | {
      type: 'string' | 'color'
      default?: string
    }
  | {
      type: 'boolean'
      default?: boolean
    }
  | {
      type: 'number'
      min?: number
      max?: number
      step?: number
      default?: number
    }
  | {
      type: 'select'
      options: Array<string>
      default?: string
    }
)

export type LiveryShapeAttributes<T> = Array<LiveryShapeAttributeItem<T>>

export type Layer = {
  id: string
  name: string
  shapeIds: Array<string>
  collapsed: boolean
  layerType: 'paintable' | 'non-editable-template-layers'
} & Konva.LayerConfig

export type Command = {
  name: string
  leftIcon: any
  rightIcon?: any
  description: string
  execute: () => void
  closeOnExecute?: boolean
}

export type CommandGroup = {
  groupName: string
  commands: ReadonlyArray<Command>
  mode: 'palette-only' | 'control-only' | 'both'
  query?: () => Promise<ReadonlyArray<Command>>
}

export type CommandConfig = Record<
  'default' | 'templates',
  {
    commandGroups: ReadonlyArray<CommandGroup>
  }
>
