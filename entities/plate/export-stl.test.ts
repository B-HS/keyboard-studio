import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { buildPlate } from './generate'
import { plateToStl } from './export-stl'
import { DEFAULT_PLATE_OPTIONS } from './types'

const BINARY_STL_TRIANGLE_COUNT_BUFFER_INDEX = 1

describe('plateToStl', () => {
    test('serializes a non-empty binary STL with a positive triangle count', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const buffers = plateToStl(plate, DEFAULT_PLATE_OPTIONS.thickness)

        expect(Array.isArray(buffers)).toBe(true)
        expect(buffers.length).toBeGreaterThan(0)
        expect(buffers.every((buffer) => buffer instanceof ArrayBuffer)).toBe(true)

        const triangleCount = new Uint32Array(buffers[BINARY_STL_TRIANGLE_COUNT_BUFFER_INDEX])[0]
        expect(triangleCount).toBeGreaterThan(0)
    })
})
