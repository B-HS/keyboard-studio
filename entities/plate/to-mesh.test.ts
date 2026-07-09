import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { buildPlate } from './generate'
import { plateToStl } from './export-stl'
import { DEFAULT_PLATE_OPTIONS } from './types'
import { plateToMesh } from './to-mesh'

const STL_HEADER_BYTES = 80
const COORDS_PER_TRIANGLE = 9

const readTriangleCount = (buffers: ArrayBuffer[]) => {
    const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const buffer of buffers) {
        merged.set(new Uint8Array(buffer), offset)
        offset += buffer.byteLength
    }
    return new DataView(merged.buffer).getUint32(STL_HEADER_BYTES, true)
}

describe('plateToMesh', () => {
    test('emits flat arrays whose triangle count matches the binary stl header', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const triangleCount = readTriangleCount(plateToStl(plate, DEFAULT_PLATE_OPTIONS.thickness))
        const mesh = plateToMesh(plate, DEFAULT_PLATE_OPTIONS.thickness)

        expect(triangleCount).toBeGreaterThan(0)
        expect(mesh.positions.length).toBe(triangleCount * COORDS_PER_TRIANGLE)
        expect(mesh.normals.length).toBe(triangleCount * COORDS_PER_TRIANGLE)
    })

    test('produces only finite coordinate and normal values', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const mesh = plateToMesh(plate, DEFAULT_PLATE_OPTIONS.thickness)

        expect(mesh.positions.every((value) => Number.isFinite(value))).toBe(true)
        expect(mesh.normals.every((value) => Number.isFinite(value))).toBe(true)
    })
})
