import { booleans, extrusions, geometries } from '@jscad/modeling'
import { serialize } from '@jscad/stl-serializer'
import { Point } from '@entities/kle/geometry'
import { toCounterClockwise } from './generate'
import { PlateGeometry } from './types'

const toVec2List = (points: Point[]) => toCounterClockwise(points).map((point): [number, number] => [point.x, point.y])

export const plateToStl = (plate: PlateGeometry, thicknessMm: number) => {
    const outline = geometries.geom2.fromPoints(toVec2List(plate.outline))
    const holes = plate.holes.map((hole) => geometries.geom2.fromPoints(toVec2List(hole)))
    const profile = holes.length > 0 ? booleans.subtract(outline, ...holes) : outline
    const solid = extrusions.extrudeLinear({ height: thicknessMm }, profile)
    return serialize({ binary: true }, solid)
}
