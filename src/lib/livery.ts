import type { LiveryShapeAttributeItem } from '@/types/livery'
import { SHAPE_ATTRIBUTE_CONFIG } from '@/constants/livery'

export const getDefaultAttributesForShape = (
  type: keyof typeof SHAPE_ATTRIBUTE_CONFIG,
) => {
  return [
    ...SHAPE_ATTRIBUTE_CONFIG.Base,
    ...SHAPE_ATTRIBUTE_CONFIG[type],
  ].reduce(
    (acc, attr) => {
      if (attr.default !== undefined) {
        acc[attr.key] = attr.default
      }
      return acc
    },
    {} as Record<string, any>,
  )
}

export const formatShapeAttribute = (
  type: LiveryShapeAttributeItem<any>['type'],
  value: string | boolean,
) => {
  switch (type) {
    case 'number':
      return Number(value)
    case 'boolean':
      return Number(value)
    default:
      return value
  }
}
