import { Point, roundCoordinate } from '@entities/kle/geometry'
import { PlateGeometry } from './types'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const OUTLINE_COLOR = '#000000'
const HAIRLINE_STROKE_MM = 0.1

const polygonToPath = (polygon: Point[]) =>
    `${polygon.map((point, index) => `${index === 0 ? 'M' : 'L'}${roundCoordinate(point.x)} ${roundCoordinate(point.y)}`).join(' ')} Z`

export const plateToSvg = (plate: PlateGeometry) => {
    const xs = plate.outline.map((point) => point.x)
    const ys = plate.outline.map((point) => point.y)
    const minX = roundCoordinate(Math.min(...xs))
    const minY = roundCoordinate(Math.min(...ys))
    const width = roundCoordinate(plate.widthMm)
    const height = roundCoordinate(plate.heightMm)
    const path = [plate.outline, ...plate.holes].map(polygonToPath).join(' ')

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NAMESPACE}" width="${width}mm" height="${height}mm" viewBox="${minX} ${minY} ${width} ${height}"><path fill-rule="evenodd" fill="none" stroke="${OUTLINE_COLOR}" stroke-width="${HAIRLINE_STROKE_MM}" d="${path}" /></svg>
`
}
