import type Konva from 'konva'
import type { GetSet } from 'konva/lib/types'

export type SupportedShapes = { id?: string; layerId?: string } & (
  | (Konva.RectConfig & { type: 'Rect' })
  | (Konva.CircleConfig & { type: 'Circle' })
  | (Konva.LineConfig & { type: 'Line' })
)

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
} & Konva.LayerConfig
