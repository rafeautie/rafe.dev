import { createRef } from 'react'
import type Konva from 'konva'

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
export const GRID_REF = createRef<Konva.Layer>()
