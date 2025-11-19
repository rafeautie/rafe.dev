import { createRef } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CarIcon,
  CircleIcon,
  Layers2Icon,
  SlashIcon,
  SquareIcon,
} from 'lucide-react'
import type Konva from 'konva'
import type { CommandConfig, LiveryShapeAttributes } from '@/types/livery'
import { SupportedShape } from '@/types/livery'
import {
  addLayer,
  addShape,
  setCommandPalettePage,
  setIsCommandPaletteOpen,
} from '@/state/livery-store'
import { fetchFormattedCarTemplateList } from '@/functions/livery/getCarTemplateList'

export const CAR_TEMPLATE_URL =
  'https://ir-core-sites.iracing.com/members/member_images/misctemplates/all_iracing_templates.zip'

export const GRID_COLOR = '#404040'
export const GRID_DOT_RADIUS = 2
export const GRID_SPACING = 80
export const GRID_BUFFER_MULTIPLIER = 1.5
export const SCALE_BY = 1.1
export const GRID_BASE_SCALE = 0.5
export const MIN_SCALE = 0.2
export const MAX_SCALE = 4
export const PANNING_ENABLED = true
export const ZOOM_ENABLED = true
export const DRAG_DEBOUNCE_MS = 8
export const TRANSFORMER_REF = createRef<Konva.Transformer>()
export const STAGE_REF = createRef<Konva.Stage>()

export const SHAPE_ATTRIBUTE_CONFIG = {
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
  Image: [
    { key: 'width', type: 'number', step: 1, default: 100 },
    { key: 'height', type: 'number', step: 1, default: 100 },
  ],
} satisfies {
  Base: LiveryShapeAttributes<Konva.Shape>
  Rect: LiveryShapeAttributes<Konva.Rect>
  Circle: LiveryShapeAttributes<Konva.Circle>
  Line: LiveryShapeAttributes<Konva.Line>
  Image: LiveryShapeAttributes<Konva.Image>
}

export const COMMAND_CONFIG = {
  default: {
    commandGroups: [
      {
        groupName: 'Templates',
        mode: 'control-only',
        commands: [
          {
            leftIcon: CarIcon,
            rightIcon: ArrowRightIcon,
            name: 'Load Car Template',
            description: 'Load a car template to use as a base for your livery',
            execute: () => {
              setIsCommandPaletteOpen(true)
              setCommandPalettePage({
                key: 'templates',
                forceCloseOnEscape: true,
              })
            },
            closeOnExecute: false,
          },
        ],
      },
      {
        groupName: 'Shapes',
        mode: 'both',
        commands: [
          {
            leftIcon: SquareIcon,
            name: 'Add Rectangle',
            description: 'Insert a rectangle shape into the canvas',
            execute: () => addShape({ type: SupportedShape.Rect }),
          },
          {
            leftIcon: CircleIcon,
            name: 'Add Circle',
            description: 'Insert a circle shape into the canvas',
            execute: () => addShape({ type: SupportedShape.Circle }),
          },
          {
            leftIcon: SlashIcon,
            name: 'Add Line',
            description: 'Insert a circle shape into the canvas',
            execute: () => addShape({ type: SupportedShape.Line }),
          },
        ],
      },
      {
        groupName: 'Layers',
        mode: 'both',
        commands: [
          {
            leftIcon: Layers2Icon,
            name: 'Add Layer',
            description: 'Insert a new layer',
            execute: addLayer,
          },
        ],
      },
      {
        groupName: 'Templates',
        mode: 'palette-only',
        commands: [
          {
            leftIcon: CarIcon,
            rightIcon: ArrowRightIcon,
            name: 'Load Car Template',
            description: 'Load a car template to use as a base for your livery',
            execute: () => setCommandPalettePage({ key: 'templates' }),
            closeOnExecute: false,
          },
        ],
      },
    ],
  },
  templates: {
    commandGroups: [
      {
        groupName: 'Templates',
        mode: 'palette-only',
        query: fetchFormattedCarTemplateList,
        commands: [],
      },
    ],
  },
} as const satisfies CommandConfig
