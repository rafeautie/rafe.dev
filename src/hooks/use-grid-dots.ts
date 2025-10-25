import { useMemo, useRef } from 'react'

import { GRID_BUFFER_MULTIPLIER, GRID_SPACING } from '../constants/canvas'
import type { CanvasTransform } from './use-canvas-transform'

export type GridDot = {
  x: number
  y: number
}

export type UseGridDotsArgs = {
  width: number
  height: number
  transform: CanvasTransform
  spacing?: number
  bufferMultiplier?: number
}

const roundToGridIndex = (value: number, spacing: number) =>
  Math.floor(value / spacing)

type GridRange = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type GridCache = {
  spacing: number
  range: GridRange
  columns: number
  dots: Array<GridDot>
}

const EMPTY_DOTS: Array<GridDot> = []

const getColumnCount = ({ maxX, minX }: GridRange) => maxX - minX + 1

const rangesEqual = (a: GridRange, b: GridRange) =>
  a.minX === b.minX &&
  a.maxX === b.maxX &&
  a.minY === b.minY &&
  a.maxY === b.maxY

const rangesOverlap = (a: GridRange, b: GridRange) =>
  a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY

const buildRange = (
  width: number,
  height: number,
  transform: CanvasTransform,
  spacing: number,
  bufferMultiplier: number,
): GridRange => {
  const { scale, position } = transform
  const inverseScale = 1 / scale

  const viewLeft = -position.x * inverseScale
  const viewTop = -position.y * inverseScale
  const viewRight = viewLeft + width * inverseScale
  const viewBottom = viewTop + height * inverseScale

  const buffer = spacing * bufferMultiplier

  return {
    minX: roundToGridIndex(viewLeft - buffer, spacing),
    maxX: Math.ceil((viewRight + buffer) / spacing),
    minY: roundToGridIndex(viewTop - buffer, spacing),
    maxY: Math.ceil((viewBottom + buffer) / spacing),
  }
}

const fillRange = (
  target: Array<GridDot>,
  range: GridRange,
  spacing: number,
) => {
  target.length = 0

  for (let gridY = range.minY; gridY <= range.maxY; gridY += 1) {
    const y = gridY * spacing
    for (let gridX = range.minX; gridX <= range.maxX; gridX += 1) {
      target.push({ x: gridX * spacing, y })
    }
  }

  return target
}

const createRow = (
  gridY: number,
  minX: number,
  maxX: number,
  spacing: number,
): Array<GridDot> => {
  const y = gridY * spacing
  const row: Array<GridDot> = []

  for (let gridX = minX; gridX <= maxX; gridX += 1) {
    row.push({ x: gridX * spacing, y })
  }

  return row
}

const replaceCache = (
  cache: GridCache,
  nextRange: GridRange,
  spacing: number,
) => {
  fillRange(cache.dots, nextRange, spacing)
  cache.range = nextRange
  cache.columns = getColumnCount(nextRange)
  cache.spacing = spacing

  return cache.dots
}

const updateCacheWithOverlap = (
  cache: GridCache,
  nextRange: GridRange,
  spacing: number,
) => {
  const previousRange = cache.range
  const previousColumns = cache.columns
  const dots = cache.dots

  const rows: Array<Array<GridDot>> = []
  if (previousColumns > 0) {
    for (let start = 0; start < dots.length; start += previousColumns) {
      rows.push(dots.slice(start, start + previousColumns))
    }
  }

  if (rows.length === 0) {
    return replaceCache(cache, nextRange, spacing)
  }

  const removeLeftCount = Math.max(0, nextRange.minX - previousRange.minX)
  const addLeft = Math.max(0, previousRange.minX - nextRange.minX)
  const removeRightCount = Math.max(0, previousRange.maxX - nextRange.maxX)
  const addRight = Math.max(0, nextRange.maxX - previousRange.maxX)

  if (removeLeftCount > 0) {
    for (const row of rows) {
      row.splice(0, removeLeftCount)
    }
  }

  if (removeRightCount > 0) {
    for (const row of rows) {
      row.splice(row.length - removeRightCount, removeRightCount)
    }
  }

  if (addLeft > 0) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      const gridY = previousRange.minY + rowIndex
      const y = gridY * spacing
      const newDots: Array<GridDot> = []
      for (let gridX = nextRange.minX; gridX < previousRange.minX; gridX += 1) {
        newDots.push({ x: gridX * spacing, y })
      }
      row.unshift(...newDots)
    }
  }

  if (addRight > 0) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      const gridY = previousRange.minY + rowIndex
      const y = gridY * spacing
      for (
        let gridX = previousRange.maxX + 1;
        gridX <= nextRange.maxX;
        gridX += 1
      ) {
        row.push({ x: gridX * spacing, y })
      }
    }
  }

  if (nextRange.minY > previousRange.minY) {
    const removeCount = Math.min(
      rows.length,
      nextRange.minY - previousRange.minY,
    )
    rows.splice(0, removeCount)
  }

  if (nextRange.maxY < previousRange.maxY) {
    const removeCount = Math.min(
      rows.length,
      previousRange.maxY - nextRange.maxY,
    )
    rows.splice(rows.length - removeCount, removeCount)
  }

  if (nextRange.minY < previousRange.minY) {
    for (
      let gridY = previousRange.minY - 1;
      gridY >= nextRange.minY;
      gridY -= 1
    ) {
      rows.unshift(createRow(gridY, nextRange.minX, nextRange.maxX, spacing))
    }
  }

  if (nextRange.maxY > previousRange.maxY) {
    for (
      let gridY = previousRange.maxY + 1;
      gridY <= nextRange.maxY;
      gridY += 1
    ) {
      rows.push(createRow(gridY, nextRange.minX, nextRange.maxX, spacing))
    }
  }

  dots.length = 0
  for (const row of rows) {
    for (const dot of row) {
      dots.push(dot)
    }
  }

  cache.range = nextRange
  cache.columns = getColumnCount(nextRange)
  cache.spacing = spacing

  return dots
}

export const useGridDots = ({
  width,
  height,
  transform,
  spacing = GRID_SPACING,
  bufferMultiplier = GRID_BUFFER_MULTIPLIER,
}: UseGridDotsArgs) => {
  const cacheRef = useRef<GridCache | null>(null)

  return useMemo(() => {
    if (width === 0 || height === 0) {
      cacheRef.current = null
      return EMPTY_DOTS
    }

    const nextRange = buildRange(
      width,
      height,
      transform,
      spacing,
      bufferMultiplier,
    )
    const cached = cacheRef.current

    if (!cached || cached.spacing !== spacing) {
      const dots = fillRange([], nextRange, spacing)
      cacheRef.current = {
        spacing,
        range: nextRange,
        columns: getColumnCount(nextRange),
        dots,
      }
      return dots
    }

    if (rangesEqual(cached.range, nextRange)) {
      return cached.dots
    }

    if (!rangesOverlap(cached.range, nextRange)) {
      return replaceCache(cached, nextRange, spacing)
    }

    return updateCacheWithOverlap(cached, nextRange, spacing)
  }, [bufferMultiplier, height, spacing, transform, width])
}
