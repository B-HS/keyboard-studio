import { isEncoderKey } from '@entities/kle/encoder'
import { getKeyCenterMm, getKeyPolygonU, KEY_UNIT_MM, Point, roundCoordinate } from '@entities/kle/geometry'
import { KleKeyboard } from '@entities/kle/types'
import { assignMatrix } from '@entities/pcb/matrix'

type Axis = 'row' | 'col'

type WiringNode = {
    keyIndex: number
    row: number
    col: number
    center: Point
    polygon: Point[]
    isEncoder: boolean
}

const compareByX = (left: WiringNode, right: WiringNode) => left.center.x - right.center.x || left.center.y - right.center.y
const compareByY = (left: WiringNode, right: WiringNode) => left.center.y - right.center.y || left.center.x - right.center.x

const buildLines = (nodes: WiringNode[], axis: Axis, compare: (left: WiringNode, right: WiringNode) => number) => {
    const groups = new Map<number, WiringNode[]>()
    for (const node of nodes) {
        const index = node[axis]
        const bucket = groups.get(index)
        if (bucket) bucket.push(node)
        else groups.set(index, [node])
    }
    return Array.from(groups.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([index, members]) => ({ index, points: [...members].sort(compare).map((member) => member.center) }))
}

const computeBounds = (nodes: WiringNode[]) => {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const node of nodes) {
        for (const point of node.polygon) {
            if (point.x < minX) minX = point.x
            if (point.y < minY) minY = point.y
            if (point.x > maxX) maxX = point.x
            if (point.y > maxY) maxY = point.y
        }
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export const buildWiringDiagram = (keyboard: KleKeyboard) => {
    const matrix = assignMatrix(keyboard.keys)
    const nodes: WiringNode[] = keyboard.keys
        .map((key, keyIndex) => ({ key, keyIndex, cell: matrix.perKey[keyIndex] }))
        .filter(({ cell }) => cell.row >= 0 && cell.col >= 0)
        .map(({ key, keyIndex, cell }) => ({
            keyIndex,
            row: cell.row,
            col: cell.col,
            center: getKeyCenterMm(key),
            polygon: getKeyPolygonU(key).map((point) => ({ x: roundCoordinate(point.x * KEY_UNIT_MM), y: roundCoordinate(point.y * KEY_UNIT_MM) })),
            isEncoder: isEncoderKey(key),
        }))

    const rows = buildLines(nodes, 'row', compareByX)
    const cols = buildLines(nodes, 'col', compareByY)
    return { nodes, rows, cols, rowCount: matrix.rows, colCount: matrix.cols, bounds: computeBounds(nodes) }
}

export type WiringDiagram = ReturnType<typeof buildWiringDiagram>

const RAMP_SATURATION = 70
const RAMP_LIGHTNESS = 52
const RAMP_LIGHTNESS_SPREAD = 12
const ROW_HUE = 8
const ROW_HUE_SPREAD = 40
const COL_HUE = 205
const COL_HUE_SPREAD = 48

const normalizeHue = (hue: number) => ((hue % 360) + 360) % 360

const rampColor = (baseHue: number, spread: number, index: number, count: number) => {
    const ratio = count <= 1 ? 0.5 : index / (count - 1)
    const hue = normalizeHue(baseHue - spread / 2 + spread * ratio)
    const lightness = RAMP_LIGHTNESS + (ratio - 0.5) * RAMP_LIGHTNESS_SPREAD
    return `hsl(${roundCoordinate(hue)}, ${RAMP_SATURATION}%, ${roundCoordinate(lightness)}%)`
}

export const wiringRowColor = (index: number, count: number) => rampColor(ROW_HUE, ROW_HUE_SPREAD, index, count)

export const wiringColColor = (index: number, count: number) => rampColor(COL_HUE, COL_HUE_SPREAD, index, count)

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const SVG_PADDING_MM = 10
const BACKGROUND_FILL = '#ffffff'
const OUTLINE_FILL = '#f1f3f5'
const OUTLINE_STROKE = '#c4c9d0'
const NODE_FILL = '#495057'
const ENCODER_STROKE = '#7048e8'
const LABEL_FILL = '#343a40'
const LEGEND_FILL = '#495057'
const WIRE_STROKE_MM = 1.1
const OUTLINE_STROKE_MM = 0.3
const NODE_RADIUS_MM = 1.1
const ENCODER_RADIUS_MM = 4.5
const ENCODER_STROKE_MM = 0.6
const LABEL_FONT_MM = 3.6
const LABEL_OFFSET_MM = 3
const LEGEND_FONT_MM = 3.6
const LEGEND_SWATCH_MM = 6
const LEGEND_ROW_MM = 6

const polygonPath = (polygon: Point[]) =>
    `${polygon.map((point, index) => `${index === 0 ? 'M' : 'L'}${roundCoordinate(point.x)} ${roundCoordinate(point.y)}`).join(' ')} Z`

const polylinePoints = (points: Point[]) => points.map((point) => `${roundCoordinate(point.x)},${roundCoordinate(point.y)}`).join(' ')

export const wiringDiagramToSvg = (diagram: WiringDiagram) => {
    const { bounds } = diagram
    const viewMinX = roundCoordinate(bounds.minX - SVG_PADDING_MM)
    const viewMinY = roundCoordinate(bounds.minY - SVG_PADDING_MM)
    const viewWidth = roundCoordinate(bounds.width + SVG_PADDING_MM * 2)
    const viewHeight = roundCoordinate(bounds.height + SVG_PADDING_MM * 2)

    const parts: string[] = []
    parts.push(`<rect x="${viewMinX}" y="${viewMinY}" width="${viewWidth}" height="${viewHeight}" fill="${BACKGROUND_FILL}" />`)

    for (const node of diagram.nodes) {
        parts.push(`<path d="${polygonPath(node.polygon)}" fill="${OUTLINE_FILL}" stroke="${OUTLINE_STROKE}" stroke-width="${OUTLINE_STROKE_MM}" />`)
    }

    for (const line of diagram.cols) {
        parts.push(
            `<polyline points="${polylinePoints(line.points)}" fill="none" stroke="${wiringColColor(line.index, diagram.colCount)}" stroke-width="${WIRE_STROKE_MM}" stroke-linecap="round" stroke-linejoin="round" />`,
        )
    }
    for (const line of diagram.rows) {
        parts.push(
            `<polyline points="${polylinePoints(line.points)}" fill="none" stroke="${wiringRowColor(line.index, diagram.rowCount)}" stroke-width="${WIRE_STROKE_MM}" stroke-linecap="round" stroke-linejoin="round" />`,
        )
    }

    for (const node of diagram.nodes) {
        const cx = roundCoordinate(node.center.x)
        const cy = roundCoordinate(node.center.y)
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${NODE_RADIUS_MM}" fill="${NODE_FILL}" />`)
        if (node.isEncoder)
            parts.push(
                `<circle cx="${cx}" cy="${cy}" r="${ENCODER_RADIUS_MM}" fill="none" stroke="${ENCODER_STROKE}" stroke-width="${ENCODER_STROKE_MM}" />`,
            )
    }

    for (const line of diagram.rows) {
        const last = line.points[line.points.length - 1]
        if (!last) continue
        parts.push(
            `<text x="${roundCoordinate(last.x + LABEL_OFFSET_MM)}" y="${roundCoordinate(last.y)}" fill="${LABEL_FILL}" font-size="${LABEL_FONT_MM}" font-family="sans-serif" dominant-baseline="central">R${line.index}</text>`,
        )
    }
    for (const line of diagram.cols) {
        const last = line.points[line.points.length - 1]
        if (!last) continue
        parts.push(
            `<text x="${roundCoordinate(last.x)}" y="${roundCoordinate(last.y + LABEL_OFFSET_MM + LABEL_FONT_MM)}" fill="${LABEL_FILL}" font-size="${LABEL_FONT_MM}" font-family="sans-serif" text-anchor="middle">C${line.index}</text>`,
        )
    }

    const legendX = viewMinX + SVG_PADDING_MM
    const legendRowY = viewMinY + SVG_PADDING_MM
    const legendColY = legendRowY + LEGEND_ROW_MM
    parts.push(
        `<line x1="${roundCoordinate(legendX)}" y1="${roundCoordinate(legendRowY)}" x2="${roundCoordinate(legendX + LEGEND_SWATCH_MM)}" y2="${roundCoordinate(legendRowY)}" stroke="${wiringRowColor(0, 1)}" stroke-width="${WIRE_STROKE_MM}" stroke-linecap="round" />`,
        `<text x="${roundCoordinate(legendX + LEGEND_SWATCH_MM + 2)}" y="${roundCoordinate(legendRowY)}" fill="${LEGEND_FILL}" font-size="${LEGEND_FONT_MM}" font-family="sans-serif" dominant-baseline="central">Rows</text>`,
        `<line x1="${roundCoordinate(legendX)}" y1="${roundCoordinate(legendColY)}" x2="${roundCoordinate(legendX + LEGEND_SWATCH_MM)}" y2="${roundCoordinate(legendColY)}" stroke="${wiringColColor(0, 1)}" stroke-width="${WIRE_STROKE_MM}" stroke-linecap="round" />`,
        `<text x="${roundCoordinate(legendX + LEGEND_SWATCH_MM + 2)}" y="${roundCoordinate(legendColY)}" fill="${LEGEND_FILL}" font-size="${LEGEND_FONT_MM}" font-family="sans-serif" dominant-baseline="central">Columns</text>`,
    )

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NAMESPACE}" width="${viewWidth}mm" height="${viewHeight}mm" viewBox="${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}">${parts.join('')}</svg>
`
}
