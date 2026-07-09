import { KleKey } from './types'

export const KEY_UNIT_MM = 19.05

export type Point = { x: number; y: number }

const DEGREES_TO_RADIANS = Math.PI / 180

export const roundCoordinate = (value: number) => Number(value.toFixed(6))

export const rotatePoint = (point: Point, origin: Point, angleDeg: number) => {
    const radians = angleDeg * DEGREES_TO_RADIANS
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const deltaX = point.x - origin.x
    const deltaY = point.y - origin.y
    return {
        x: roundCoordinate(origin.x + deltaX * cos - deltaY * sin),
        y: roundCoordinate(origin.y + deltaX * sin + deltaY * cos),
    }
}

type AxisAlignedRect = { left: number; top: number; right: number; bottom: number }

type OutlineEdge = { start: Point; end: Point }

const pointKey = (point: Point) => `${point.x},${point.y}`

const uniqueSorted = (values: number[]) => Array.from(new Set(values)).sort((left, right) => left - right)

const isInsideRect = (x: number, y: number, rect: AxisAlignedRect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

const simplifyColinear = (points: Point[]) => {
    if (points.length < 3) return points
    const result: Point[] = []
    for (let index = 0; index < points.length; index++) {
        const previous = points[(index - 1 + points.length) % points.length]
        const current = points[index]
        const next = points[(index + 1) % points.length]
        const cross = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x)
        if (cross !== 0) result.push(current)
    }
    return result
}

const unionRectilinearOutline = (a: AxisAlignedRect, b: AxisAlignedRect) => {
    const xs = uniqueSorted([a.left, a.right, b.left, b.right])
    const ys = uniqueSorted([a.top, a.bottom, b.top, b.bottom])
    const columnCount = xs.length - 1
    const rowCount = ys.length - 1

    const isFilled = (column: number, rowLine: number) => {
        if (column < 0 || column >= columnCount || rowLine < 0 || rowLine >= rowCount) return false
        const centerX = (xs[column] + xs[column + 1]) / 2
        const centerY = (ys[rowLine] + ys[rowLine + 1]) / 2
        return isInsideRect(centerX, centerY, a) || isInsideRect(centerX, centerY, b)
    }

    const edges: OutlineEdge[] = []
    for (let column = 0; column < columnCount; column++) {
        for (let rowLine = 0; rowLine < rowCount; rowLine++) {
            if (!isFilled(column, rowLine)) continue
            const left = xs[column]
            const right = xs[column + 1]
            const top = ys[rowLine]
            const bottom = ys[rowLine + 1]
            const topLeft = { x: left, y: top }
            const topRight = { x: right, y: top }
            const bottomRight = { x: right, y: bottom }
            const bottomLeft = { x: left, y: bottom }
            if (!isFilled(column, rowLine - 1)) edges.push({ start: topLeft, end: topRight })
            if (!isFilled(column + 1, rowLine)) edges.push({ start: topRight, end: bottomRight })
            if (!isFilled(column, rowLine + 1)) edges.push({ start: bottomRight, end: bottomLeft })
            if (!isFilled(column - 1, rowLine)) edges.push({ start: bottomLeft, end: topLeft })
        }
    }
    if (edges.length === 0) return []

    const edgeByStart = new Map<string, OutlineEdge>()
    for (const edge of edges) edgeByStart.set(pointKey(edge.start), edge)

    const firstEdge = edges[0]
    const startKey = pointKey(firstEdge.start)
    const outline: Point[] = []
    let currentEdge: OutlineEdge | undefined = firstEdge
    while (currentEdge && outline.length <= edges.length) {
        outline.push(currentEdge.start)
        const endKey = pointKey(currentEdge.end)
        if (endKey === startKey) break
        currentEdge = edgeByStart.get(endKey)
    }
    return simplifyColinear(outline)
}

export const getKeyPolygonU = (key: KleKey) => {
    const origin = { x: key.rotationX, y: key.rotationY }
    const primary: AxisAlignedRect = { left: key.x, top: key.y, right: key.x + key.width, bottom: key.y + key.height }
    const hasSecondary = !(key.x2 === 0 && key.y2 === 0 && key.width2 === key.width && key.height2 === key.height)
    if (!hasSecondary) {
        return [
            { x: primary.left, y: primary.top },
            { x: primary.right, y: primary.top },
            { x: primary.right, y: primary.bottom },
            { x: primary.left, y: primary.bottom },
        ].map((point) => rotatePoint(point, origin, key.rotationAngle))
    }
    const secondary: AxisAlignedRect = {
        left: key.x + key.x2,
        top: key.y + key.y2,
        right: key.x + key.x2 + key.width2,
        bottom: key.y + key.y2 + key.height2,
    }
    return unionRectilinearOutline(primary, secondary).map((point) => rotatePoint(point, origin, key.rotationAngle))
}

export const getKeyCenterU = (key: KleKey) => {
    const center = { x: key.x + key.width / 2, y: key.y + key.height / 2 }
    return rotatePoint(center, { x: key.rotationX, y: key.rotationY }, key.rotationAngle)
}

export const getKeyCenterMm = (key: KleKey) => {
    const center = getKeyCenterU(key)
    return { x: center.x * KEY_UNIT_MM, y: center.y * KEY_UNIT_MM }
}

export const getKeyboardBoundsU = (keys: KleKey[]) => {
    if (keys.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const key of keys) {
        for (const point of getKeyPolygonU(key)) {
            if (point.x < minX) minX = point.x
            if (point.y < minY) minY = point.y
            if (point.x > maxX) maxX = point.x
            if (point.y > maxY) maxY = point.y
        }
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}
