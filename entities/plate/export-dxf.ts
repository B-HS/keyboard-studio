import { Point } from '@entities/kle/geometry'
import { PlateGeometry } from './types'

const DXF_UNIT_MILLIMETERS = 4
const CLOSED_POLYLINE_FLAG = 1
const VERTICES_FOLLOW_FLAG = 1
const DEFAULT_LAYER = '0'

const pair = (code: number, value: string | number) => `${code}\n${value}`

const polygonToDxf = (polygon: Point[]) => {
    const lines = [pair(0, 'POLYLINE'), pair(8, DEFAULT_LAYER), pair(66, VERTICES_FOLLOW_FLAG), pair(70, CLOSED_POLYLINE_FLAG)]
    for (const point of polygon) {
        lines.push(pair(0, 'VERTEX'), pair(8, DEFAULT_LAYER), pair(10, point.x), pair(20, point.y), pair(30, 0))
    }
    lines.push(pair(0, 'SEQEND'), pair(8, DEFAULT_LAYER))
    return lines
}

export const plateToDxf = (plate: PlateGeometry) => {
    const polygons = [plate.outline, ...plate.holes]
    const lines = [
        pair(0, 'SECTION'),
        pair(2, 'HEADER'),
        pair(9, '$INSUNITS'),
        pair(70, DXF_UNIT_MILLIMETERS),
        pair(0, 'ENDSEC'),
        pair(0, 'SECTION'),
        pair(2, 'ENTITIES'),
        ...polygons.flatMap(polygonToDxf),
        pair(0, 'ENDSEC'),
        pair(0, 'EOF'),
    ]
    return `${lines.join('\n')}\n`
}
