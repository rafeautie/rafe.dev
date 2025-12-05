import type { PathNode, Point } from './type'

function degToRad(deg: number) {
  return (deg * Math.PI) / 180
}

// Cubic Bézier math
function cubic(p0: number, p1: number, p2: number, p3: number, t: number) {
  const mt = 1 - t
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  )
}

function cubicDerivative(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
) {
  const mt = 1 - t
  return (
    3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2)
  )
}

// Arc-length approximation
function approximateArcLength(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  samples = 200,
) {
  let length = 0
  let prevX = p0.x
  let prevY = p0.y

  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const x = cubic(p0.x, p1.x, p2.x, p3.x, t)
    const y = cubic(p0.y, p1.y, p2.y, p3.y, t)
    length += Math.hypot(x - prevX, y - prevY)
    prevX = x
    prevY = y
  }

  return length
}

// Find t along Bézier for target arc-length
function findTForArcLength(
  targetDist: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  samples = 50,
) {
  let low = 0,
    high = 1

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2
    let length = 0
    let prevX = p0.x
    let prevY = p0.y

    for (let s = 1; s <= samples; s++) {
      const t = mid * (s / samples)
      const x = cubic(p0.x, p1.x, p2.x, p3.x, t)
      const y = cubic(p0.y, p1.y, p2.y, p3.y, t)
      length += Math.hypot(x - prevX, y - prevY)
      prevX = x
      prevY = y
    }

    if (length < targetDist) low = mid
    else high = mid
  }

  return (low + high) / 2
}

// Generate control points for curvature and optional start/end angles
function generateCubicControls(start: Point, end: Point, curvature: number) {
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1

  const px = -dy / len
  const py = dx / len
  const bulge = len * curvature

  const c1: Point = { x: midX + px * bulge, y: midY + py * bulge, rotate: 0 }
  const c2: Point = { x: midX - px * bulge, y: midY - py * bulge, rotate: 0 }

  const angle1 = degToRad(start.rotate)
  const dist1 = len * 0.25
  c1.x = start.x + Math.cos(angle1) * dist1
  c1.y = start.y + Math.sin(angle1) * dist1

  const angle2 = degToRad(end.rotate)
  const dist2 = len * 0.25
  c2.x = end.x - Math.cos(angle2) * dist2
  c2.y = end.y - Math.sin(angle2) * dist2

  return { c1, c2 }
}

// Quadratic ease-in-out
function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

// --------------------------
// Main function
// --------------------------
export function cubicPathKeyFrames(
  start: Point,
  end: Point,
  curvature = 0.25,
  nodes = 60,
) {
  const { c1, c2 } = generateCubicControls(start, end, curvature)

  const p0 = start
  const p1 = c1
  const p2 = c2
  const p3 = end

  const totalLength = approximateArcLength(p0, p1, p2, p3)
  const result: Array<PathNode> = []

  for (let i = 0; i <= nodes; i++) {
    // Ease alpha along 0→1
    const alpha = easeInOutQuad(i / nodes)

    // Map eased alpha to target distance along curve
    const dist = alpha * totalLength
    const t = findTForArcLength(dist, p0, p1, p2, p3)

    const x = cubic(p0.x, p1.x, p2.x, p3.x, t)
    const y = cubic(p0.y, p1.y, p2.y, p3.y, t)

    const dx = cubicDerivative(p0.x, p1.x, p2.x, p3.x, t)
    const dy = cubicDerivative(p0.y, p1.y, p2.y, p3.y, t)
    const mag = Math.hypot(dx, dy) || 1

    // Always point along tangent
    const angle = Math.atan2(dy, dx)

    result.push({ x, y, dx: dx / mag, dy: dy / mag, angle })
  }

  return {
    x: result.map((n) => n.x),
    y: result.map((n) => n.y),
    rotate: result.map((n) => (n.angle * 180) / Math.PI), // convert to degrees
    // times: result.map((_, i) => easeInOutCubic(i / (result.length - 1))),
    times: result.map((_, i) => i / (result.length - 1)), // normalized 0 → 1
  }
}

export function waitWhileVisible(seconds: number) {
  return new Promise<void>((resolve) => {
    let elapsed = 0 // in seconds
    let last: number | null = null

    function frame(now: number) {
      if (last === null) {
        last = now
      }

      const dt = (now - last) / 1000 // convert ms → seconds
      last = now

      elapsed += dt

      if (elapsed >= seconds) {
        resolve()
      } else {
        requestAnimationFrame(frame)
      }
    }

    requestAnimationFrame(frame)
  })
}
