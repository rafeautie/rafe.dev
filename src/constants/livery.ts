import { createRef } from 'react'
import type Konva from 'konva'
import type { LiveryShapeAttributes } from '@/types/livery'

export const GRID_COLOR = '#404040'
export const GRID_DOT_RADIUS = 1
export const GRID_SPACING = 40
export const GRID_BUFFER_MULTIPLIER = 1.5
export const SCALE_BY = 1.1
export const GRID_BASE_SCALE = 1
export const MIN_SCALE = 0.4
export const MAX_SCALE = 4
export const PANNING_ENABLED = true
export const ZOOM_ENABLED = true
export const DRAG_DEBOUNCE_MS = 8
export const TRANSFORMER_REF = createRef<Konva.Transformer>()
export const STAGE_REF = createRef<Konva.Stage>()

export const SHAPE_ATTRIBUTE_CONFIG: {
  Base: LiveryShapeAttributes<Konva.Shape>
  Rect: LiveryShapeAttributes<Konva.Rect>
  Circle: LiveryShapeAttributes<Konva.Circle>
  Line: LiveryShapeAttributes<Konva.Line>
} = {
  Base: [
    { key: 'x', type: 'number', step: 1, default: 100 },
    { key: 'y', type: 'number', step: 1, default: 100 },
    { key: 'stroke', type: 'color', default: '#FFFFFFFF' },
    { key: 'strokeWidth', type: 'number', step: 1, default: 0 },
    { key: 'strokeEnabled', type: 'boolean', default: false },
    { key: 'opacity', type: 'number', step: 0.01, default: 1, min: 0, max: 1 },
    { key: 'scaleX', type: 'number', step: 1, default: 1 },
    { key: 'scaleY', type: 'number', step: 1, default: 1 },
    { key: 'skewX', type: 'number', step: 1, default: 0 },
    { key: 'skewY', type: 'number', step: 1, default: 0 },
    { key: 'rotation', type: 'number', step: 1, default: 0 },
    { key: 'shadowColor', type: 'color', default: '#FFFFFFFF' },
    { key: 'shadowBlur', type: 'number', step: 1, default: 0 },
    { key: 'shadowOffsetX', type: 'number', step: 1, default: 0 },
    { key: 'shadowOffsetY', type: 'number', step: 1, default: 0 },
    {
      key: 'shadowOpacity',
      type: 'number',
      step: 0.01,
      default: 1,
      min: 0,
      max: 1,
    },
  ],
  Rect: [
    { key: 'name', type: 'string' },
    {
      key: 'cornerRadius',
      type: 'numberList',
      step: 1,
      default: [0, 0, 0, 0],
      min: 0,
    },
    { key: 'width', type: 'number', step: 1, default: 100 },
    { key: 'height', type: 'number', step: 1, default: 100 },
    { key: 'fill', type: 'color', default: '#FFFFFFFF' },
  ],
  Circle: [
    { key: 'name', type: 'string' },
    { key: 'radius', type: 'number', step: 1, default: 50 },
    { key: 'fill', type: 'color', default: '#FFFFFFFF' },
  ],
  Line: [
    { key: 'name', type: 'string' },
    { key: 'stroke', type: 'color', default: '#FFFFFFFF' },
    { key: 'strokeWidth', type: 'number', step: 1, default: 4 },
    { key: 'strokeEnabled', type: 'boolean', default: true },
    { key: 'points', type: 'pointList', default: [0, 0, 100, 100, 150, 150] },
    {
      key: 'lineCap',
      type: 'select',
      options: ['butt', 'round', 'square'],
      default: 'round',
    },
    {
      key: 'lineJoin',
      type: 'select',
      options: ['bevel', 'round', 'miter'],
      default: 'round',
    },
    {
      key: 'tension',
      type: 'number',
      step: 0.01,
      default: 0,
      min: 0,
      max: 1,
    },
  ],
}
