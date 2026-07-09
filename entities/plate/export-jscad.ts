import { Point } from '@entities/kle/geometry'
import { toCounterClockwise } from './generate'
import { PlateGeometry } from './types'

const COORDINATE_PRECISION = 4

const roundCoordinate = (value: number) => Number(value.toFixed(COORDINATE_PRECISION))

const serializePolygon = (points: Point[]) =>
    JSON.stringify(toCounterClockwise(points).map((point) => [roundCoordinate(point.x), roundCoordinate(point.y)]))

export const plateToJscadScript = (plate: PlateGeometry, thicknessMm: number) => {
    const outline = serializePolygon(plate.outline)
    const holes = `[${plate.holes.map(serializePolygon).join(', ')}]`
    return `const { booleans, extrusions, geometries } = require('@jscad/modeling')

const outline = ${outline}
const holes = ${holes}
const thickness = ${thicknessMm}

const main = () => {
    const plate = geometries.geom2.fromPoints(outline)
    const cutouts = holes.map((hole) => geometries.geom2.fromPoints(hole))
    const profile = cutouts.length > 0 ? booleans.subtract(plate, ...cutouts) : plate
    return extrusions.extrudeLinear({ height: thickness }, profile)
}

module.exports = { main }
`
}
